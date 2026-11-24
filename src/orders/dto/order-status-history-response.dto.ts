import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderStatusChangeActor } from '../enums/order-status-change-actor.enum';

export class OrderStatusHistoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiPropertyOptional({ enum: OrderStatus })
  fromStatus!: OrderStatus | null;
  @ApiProperty({ enum: OrderStatus }) toStatus!: OrderStatus;
  @ApiProperty({ enum: OrderStatusChangeActor })
  changedByType!: OrderStatusChangeActor;
  @ApiPropertyOptional({ type: String, nullable: true })
  changedById!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty() createdAt!: Date;
}
