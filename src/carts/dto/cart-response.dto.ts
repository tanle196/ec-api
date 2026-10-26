import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CartItemVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() price!: number;
  @ApiProperty() stock!: number;
  @ApiPropertyOptional() attributes!: Record<string, unknown> | null;
}

export class CartItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() cart_id!: string;
  @ApiProperty() variant_id!: string;
  @ApiProperty({ type: CartItemVariantDto }) variant!: CartItemVariantDto;
  @ApiProperty() quantity!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class CartResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() user_id!: string;
  @ApiProperty({ type: [CartItemResponseDto] }) items!: CartItemResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
