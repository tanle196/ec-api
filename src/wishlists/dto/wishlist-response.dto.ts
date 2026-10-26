import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@/products/enums/product-status.enum';

export class WishlistProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() basePrice!: number;
  @ApiProperty() sku!: string;
  @ApiProperty({ enum: ProductStatus }) status!: ProductStatus;
  @ApiProperty() isFeatured!: boolean;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
}

export class WishlistItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() product_id!: string;
  @ApiProperty({ type: WishlistProductDto }) product!: WishlistProductDto;
  @ApiProperty() createdAt!: Date;
}

export class WishlistResponseDto {
  @ApiProperty({ type: [WishlistItemResponseDto] })
  items!: WishlistItemResponseDto[];

  @ApiProperty() total!: number;
}
