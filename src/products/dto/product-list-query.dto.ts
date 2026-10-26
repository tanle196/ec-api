import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ProductStatus } from '../enums/product-status.enum';

export class ProductFilterDto {
  @ApiPropertyOptional({ description: 'Filter by product name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsUUID(4)
  @IsOptional()
  category_id?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Filter featured products' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;
}

export class ProductListQueryDto extends IntersectionType(
  PaginationDto,
  ProductFilterDto,
) {}
