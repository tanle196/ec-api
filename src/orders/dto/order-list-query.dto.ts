import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { OrderStatus } from '../enums/order-status.enum';

export enum OrderSortField {
  CREATED_AT = 'createdAt',
  TOTAL = 'total',
  ORDER_NUMBER = 'orderNumber',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

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

  @ApiPropertyOptional({
    description: 'Search by order number (partial match)',
  })
  @IsString()
  @IsOptional()
  order_number?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Filter orders created on or after this date',
  })
  @IsDateString()
  @IsOptional()
  from_date?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Filter orders created on or before this date',
  })
  @IsDateString()
  @IsOptional()
  to_date?: string;

  @ApiPropertyOptional({
    enum: OrderSortField,
    default: OrderSortField.CREATED_AT,
  })
  @IsEnum(OrderSortField)
  @IsOptional()
  sort_by?: OrderSortField = OrderSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsEnum(SortOrder)
  @IsOptional()
  sort_order?: SortOrder = SortOrder.DESC;
}
