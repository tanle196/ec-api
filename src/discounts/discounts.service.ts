import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, In, Repository } from 'typeorm';
import Big from 'big.js';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { allocateProportionally } from '@/common/utils/allocation.util';
import { toMoney } from '@/common/utils/money.util';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { DiscountListQueryDto } from './dto/discount-list-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import { ValidateDiscountResponseDto } from './dto/discount-response.dto';
import { Discount } from './entities/discount.entity';
import { DiscountRedemption } from './entities/discount-redemption.entity';
import { DiscountRedemptionStatus } from './enums/discount-redemption-status.enum';
import { DiscountType } from './enums/discount-type.enum';
import { DiscountPolicy } from './policies/discount.policy';

// One order line as the discount engine sees it. `amount` is what is still
// left to discount on the line. productId/categoryId are null only for the
// synthetic single line used when validating against a bare subtotal.
export interface DiscountLine {
  productId: string | null;
  categoryId: string | null;
  amount: number;
}

export interface DiscountQuote {
  amount: number;
  // Aligned with the input lines; sums exactly to `amount`.
  lineAmounts: number[];
}

@Injectable()
export class DiscountsService {
  constructor(
    @InjectRepository(Discount)
    private readonly discountRepo: Repository<Discount>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly discountPolicy: DiscountPolicy,
  ) {}

