import { PaginationDto } from '@/common/dto/pagination.dto';
import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class CategoryFilterDto {
  @ApiPropertyOptional({ description: 'Filter by category name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description:
      'Filter by parent category ID (omit for all, use null for root)',
  })
  @IsUUID(4)
  @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CategoryListQueryDto extends IntersectionType(
  PaginationDto,
  CategoryFilterDto,
) {}
