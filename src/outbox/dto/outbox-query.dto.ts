import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { OutboxEventStatus } from '../enums/outbox-event-status.enum';

export class OutboxQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OutboxEventStatus })
  @IsEnum(OutboxEventStatus)
  @IsOptional()
  status?: OutboxEventStatus;

  @ApiPropertyOptional({ example: 'order.status_changed' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  aggregate_id?: string;
}
