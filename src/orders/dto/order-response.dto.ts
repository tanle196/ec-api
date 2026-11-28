import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@/discounts/enums/discount-type.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { Paginated } from '@/common/dto/pagination.dto';

export class AppliedDiscountDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: DiscountType }) type!: DiscountType;
  @ApiProperty() value!: number;
}

export class OrderItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variant_id!: string | null;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variantName!: string | null;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Share of the order discount on this line' })
  discountAmount!: number;
  @ApiProperty({ description: 'Share of the shipping fee on this line' })
  shippingAmount!: number;
  @ApiProperty({
    description: 'What was paid for this line (total - discount + shipping)',
  })
  paidAmount!: number;
}

export class ShippingAddressDto {
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() province!: string;
  @ApiProperty() country!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  postalCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  districtCode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  wardCode!: string | null;
}

export class OrderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() user_id!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  address_id!: string | null;
  @ApiPropertyOptional({
    type: ShippingAddressDto,
    nullable: true,
    description: 'Delivery address as it was when the order was placed',
  })
  shippingAddress!: ShippingAddressDto | null;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() subtotal!: number;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() discount!: number;
  @ApiProperty() total!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  notes!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  deliveredAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  completedAt!: Date | null;
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

export class OrderPaginatedResponseDto extends Paginated(OrderListItemDto) {}
