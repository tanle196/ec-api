import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { ReviewsController, ProductReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { Product } from '@/products/entities/product.entity';
import { Order } from '@/orders/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product, Order])],
  controllers: [ReviewsController, ProductReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
