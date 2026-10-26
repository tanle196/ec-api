import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddToWishlistDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Product ID to add' })
  @IsUUID()
  product_id!: string;
}
