import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { OrderListItemDto, OrderResponseDto } from './order-response.dto';

export class AdminOrderResponseDto extends OrderResponseDto {}

export class AdminOrderListItemDto extends OrderListItemDto {}

export class AdminOrderPaginatedResponseDto extends PaginatedResponseDto<AdminOrderListItemDto> {
  @ApiProperty({ type: [AdminOrderListItemDto] })
  declare data: AdminOrderListItemDto[];
}
