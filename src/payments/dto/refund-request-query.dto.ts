import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';

export class RefundRequestQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RefundRequestStatus })
  @IsEnum(RefundRequestStatus)
  @IsOptional()
  status?: RefundRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by order' })
  @IsUUID()
  @IsOptional()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Filter by payment' })
  @IsUUID()
  @IsOptional()
  payment_id?: string;
}
