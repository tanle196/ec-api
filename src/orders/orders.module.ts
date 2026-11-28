import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Discount } from '@/discounts/entities/discount.entity';
import { DiscountsModule } from '@/discounts/discounts.module';
import { CartsModule } from '@/carts/carts.module';
import { InventoryModule } from '@/inventory/inventory.module';
import { OutboxModule } from '@/outbox/outbox.module';
import { ShippingModule } from '@/shipping/shipping.module';
import { MailModule } from '@/mail/mail.module';
import { UsersModule } from '@/users/users.module';
// Only the Payment entity is imported here (not PaymentsModule) — cancel()
// needs to read a payment's status to block cancelling an already-paid
// order, but PaymentsModule already imports OrdersModule, so importing it
// back here would create a circular module dependency.
import { Payment } from '@/payments/entities/payment.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';
import { OrderExpiryScheduler } from './order-expiry.scheduler';
import { OrderCompletionScheduler } from './order-completion.scheduler';
import { OrderNotificationsHandler } from './order-notifications.handler';
import { AdminShipmentsController } from './shipments/admin-shipments.controller';
import { ShipmentEvent } from './shipments/entities/shipment-event.entity';
import { Shipment } from './shipments/entities/shipment.entity';
import { ShipmentPolicy } from './shipments/policies/shipment.policy';
import { ShipmentsService } from './shipments/shipments.service';
import { CarrierWebhooksController } from './shipments/carrier-webhooks.controller';
import { CarrierWebhooksService } from './shipments/carrier-webhooks.service';
import { ShippingQuoteController } from './shipping-quote.controller';
import { OrderPolicy } from './policies/order.policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      Shipment,
      ShipmentEvent,
      Address,
      ProductVariant,
      Discount,
      Payment,
    ]),
    DiscountsModule,
    CartsModule,
    InventoryModule,
    OutboxModule,
    ShippingModule,
    MailModule,
    UsersModule,
  ],
  controllers: [
    OrdersController,
    AdminOrdersController,
    AdminShipmentsController,
    CarrierWebhooksController,
    ShippingQuoteController,
  ],
  providers: [
    OrdersService,
    OrderPolicy,
    OrderExpiryScheduler,
    OrderCompletionScheduler,
    OrderNotificationsHandler,
    ShipmentsService,
    ShipmentPolicy,
    CarrierWebhooksService,
  ],
  exports: [OrdersService, ShipmentsService],
})
export class OrdersModule {}
