import { ProductVariant } from '@/products/entities/product-variant.entity';
import {
  InventoryMovementResponseDto,
  StockReceiptResponseDto,
  VariantStockResponseDto,
} from '../dto/inventory-response.dto';
import { InventoryMovement } from '../entities/inventory-movement.entity';
import { StockReceipt } from '../entities/stock-receipt.entity';

export class InventoryMapper {
  static toMovement = (m: InventoryMovement): InventoryMovementResponseDto => ({
    id: m.id,
    variant_id: m.variant_id,
    sku: m.sku,
    reason: m.reason,
    onHandDelta: m.onHandDelta,
    reservedDelta: m.reservedDelta,
    availableDelta: m.onHandDelta - m.reservedDelta,
    refType: m.refType,
    refId: m.refId,
    actorId: m.actorId,
    note: m.note,
    createdAt: m.createdAt,
  });

  static toVariantStock = (v: ProductVariant): VariantStockResponseDto => ({
    id: v.id,
    product_id: v.product_id,
    productName: v.product?.name ?? null,
    name: v.name,
    sku: v.sku,
    stock: v.stock,
    reserved: v.reserved,
    onHand: v.stock + v.reserved,
    lowStockThreshold: v.lowStockThreshold,
    avgCost: v.avgCost,
    isActive: v.isActive,
  });

  static toReceipt = (r: StockReceipt): StockReceiptResponseDto => ({
    id: r.id,
    code: r.code,
    supplier: r.supplier,
    note: r.note,
    status: r.status,
    totalCost: r.totalCost,
    createdBy: r.createdBy,
    confirmedBy: r.confirmedBy,
    confirmedAt: r.confirmedAt,
    items: (r.items ?? []).map((i) => ({
      id: i.id,
      variant_id: i.variant_id,
      sku: i.sku,
      quantity: i.quantity,
      unitCost: i.unitCost,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}
