import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { DiscountType } from '../enums/discount-type.enum';

export class DiscountResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: DiscountType }) type!: DiscountType;
  @ApiProperty() value!: number;
  @ApiPropertyOptional() minOrderValue!: number | null;
  @ApiPropertyOptional() usageLimit!: number | null;
  @ApiProperty() usedCount!: number;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() startsAt!: Date | null;
  @ApiPropertyOptional() expiresAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class DiscountPaginatedResponseDto extends Paginated(
  DiscountResponseDto,
) {}

export class ValidateDiscountResponseDto {
  @ApiProperty() discountId!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: DiscountType }) type!: DiscountType;
  @ApiProperty() value!: number;
  @ApiProperty({ description: 'Computed discount amount in VND' })
  discountAmount!: number;
}
