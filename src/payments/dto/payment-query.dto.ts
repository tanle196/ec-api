import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { PaymentStatus } from '../enums/payment-status.enum';

export class PaymentQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by order (admin)' })
  @IsUUID()
  @IsOptional()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Filter by user (admin)' })
  @IsUUID()
  @IsOptional()
  user_id?: string;
}
