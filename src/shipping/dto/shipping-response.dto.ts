import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShippingZone } from '../enums/shipping-zone.enum';

export class ShippingRateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ShippingZone }) zone!: ShippingZone;
  @ApiProperty() baseWeightGrams!: number;
  @ApiProperty() baseFee!: number;
  @ApiProperty() stepWeightGrams!: number;
  @ApiProperty() stepFee!: number;
  @ApiProperty() updatedAt!: Date;
}

export class ShippingQuoteResponseDto {
  @ApiProperty({ description: 'Shipping fee the customer pays' })
  fee!: number;
  @ApiProperty({ description: 'Fee before any free-shipping rule' })
  standardFee!: number;
  @ApiPropertyOptional({ enum: ShippingZone, nullable: true })
  zone!: ShippingZone | null;
  @ApiProperty() weightGrams!: number;
  @ApiPropertyOptional({
    enum: ['threshold', 'discount_code'],
    nullable: true,
    description: 'Why shipping is free, if it is',
  })
  freeShipping!: 'threshold' | 'discount_code' | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Subtotal from which shipping is free (shop-wide rule)',
  })
  freeShippingThreshold!: number | null;
}