  async create(dto: CreateDiscountDto): Promise<Discount> {
    const existing = await this.discountRepo.findOne({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) throw new ConflictException('Discount code already exists');

    this.discountPolicy.assertValidValue(dto.type, dto.value);

    const discount = this.discountRepo.create({
      ...dto,
      code: dto.code.toUpperCase(),
      isActive: dto.isActive ?? true,
    });

    return this.discountRepo.save(discount);
  }

  async findAll(
    query: DiscountListQueryDto,
  ): Promise<PaginatedResponseDto<Discount>> {
    const { page = 1, limit = 20, search, isActive } = query;

    const where: Record<string, unknown> = {};
    if (search) where['code'] = ILike(`%${search}%`);
    if (isActive !== undefined) where['isActive'] = isActive;

    const [data, total] = await this.discountRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Discount> {
    const discount = await this.discountRepo.findOne({ where: { id } });
    if (!discount) throw new NotFoundException('Discount not found');
    return discount;
  }

  async update(id: string, dto: UpdateDiscountDto): Promise<Discount> {
    const discount = await this.findOne(id);

    if (dto.code && dto.code.toUpperCase() !== discount.code) {
      const conflict = await this.discountRepo.findOne({
        where: { code: dto.code.toUpperCase() },
      });
      if (conflict) throw new ConflictException('Discount code already exists');
      dto.code = dto.code.toUpperCase();
    }

    // Checked against the merged result so changing only `type` (or only
    // `value`) can't produce e.g. a 500% percent discount.
    this.discountPolicy.assertValidValue(
      dto.type ?? discount.type,
      dto.value ?? Number(discount.value),
    );

    Object.assign(discount, dto);
    return this.discountRepo.save(discount);
  }

  async remove(id: string): Promise<void> {
    const discount = await this.findOne(id);
    await this.discountRepo.remove(discount);
  }

  async validate(
    dto: ValidateDiscountDto,
    userId?: string,
  ): Promise<ValidateDiscountResponseDto> {
    const lines = dto.items ? await this.linesForItems(dto.items) : null;
    if (!lines && dto.subtotal === undefined) {
      throw new BadRequestException('Either items or subtotal is required');
    }

    const subtotal = lines
      ? toMoney(lines.reduce((sum, l) => sum.plus(l.amount), new Big(0)))
      : (dto.subtotal as number);

    const discount = await this.resolveCode(dto.code, subtotal, userId);

    if (!lines && this.isScoped(discount)) {
      throw new BadRequestException(
        'This code only applies to some products; send the items to validate it',
      );
    }

    // Unscoped codes priced from a bare subtotal behave as one line.
    const { amount } = await this.quote(
      discount,
      lines ?? [{ productId: null, categoryId: null, amount: subtotal }],
    );

    return {
      discountId: discount.id,
      code: discount.code,
      type: discount.type,
      value: Number(discount.value),
      discountAmount: amount,
      freeShipping: discount.type === DiscountType.FREE_SHIPPING,
    };
  }

  /**
   * Used internally by OrdersService to apply a code during order creation.
   * Checks the code is usable for this subtotal (and, given a userId, that
   * the customer hasn't hit perUserLimit). The per-user check here is the
   * friendly early answer; `redeem` repeats it under a lock.
   */
  async resolveCode(
    code: string,
    subtotal: number,
    userId?: string,
  ): Promise<Discount> {
    const discount = await this.discountRepo.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!discount) throw new NotFoundException('Discount code not found');
    this.discountPolicy.assertUsable(discount, subtotal);

    if (userId && discount.perUserLimit !== null) {
      const used = await this.countActiveRedemptions(
        this.discountRepo.manager,
        discount.id,
        userId,
      );
      this.discountPolicy.assertWithinPerUserLimit(discount, used);
    }

    return discount;
  }

  /**
   * Prices `discount` against an order's lines and splits the result across
   * them. `lines[i].amount` is what is still left to discount on that line
   * (its total, minus any code applied before this one), which is both the
   * allocation weight and the ceiling: the code can never take a line
   * below 0. Lines outside the code's scope get 0.
   *
   * `lineAmounts` is aligned with `lines` and sums exactly to `amount`.
   */
  async quote(
    discount: Discount,
    lines: DiscountLine[],
    manager: EntityManager = this.discountRepo.manager,
  ): Promise<DiscountQuote> {
    // Takes nothing off the lines; the order waives its shipping fee.
    if (discount.type === DiscountType.FREE_SHIPPING) {
      return { amount: 0, lineAmounts: lines.map(() => 0) };
    }
    const eligible = await this.eligibilityFor(discount, lines, manager);
    const weights = lines.map((line, i) => (eligible[i] ? line.amount : 0));
    const base = toMoney(weights.reduce((sum, w) => sum.plus(w), new Big(0)));

    this.discountPolicy.assertAppliesToOrder(discount, base);

    let amount =
      discount.type === DiscountType.PERCENT
        ? new Big(base).times(Number(discount.value)).div(100)
        : new Big(Number(discount.value));
    if (
      discount.type === DiscountType.PERCENT &&
      discount.maxDiscountAmount !== null
    ) {
      amount = amount.gt(discount.maxDiscountAmount)
        ? new Big(discount.maxDiscountAmount)
        : amount;
    }
    // Never more than the eligible lines are worth, so no line (and no
    // order total) can go negative.
    const capped = Math.min(toMoney(amount), base);

    return {
      amount: capped,
      lineAmounts: allocateProportionally(capped, weights),
    };
  }

  /**
   * Records that `orderId` used the code: bumps usedCount (atomically
   * re-checking usageLimit), re-checks perUserLimit and writes the
   * redemption row. Must run in the order's transaction so all of it rolls
   * back with the order.
   *
   * The conditional UPDATE on the discount row also takes that row's lock,
   * so the per-user count below is serialized against every other order
   * redeeming the same code: two concurrent orders from one customer can't
   * both see "0 used" and both pass a perUserLimit of 1.
   */
  async redeem(
    manager: EntityManager,
    params: {
      discount: Discount;
      orderId: string;
      userId: string;
      amount: number;
    },
  ): Promise<void> {
    await this.incrementUsedCount(manager, params.discount.id);

    if (params.discount.perUserLimit !== null) {
      const used = await this.countActiveRedemptions(
        manager,
        params.discount.id,
        params.userId,
      );
      this.discountPolicy.assertWithinPerUserLimit(params.discount, used);
    }

    await manager.save(
      DiscountRedemption,
      manager.create(DiscountRedemption, {
        discount_id: params.discount.id,
        order_id: params.orderId,
        user_id: params.userId,
        amount: params.amount,
        status: DiscountRedemptionStatus.ACTIVE,
      }),
    );
  }

  /**
   * Gives back every code an order used (on cancellation). Idempotent: only
   * ACTIVE redemptions are released and decremented, so a second call is a
   * no-op. Callers hold the order row lock, which serializes this against
   * any other release of the same order.
   */
  async releaseForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const redemptions = await manager.find(DiscountRedemption, {
      where: { order_id: orderId, status: DiscountRedemptionStatus.ACTIVE },
    });

    for (const redemption of redemptions) {
      await manager.update(DiscountRedemption, redemption.id, {
        status: DiscountRedemptionStatus.RELEASED,
        releasedAt: new Date(),
      });
      await manager
        .createQueryBuilder()
        .update(Discount)
        .set({ usedCount: () => '"usedCount" - 1' })
        .where('id = :id AND "usedCount" > 0', { id: redemption.discount_id })
        .execute();
    }
  }

