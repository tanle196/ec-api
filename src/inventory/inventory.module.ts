import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { AdminInventoryController } from './admin-inventory.controller';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { StockReceiptItem } from './entities/stock-receipt-item.entity';
import { StockReceipt } from './entities/stock-receipt.entity';
import { InventoryAuditService } from './inventory-audit.service';
import { InventoryService } from './inventory.service';
import { InventoryPolicy } from './policies/inventory.policy';
import { StockReceiptPolicy } from './policies/stock-receipt.policy';
import { StockReceiptsService } from './stock-receipts.service';

// Imports only the ProductVariant entity (not ProductsModule): ProductsModule
// imports this module to record stock set from the product form, so the
// reverse import would be circular.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductVariant,
      InventoryMovement,
      StockReceipt,
      StockReceiptItem,
    ]),
  ],
  controllers: [AdminInventoryController],
  providers: [
    InventoryService,
    StockReceiptsService,
    InventoryAuditService,
    InventoryPolicy,
    StockReceiptPolicy,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
