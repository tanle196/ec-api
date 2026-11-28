import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { StockReceiptStatus } from '../enums/stock-receipt-status.enum';

export class StockReceiptQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: StockReceiptStatus })
  @IsEnum(StockReceiptStatus)
  @IsOptional()
  status?: StockReceiptStatus;
}
