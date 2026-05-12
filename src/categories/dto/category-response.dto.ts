import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';

export class CategoryResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  parent_id!: string | null;

  @ApiProperty({ example: 'Smartphones' })
  name!: string;

  @ApiProperty({ example: 'smartphones' })
  slug!: string;

  @ApiPropertyOptional({
    example: 'All smartphones and mobile phones',
    nullable: true,
  })
  description!: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/cat.jpg',
    nullable: true,
  })
  image!: string | null;

  @ApiProperty({ example: 0 })
  sortOrder!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

export class CategoryTreeNodeDto extends CategoryResponseDto {
  @ApiPropertyOptional({ type: () => [CategoryTreeNodeDto] })
  children?: CategoryTreeNodeDto[];
}

export class CategoryPaginatedResponseDto extends PaginatedResponseDto<CategoryResponseDto> {
  @ApiProperty({ type: () => [CategoryResponseDto] })
  data: CategoryResponseDto[] = [];
}
