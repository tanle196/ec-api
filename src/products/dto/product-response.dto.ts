import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '../enums/product-status.enum';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

export class ProductImageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ nullable: true }) alt!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class ProductVariantResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() price!: number;
  @ApiProperty() stock!: number;
  @ApiPropertyOptional({ nullable: true }) attributes!: Record<
    string,
    unknown
  > | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TagResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class ProductResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() category_id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() basePrice!: number;
  @ApiProperty() sku!: string;
  @ApiProperty({ enum: ProductStatus }) status!: ProductStatus;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty({ type: [ProductImageResponseDto] })
  images!: ProductImageResponseDto[];
  @ApiProperty({ type: [ProductVariantResponseDto] })
  variants!: ProductVariantResponseDto[];
  @ApiProperty({ type: [TagResponseDto] }) tags!: TagResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() category_id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() basePrice!: number;
  @ApiProperty() sku!: string;
  @ApiProperty({ enum: ProductStatus }) status!: ProductStatus;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ProductPaginatedResponseDto extends PaginatedResponseDto<ProductListItemDto> {
  @ApiProperty({ type: () => [ProductListItemDto] })
  data: ProductListItemDto[] = [];
}