  /**
   * Undoes `releaseForOrder` for an order revived by a late payment. The
   * use is counted again unconditionally: the customer already paid the
   * discounted price, so a code that ran out in the meantime is honoured.
   */
  async reinstateForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const redemptions = await manager.find(DiscountRedemption, {
      where: { order_id: orderId, status: DiscountRedemptionStatus.RELEASED },
    });

    for (const redemption of redemptions) {
      await manager.update(DiscountRedemption, redemption.id, {
        status: DiscountRedemptionStatus.ACTIVE,
        releasedAt: null,
      });
      await manager.increment(
        Discount,
        { id: redemption.discount_id },
        'usedCount',
        1,
      );
    }
  }

  // Keeps the ledger in step when a pending order is edited and its
  // discount is re-priced.
  async updateRedemptionAmount(
    manager: EntityManager,
    orderId: string,
    discountId: string,
    amount: number,
  ): Promise<void> {
    await manager.update(
      DiscountRedemption,
      { order_id: orderId, discount_id: discountId },
      { amount },
    );
  }

  /**
   * Atomically increments usedCount, re-checking the usage limit in the same
   * conditional UPDATE so concurrent orders can't both pass `resolveCode`'s
   * earlier check and both increment past the limit.
   */
  private async incrementUsedCount(
    manager: EntityManager,
    id: string,
  ): Promise<void> {
    const result = await manager
      .createQueryBuilder()
      .update(Discount)
      .set({ usedCount: () => '"usedCount" + 1' })
      .where(
        'id = :id AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")',
        { id },
      )
      .execute();

    if (result.affected === 0) {
      throw new BadRequestException(
        'Discount code has reached its usage limit',
      );
    }
  }

  private countActiveRedemptions(
    manager: EntityManager,
    discountId: string,
    userId: string,
  ): Promise<number> {
    return manager.count(DiscountRedemption, {
      where: {
        discount_id: discountId,
        user_id: userId,
        status: DiscountRedemptionStatus.ACTIVE,
      },
    });
  }

  private isScoped(discount: Discount): boolean {
    return Boolean(discount.productIds?.length || discount.categoryIds?.length);
  }

  private async eligibilityFor(
    discount: Discount,
    lines: DiscountLine[],
    manager: EntityManager,
  ): Promise<boolean[]> {
    if (!this.isScoped(discount)) return lines.map(() => true);

    const productIds = new Set(discount.productIds ?? []);
    const categoryIds = await this.expandCategories(
      manager,
      discount.categoryIds ?? [],
    );

    return lines.map(
      (line) =>
        (line.productId !== null && productIds.has(line.productId)) ||
        (line.categoryId !== null && categoryIds.has(line.categoryId)),
    );
  }

  // The listed categories plus all their descendants. UNION (not UNION ALL)
  // stops the recursion on a parent/child cycle instead of looping forever.
  private async expandCategories(
    manager: EntityManager,
    rootIds: string[],
  ): Promise<Set<string>> {
    if (rootIds.length === 0) return new Set();

    const rows: { id: string }[] = await manager.query(
      `WITH RECURSIVE tree AS (
         SELECT "id" FROM "categories" WHERE "id" = ANY($1::uuid[])
         UNION
         SELECT c."id" FROM "categories" c JOIN tree t ON c."parent_id" = t."id"
       )
       SELECT "id" FROM tree`,
      [rootIds],
    );
    return new Set(rows.map((r) => r.id));
  }

  private async linesForItems(
    items: { variant_id: string; quantity: number }[],
  ): Promise<DiscountLine[]> {
    const variants = await this.variantRepo.find({
      where: { id: In(items.map((i) => i.variant_id)) },
      relations: ['product'],
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    return items.map((item) => {
      const variant = byId.get(item.variant_id);
      if (!variant)
        throw new NotFoundException(`Variant ${item.variant_id} not found`);
      return {
        productId: variant.product.id,
        categoryId: variant.product.category_id,
        amount: toMoney(new Big(Number(variant.price)).times(item.quantity)),
      };
    });
  }
}
