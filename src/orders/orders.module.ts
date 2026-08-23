import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Discount } from '@/discounts/entities/discount.entity';
import { DiscountsModule } from '@/discounts/discounts.module';
import { CartsModule } from '@/carts/carts.module';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      OrderStatusHistory,
      Address,
      ProductVariant,
      Discount,
      Payment,
    ]),
    DiscountsModule,
    CartsModule,
    MailModule,
    UsersModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
