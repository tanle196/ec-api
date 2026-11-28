import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { InventoryMovementQueryDto } from './dto/inventory-movement-query.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
import { VariantStockQueryDto } from './dto/variant-stock-query.dto';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { InventoryMovementReason } from './enums/inventory-movement-reason.enum';
import { InventoryPolicy } from './policies/inventory.policy';

export interface StockLine {
  variantId: string;
  quantity: number;
}

type MovementRow = Pick<
  InventoryMovement,
  | 'variant_id'
  | 'sku'
  | 'reason'
  | 'onHandDelta'
  | 'reservedDelta'
  | 'refType'
  | 'refId'
  | 'actorId'
  | 'note'
>;

// What a movement is attributed to.
export interface StockRef {
  refType: string;
  refId: string;
  actorId?: string | null;
  note?: string | null;
}

/**
 * The only writer of ProductVariant.stock / .reserved. Each method changes
 * the counters and appends the matching inventory_movements rows in the
 * caller's transaction (`manager`), so the ledger can never drift from the
 * counters by a partial write.
 *
 * Methods that touch several variants lock them in variant-id order, the
 * same order every other caller uses, so two transactions sharing variants
 * can't deadlock on each other.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    private readonly dataSource: DataSource,
    private readonly inventoryPolicy: InventoryPolicy,
  ) {}

  /**
   * Holds stock for an order: available -> reserved. Uses a conditional
   * UPDATE (stock >= qty AND active) so concurrent orders for the last
   * units can't both succeed; the loser gets a 422.
   */
  async reserve(
    manager: EntityManager,
    lines: StockLine[],
    ref: StockRef,
  ): Promise<void> {
    const movements: MovementRow[] = [];

    for (const line of this.normalize(lines)) {
      const result = await manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({
          stock: () => 'stock - :qty',
          reserved: () => 'reserved + :qty',
        })
        .where('id = :id AND stock >= :qty AND "isActive" = true', {
          id: line.variantId,
          qty: line.quantity,
        })
        .returning(['sku'])
        .execute();

      if (result.affected === 0) {
        await this.throwNotReservable(manager, line.variantId);
      }

      const [{ sku }] = result.raw as { sku: string }[];
      movements.push(
        this.movement(line.variantId, sku, ref, {
          reason: InventoryMovementReason.ORDER_RESERVE,
          onHandDelta: 0,
          reservedDelta: line.quantity,
        }),
      );
    }

    await this.insertMovements(manager, movements);
  }

  /**
   * Gives an order's hold back: reserved -> available. Lines whose variant
   * was deleted are skipped. If a variant holds less than the line (data
   * that predates the ledger, or a bug), the shortfall is restored to
   * available as found stock and recorded as such, so the ledger still
   * matches the counters and the audit can flag it.
   */
  async release(
    manager: EntityManager,
    lines: StockLine[],
    ref: StockRef,
  ): Promise<void> {
    const movements: MovementRow[] = [];

    for (const line of this.normalize(lines)) {
      const variant = await this.lockVariant(manager, line.variantId);
      if (!variant) continue;

      const fromReserved = Math.min(variant.reserved, line.quantity);
      const shortfall = line.quantity - fromReserved;
      if (shortfall > 0) {
        this.logger.error(
          `Releasing ${line.quantity} of ${variant.sku} for ${ref.refType} ${ref.refId} but only ${variant.reserved} reserved`,
        );
      }

      await manager.update(ProductVariant, variant.id, {
        stock: variant.stock + line.quantity,
        reserved: variant.reserved - fromReserved,
      });
      movements.push(
        this.movement(variant.id, variant.sku, ref, {
          reason: InventoryMovementReason.ORDER_RELEASE,
          onHandDelta: shortfall,
          reservedDelta: -fromReserved,
        }),
      );
    }

    await this.insertMovements(manager, movements);
  }

  /**
   * An order left the warehouse: its reserved units are no longer on hand.
   * Returns each variant's current average cost, which the order snapshots
   * as the line's unit cost.
   */
  async ship(
    manager: EntityManager,
    lines: StockLine[],
    ref: StockRef,
  ): Promise<Map<string, number | null>> {
    const costs = new Map<string, number | null>();
    const movements: MovementRow[] = [];

    for (const line of this.normalize(lines)) {
      const variant = await this.lockVariant(manager, line.variantId);
      if (!variant) continue;

      // Normally the whole line is reserved. Anything not reserved has to
      // come out of available stock, which must then cover it.
      const fromReserved = Math.min(variant.reserved, line.quantity);
      const fromAvailable = line.quantity - fromReserved;
      this.inventoryPolicy.assertCanShip(variant, fromAvailable);

      await manager.update(ProductVariant, variant.id, {
        stock: variant.stock - fromAvailable,
        reserved: variant.reserved - fromReserved,
      });
      movements.push(
        this.movement(variant.id, variant.sku, ref, {
          reason: InventoryMovementReason.ORDER_SHIP,
          onHandDelta: -line.quantity,
          reservedDelta: -fromReserved,
        }),
      );
      costs.set(variant.id, variant.avgCost);
    }

    await this.insertMovements(manager, movements);
    return costs;
  }

  /**
   * Adds received goods and folds their cost into the variant's weighted
   * average cost: (onHand * avg + qty * cost) / (onHand + qty). With nothing
   * on hand (or no cost yet) the new cost simply becomes the average.
   */
  async receive(
    manager: EntityManager,
    line: StockLine & { unitCost: number },
    ref: StockRef,
  ): Promise<void> {
    const variant = await this.lockVariant(manager, line.variantId);
    if (!variant) {
      throw new NotFoundException(`Variant ${line.variantId} not found`);
    }

    const onHand = variant.stock + variant.reserved;
    const avgCost = this.inventoryPolicy.weightedAverageCost(
      onHand,
      variant.avgCost,
      line.quantity,
      line.unitCost,
    );

    await manager.update(ProductVariant, variant.id, {
      stock: variant.stock + line.quantity,
      avgCost,
    });
    await this.insertMovements(manager, [
      this.movement(variant.id, variant.sku, ref, {
        reason: InventoryMovementReason.PURCHASE_IN,
        onHandDelta: line.quantity,
        reservedDelta: 0,
      }),
    ]);
  }

  /**
   * Manual correction, given either the counted on-hand quantity
   * (stocktake) or a delta. Reserved units are left alone, so on hand can't
   * go below what is reserved for open orders.
   */
  async adjust(params: {
    variantId: string;
    onHand?: number;
    delta?: number;
    note: string;
    actorId: string;
  }): Promise<ProductVariant> {
    return this.dataSource.transaction(async (manager) => {
      const variant = await this.lockVariant(manager, params.variantId);
      if (!variant) throw new NotFoundException('Variant not found');

      const delta = this.inventoryPolicy.resolveAdjustmentDelta(variant, {
        onHand: params.onHand,
        delta: params.delta,
      });

      await this.applyAdjustment(manager, variant, delta, {
        refType: 'adjustment',
        refId: variant.id,
        actorId: params.actorId,
        note: params.note,
      });

      return manager.findOneOrFail(ProductVariant, {
        where: { id: variant.id },
      });
    });
  }

  /**
   * For a variant edit that sets `stock` directly (the admin product form):
   * treats the new value as the new available quantity and records the
   * difference as an adjustment. `variant` must already be locked.
   */
  async setAvailable(
    manager: EntityManager,
    variant: ProductVariant,
    available: number,
    actorId: string | null,
  ): Promise<void> {
    const delta = available - variant.stock;
    if (delta === 0) return;
    await this.applyAdjustment(manager, variant, delta, {
      refType: 'adjustment',
      refId: variant.id,
      actorId,
      note: 'Stock set from the product form',
    });
  }

  // Opening entries for newly created variants, saved with their stock.
  async recordInitialStock(
    manager: EntityManager,
    variants: Pick<ProductVariant, 'id' | 'sku' | 'stock'>[],
    actorId: string | null = null,
  ): Promise<void> {
    await this.insertMovements(
      manager,
      variants
        .filter((v) => v.stock > 0)
        .map((v) =>
          this.movement(
            v.id,
            v.sku,
            { refType: 'variant', refId: v.id, actorId },
            {
              reason: InventoryMovementReason.INITIAL_STOCK,
              onHandDelta: v.stock,
              reservedDelta: 0,
            },
          ),
        ),
    );
  }

  async findMovements(
    query: InventoryMovementQueryDto,
  ): Promise<PaginatedResponseDto<InventoryMovement>> {
    const {
      page = 1,
      limit = 20,
      variant_id,
      reason,
      ref_type,
      ref_id,
    } = query;

    const qb = this.movementRepo.createQueryBuilder('m');
    if (variant_id) qb.andWhere('m.variant_id = :variant_id', { variant_id });
    if (reason) qb.andWhere('m.reason = :reason', { reason });
    if (ref_type) qb.andWhere('m.refType = :ref_type', { ref_type });
    if (ref_id) qb.andWhere('m.refId = :ref_id', { ref_id });

    const [data, total] = await qb
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findVariantStock(
    query: VariantStockQueryDto,
  ): Promise<PaginatedResponseDto<ProductVariant>> {
    const { page = 1, limit = 20, product_id, search } = query;

    const qb = this.variantRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.product', 'p');
    if (product_id) qb.andWhere('v.product_id = :product_id', { product_id });
    if (search) {
      qb.andWhere('(v.sku ILIKE :search OR v.name ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('v.sku', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findLowStock(
    query: LowStockQueryDto,
  ): Promise<PaginatedResponseDto<ProductVariant>> {
    const { page = 1, limit = 20 } = query;

    const [data, total] = await this.variantRepo
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.product', 'p')
      .where('v."lowStockThreshold" IS NOT NULL')
      .andWhere('v.stock <= v."lowStockThreshold"')
      .andWhere('v."isActive" = true')
      .orderBy('v.stock', 'ASC')
      .addOrderBy('v.sku', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  private async applyAdjustment(
    manager: EntityManager,
    variant: ProductVariant,
    delta: number,
    ref: StockRef,
  ): Promise<void> {
    await manager.update(ProductVariant, variant.id, {
      stock: variant.stock + delta,
    });
    await this.insertMovements(manager, [
      this.movement(variant.id, variant.sku, ref, {
        reason: InventoryMovementReason.ADJUSTMENT,
        onHandDelta: delta,
        reservedDelta: 0,
      }),
    ]);
  }

  private lockVariant(
    manager: EntityManager,
    id: string,
  ): Promise<ProductVariant | null> {
    return manager.findOne(ProductVariant, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // Merges repeated variants and sorts by id: one counter update per
  // variant, always locked in the same global order.
  private normalize(lines: StockLine[]): StockLine[] {
    const byVariant = new Map<string, number>();
    for (const line of lines) {
      byVariant.set(
        line.variantId,
        (byVariant.get(line.variantId) ?? 0) + line.quantity,
      );
    }
    return [...byVariant.entries()]
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId));
  }

  private async throwNotReservable(
    manager: EntityManager,
    variantId: string,
  ): Promise<never> {
    const current = await manager.findOne(ProductVariant, {
      where: { id: variantId },
    });
    const sku = current?.sku ?? variantId;
    if (current && !current.isActive) {
      throw new UnprocessableEntityException(
        `Variant ${sku} is no longer available`,
      );
    }
    throw new UnprocessableEntityException(
      `Insufficient stock for variant ${sku}`,
    );
  }

  private movement(
    variantId: string,
    sku: string,
    ref: StockRef,
    change: Pick<InventoryMovement, 'reason' | 'onHandDelta' | 'reservedDelta'>,
  ): MovementRow {
    return {
      variant_id: variantId,
      sku,
      ...change,
      refType: ref.refType,
      refId: ref.refId,
      actorId: ref.actorId ?? null,
      note: ref.note ?? null,
    };
  }

  private async insertMovements(
    manager: EntityManager,
    movements: MovementRow[],
  ): Promise<void> {
    if (movements.length === 0) return;
    await manager.insert(InventoryMovement, movements);
  }
}
