import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { OrderStatus } from '../enums/order-status.enum';

export class OrderListQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({
    example: 'uuid-v4',
    description: 'Filter by user ID (admin only)',
  })
  @IsUUID()
  @IsOptional()
  user_id?: string;
}
