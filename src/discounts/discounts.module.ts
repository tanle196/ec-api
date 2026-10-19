import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Discount } from './entities/discount.entity';
import { DiscountsController } from './discounts.controller';
import { AdminDiscountsController } from './admin-discounts.controller';
import { DiscountsService } from './discounts.service';
import { DiscountPolicy } from './policies/discount.policy';

@Module({
  imports: [TypeOrmModule.forFeature([Discount])],
  controllers: [DiscountsController, AdminDiscountsController],
  providers: [DiscountsService, DiscountPolicy],
  exports: [DiscountsService],
})
export class DiscountsModule {}
