import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { InventoryMovementReason } from '../enums/inventory-movement-reason.enum';
import { StockReceiptStatus } from '../enums/stock-receipt-status.enum';

export class InventoryMovementResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variant_id!: string | null;
  @ApiProperty() sku!: string;
  @ApiProperty({ enum: InventoryMovementReason })
  reason!: InventoryMovementReason;
  @ApiProperty({ description: 'Change to units physically on hand' })
  onHandDelta!: number;
  @ApiProperty({ description: 'Change to units reserved for orders' })
  reservedDelta!: number;
  @ApiProperty({ description: 'Change to units available to sell' })
  availableDelta!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  refType!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  refId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  actorId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty() createdAt!: Date;
}

export class InventoryMovementPaginatedResponseDto extends Paginated(
  InventoryMovementResponseDto,
) {}

export class VariantStockResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() product_id!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  productName!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ description: 'Available to sell' }) stock!: number;
  @ApiProperty({ description: 'Held for unshipped orders' }) reserved!: number;
  @ApiProperty({ description: 'stock + reserved' }) onHand!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  lowStockThreshold!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  avgCost!: number | null;
  @ApiProperty() isActive!: boolean;
}

export class VariantStockPaginatedResponseDto extends Paginated(
  VariantStockResponseDto,
) {}

export class StockReceiptItemResponseDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variant_id!: string | null;
  @ApiProperty() sku!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitCost!: number;
}

export class StockReceiptResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  supplier!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ enum: StockReceiptStatus }) status!: StockReceiptStatus;
  @ApiProperty() totalCost!: number;
  @ApiProperty() createdBy!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  confirmedBy!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  confirmedAt!: Date | null;
  @ApiProperty({ type: [StockReceiptItemResponseDto] })
  items!: StockReceiptItemResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class StockReceiptPaginatedResponseDto extends Paginated(
  StockReceiptResponseDto,
) {}

export class InventoryAuditMismatchDto {
  @ApiProperty() variant_id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() stock!: number;
  @ApiProperty() reserved!: number;
  @ApiProperty({ description: 'SUM(onHandDelta) in the ledger' })
  ledgerOnHand!: number;
  @ApiProperty({ description: 'SUM(reservedDelta) in the ledger' })
  ledgerReserved!: number;
}

export class InventoryAuditResponseDto {
  @ApiProperty() checkedAt!: Date;
  @ApiProperty() variantsChecked!: number;
  @ApiProperty({ type: [InventoryAuditMismatchDto] })
  mismatches!: InventoryAuditMismatchDto[];
}
