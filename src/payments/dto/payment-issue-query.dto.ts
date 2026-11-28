import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { PaymentIssueStatus } from '../enums/payment-issue-status.enum';
import { PaymentIssueType } from '../enums/payment-issue-type.enum';

export class PaymentIssueQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PaymentIssueStatus })
  @IsEnum(PaymentIssueStatus)
  @IsOptional()
  status?: PaymentIssueStatus;

  @ApiPropertyOptional({ enum: PaymentIssueType })
  @IsEnum(PaymentIssueType)
  @IsOptional()
  type?: PaymentIssueType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  payment_id?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  order_id?: string;
}
