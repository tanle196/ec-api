import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Discount } from './entities/discount.entity';
import { DiscountRedemption } from './entities/discount-redemption.entity';
import { DiscountsController } from './discounts.controller';
import { AdminDiscountsController } from './admin-discounts.controller';
import { DiscountsService } from './discounts.service';
import { DiscountPolicy } from './policies/discount.policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([Discount, DiscountRedemption, ProductVariant]),
  ],
  controllers: [DiscountsController, AdminDiscountsController],
  providers: [DiscountsService, DiscountPolicy],
  exports: [DiscountsService],
})
export class DiscountsModule {}
