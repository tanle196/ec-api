import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Big from 'big.js';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { toMoney } from '@/common/utils/money.util';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import {
  CreateStockReceiptDto,
  StockReceiptItemDto,
} from './dto/create-stock-receipt.dto';
import { StockReceiptQueryDto } from './dto/stock-receipt-query.dto';
import { UpdateStockReceiptDto } from './dto/update-stock-receipt.dto';
import { StockReceiptItem } from './entities/stock-receipt-item.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { StockReceiptStatus } from './enums/stock-receipt-status.enum';
import { InventoryService } from './inventory.service';
import { StockReceiptPolicy } from './policies/stock-receipt.policy';

@Injectable()
export class StockReceiptsService {
  constructor(
    @InjectRepository(StockReceipt)
    private readonly receiptRepo: Repository<StockReceipt>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly receiptPolicy: StockReceiptPolicy,
  ) {}

  async create(
    dto: CreateStockReceiptDto,
    actorId: string,
  ): Promise<StockReceipt> {
    const items = await this.buildItems(dto.items);

    const saved = await this.receiptRepo.save(
      this.receiptRepo.create({
        code: this.generateCode(),
        supplier: dto.supplier ?? null,
        note: dto.note ?? null,
        status: StockReceiptStatus.DRAFT,
        totalCost: this.totalCost(items),
        createdBy: actorId,
        items,
      }),
    );
    return this.findOne(saved.id);
  }

  async findAll(
    query: StockReceiptQueryDto,
  ): Promise<PaginatedResponseDto<StockReceipt>> {
    const { page = 1, limit = 20, status } = query;
    const [data, total] = await this.receiptRepo.findAndCount({
      where: status ? { status } : {},
      relations: ['items'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<StockReceipt> {
    const receipt = await this.receiptRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!receipt) throw new NotFoundException('Stock receipt not found');
    return receipt;
  }

  async update(id: string, dto: UpdateStockReceiptDto): Promise<StockReceipt> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await this.lockReceipt(manager, id);
      this.receiptPolicy.assertDraft(receipt);

      const changes: Partial<
        Pick<StockReceipt, 'supplier' | 'note' | 'totalCost'>
      > = {};
      if (dto.supplier !== undefined) changes.supplier = dto.supplier;
      if (dto.note !== undefined) changes.note = dto.note;

      if (dto.items) {
        const items = await this.buildItems(dto.items);
        await manager.delete(StockReceiptItem, { receipt_id: id });
        await manager.save(
          StockReceiptItem,
          items.map((item) => ({ ...item, receipt_id: id })),
        );
        changes.totalCost = this.totalCost(items);
      }

      if (Object.keys(changes).length) {
        await manager.update(StockReceipt, id, changes);
      }
    });
    return this.findOne(id);
  }

  /**
   * Books the receipt into stock. The receipt row is locked first, so two
   * concurrent confirms can't both add the goods.
   */
  async confirm(id: string, actorId: string): Promise<StockReceipt> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await this.lockReceipt(manager, id);
      this.receiptPolicy.assertDraft(receipt);

      const items = await manager.find(StockReceiptItem, {
        where: { receipt_id: id },
      });
      // Same variant-id lock order as every other stock writer.
      const sorted = [...items].sort((a, b) =>
        (a.variant_id ?? '').localeCompare(b.variant_id ?? ''),
      );

      for (const item of sorted) {
        if (!item.variant_id) {
          throw new NotFoundException(
            `Variant ${item.sku} was deleted; remove it from the receipt first`,
          );
        }
        await this.inventoryService.receive(
          manager,
          {
            variantId: item.variant_id,
            quantity: item.quantity,
            unitCost: Number(item.unitCost),
          },
          { refType: 'stock_receipt', refId: id, actorId, note: receipt.code },
        );
      }

      await manager.update(StockReceipt, id, {
        status: StockReceiptStatus.CONFIRMED,
        confirmedBy: actorId,
        confirmedAt: new Date(),
      });
    });
    return this.findOne(id);
  }

  async cancel(id: string): Promise<StockReceipt> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await this.lockReceipt(manager, id);
      this.receiptPolicy.assertDraft(receipt);
      await manager.update(StockReceipt, id, {
        status: StockReceiptStatus.CANCELLED,
      });
    });
    return this.findOne(id);
  }

  private async lockReceipt(
    manager: EntityManager,
    id: string,
  ): Promise<StockReceipt> {
    const receipt = await manager.findOne(StockReceipt, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!receipt) throw new NotFoundException('Stock receipt not found');
    return receipt;
  }

  private async buildItems(
    items: StockReceiptItemDto[],
  ): Promise<Partial<StockReceiptItem>[]> {
    this.receiptPolicy.assertNoDuplicateVariants(items);

    const variants = await this.variantRepo.find({
      where: { id: In(items.map((i) => i.variant_id)) },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    return items.map((item) => {
      const variant = byId.get(item.variant_id);
      if (!variant) {
        throw new NotFoundException(`Variant ${item.variant_id} not found`);
      }
      return {
        variant_id: variant.id,
        sku: variant.sku,
        quantity: item.quantity,
        unitCost: item.unitCost,
      };
    });
  }

  private totalCost(items: Partial<StockReceiptItem>[]): number {
    return toMoney(
      items.reduce(
        (sum, i) =>
          sum.plus(new Big(Number(i.unitCost)).times(i.quantity as number)),
        new Big(0),
      ),
    );
  }

  private generateCode(): string {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 10).toUpperCase();
    return `RCV-${datePart}-${random}`;
  }
}
