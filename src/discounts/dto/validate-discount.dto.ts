import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class ValidateDiscountDto {
  @ApiProperty({ example: 'SALE20' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    example: 500000,
    description: 'Order subtotal to calculate discount against',
  })
  @IsNumber()
  @Min(0)
  subtotal!: number;
}
