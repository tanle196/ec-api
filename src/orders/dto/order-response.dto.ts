import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@/discounts/enums/discount-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

export class AppliedDiscountDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: DiscountType }) type!: DiscountType;
  @ApiProperty() value!: number;
}

export class OrderItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiPropertyOptional() variant_id!: string | null;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional() variantName!: string | null;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() total!: number;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() user_id!: string;
  @ApiPropertyOptional() address_id!: string | null;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() subtotal!: number;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() discount!: number;
  @ApiProperty() total!: number;
  @ApiPropertyOptional() notes!: string | null;
  @ApiProperty({ type: [OrderItemResponseDto] }) items!: OrderItemResponseDto[];
  @ApiProperty({ type: [AppliedDiscountDto] }) discounts!: AppliedDiscountDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class OrderListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() user_id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() total!: number;
  @ApiProperty() createdAt!: Date;
}

export class OrderPaginatedResponseDto extends PaginatedResponseDto<OrderListItemDto> {
  @ApiProperty({ type: [OrderListItemDto] })
  declare data: OrderListItemDto[];
}
