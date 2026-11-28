import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { OutboxEventStatus } from '../enums/outbox-event-status.enum';

export class OutboxEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() aggregateType!: string;
  @ApiProperty() aggregateId!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;
  @ApiProperty({ enum: OutboxEventStatus }) status!: OutboxEventStatus;
  @ApiProperty() attempts!: number;
  @ApiProperty() availableAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true })
  processedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  lastError!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class OutboxEventPaginatedResponseDto extends Paginated(
  OutboxEventResponseDto,
) {}
