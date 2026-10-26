import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Delivery address ID' })
  @IsUUID()
  address_id!: string;

  @ApiPropertyOptional({
    example: 'SALE20',
    description: 'Discount coupon code',
  })
  @IsString()
  @IsOptional()
  discountCode?: string;

  @ApiPropertyOptional({ example: 'Giao giờ hành chính' })
  @IsString()
  @IsOptional()
  notes?: string;
}
