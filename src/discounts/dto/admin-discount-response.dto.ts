import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { DiscountResponseDto } from './discount-response.dto';

export class AdminDiscountResponseDto extends DiscountResponseDto {}

export class AdminDiscountPaginatedResponseDto extends PaginatedResponseDto<AdminDiscountResponseDto> {
  @ApiProperty({ type: [AdminDiscountResponseDto] })
  declare data: AdminDiscountResponseDto[];
}
