import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, ILike, Repository } from 'typeorm';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { DiscountListQueryDto } from './dto/discount-list-query.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { ValidateDiscountDto } from './dto/validate-discount.dto';
import { ValidateDiscountResponseDto } from './dto/discount-response.dto';
import { Discount } from './entities/discount.entity';
import { DiscountType } from './enums/discount-type.enum';

@Injectable()
export class DiscountsService {
  constructor(
    @InjectRepository(Discount)
    private readonly discountRepo: Repository<Discount>,
  ) {}

  async create(dto: CreateDiscountDto): Promise<Discount> {
    const existing = await this.discountRepo.findOne({
      where: { code: dto.code.toUpperCase() },
    });
    if (existing) throw new ConflictException('Discount code already exists');

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

    Object.assign(discount, dto);
    return this.discountRepo.save(discount);
  }

  async remove(id: string): Promise<void> {
    const discount = await this.findOne(id);
    await this.discountRepo.remove(discount);
  }

  async validate(
    dto: ValidateDiscountDto,
  ): Promise<ValidateDiscountResponseDto> {
    const discount = await this.resolveCode(dto.code, dto.subtotal);
    const discountAmount = this.computeAmount(discount, dto.subtotal);

    return {
      discountId: discount.id,
      code: discount.code,
      type: discount.type,
      value: Number(discount.value),
      discountAmount,
    };
  }

  /**
   * Used internally by OrdersService to apply a code during order creation.
   * Returns the discount entity and computed amount.
   */
  async resolveCode(code: string, subtotal: number): Promise<Discount> {
    const discount = await this.discountRepo.findOne({
      where: { code: code.toUpperCase() },
    });

    if (!discount) throw new NotFoundException('Discount code not found');
    if (!discount.isActive)
      throw new BadRequestException('Discount code is inactive');

    const now = new Date();
    if (discount.startsAt && now < discount.startsAt)
      throw new BadRequestException('Discount code is not yet valid');
    if (discount.expiresAt && now > discount.expiresAt)
      throw new BadRequestException('Discount code has expired');

    if (
      discount.usageLimit !== null &&
      discount.usedCount >= discount.usageLimit
    )
      throw new BadRequestException(
        'Discount code has reached its usage limit',
      );

    if (
      discount.minOrderValue !== null &&
      subtotal < Number(discount.minOrderValue)
    )
      throw new BadRequestException(
        `Minimum order value for this code is ${discount.minOrderValue}`,
      );

    return discount;
  }

  computeAmount(discount: Discount, subtotal: number): number {
    if (discount.type === DiscountType.PERCENT) {
      return Math.round((subtotal * Number(discount.value)) / 100);
    }
    return Math.min(Math.round(Number(discount.value)), subtotal);
  }

  /**
   * Atomically increments usedCount, re-checking the usage limit in the same
   * conditional UPDATE so concurrent orders can't both pass `resolveCode`'s
   * earlier check and both increment past the limit. Must be called with the
   * order's transactional `manager` so the increment rolls back together
   * with the rest of the order if a later step in the transaction fails.
   */
  async incrementUsedCount(manager: EntityManager, id: string): Promise<void> {
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
}
