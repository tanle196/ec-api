import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentEventSource } from '../enums/shipment-event-source.enum';
import { ShipmentStatus } from '../enums/shipment-status.enum';

export class ShipmentEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ShipmentStatus }) status!: ShipmentStatus;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty() occurredAt!: Date;
  @ApiProperty({ enum: ShipmentEventSource }) source!: ShipmentEventSource;
  @ApiPropertyOptional({ type: String, nullable: true })
  actorId!: string | null;
}

export class ShipmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty({ enum: ShipmentStatus }) status!: ShipmentStatus;
  @ApiProperty() carrier!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  trackingNumber!: string | null;
  @ApiProperty() attempts!: number;
  @ApiProperty() shippedAt!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true })
  deliveredAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  returnedAt!: Date | null;
  @ApiProperty({ type: [ShipmentEventResponseDto] })
  events!: ShipmentEventResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
