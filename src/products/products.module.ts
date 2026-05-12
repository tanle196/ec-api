import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Tag } from './entities/tag.entity';
import { ProductsController, TagsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductImage, ProductVariant, Tag]),
  ],
  controllers: [ProductsController, TagsController],
  providers: [ProductsService],
  exports: [TypeOrmModule],
})
export class ProductsModule {}
