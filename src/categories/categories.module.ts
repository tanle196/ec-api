import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CategoriesController } from './categories.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { CategoriesService } from './categories.service';
import { MediaModule } from '@/media/media.module';
import { CategoryPolicy } from './policies/category.policy';

@Module({
  imports: [TypeOrmModule.forFeature([Category]), MediaModule],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService, CategoryPolicy],
  exports: [TypeOrmModule],
})
export class CategoriesModule {}
