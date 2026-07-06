import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Discount } from '@/discounts/entities/discount.entity';
import { DiscountsModule } from '@/discounts/discounts.module';
import { CartsModule } from '@/carts/carts.module';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrdersController } from './orders.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Address,
      ProductVariant,
      Discount,
    ]),
    DiscountsModule,
    CartsModule,
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
