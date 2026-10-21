import { DiscountResponseDto } from '../dto/discount-response.dto';
import { Discount } from '../entities/discount.entity';

export class DiscountMapper {
  static toResponse = (entity: Discount): DiscountResponseDto => ({
    id: entity.id,
    code: entity.code,
    type: entity.type,
    value: entity.value,
    minOrderValue: entity.minOrderValue,
    usageLimit: entity.usageLimit,
    usedCount: entity.usedCount,
    isActive: entity.isActive,
    startsAt: entity.startsAt,
    expiresAt: entity.expiresAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Discount[]): DiscountResponseDto[] =>
    entities.map(DiscountMapper.toResponse);
}
