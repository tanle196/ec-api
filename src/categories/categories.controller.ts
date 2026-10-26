import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CategoryListQueryDto } from './dto/category-list-query.dto';
import {
  CategoryPaginatedResponseDto,
  CategoryResponseDto,
  CategoryTreeNodeDto,
} from './dto/category-response.dto';
import { mapPaginated } from '@/common/dto/pagination.dto';
import { CategoryMapper } from './mapper/category.mapper';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories (paginated)' })
  @ApiOkResponse({ type: CategoryPaginatedResponseDto })
  findAll(@Query() query: CategoryListQueryDto) {
    return this.categoriesService
      .findAll(query)
      .then((page) => mapPaginated(page, CategoryMapper.toResponse));
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get full category tree (recursive)' })
  @ApiOkResponse({ type: [CategoryTreeNodeDto] })
  findTree(): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.findTree();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get category by slug' })
  @ApiParam({ name: 'slug', example: 'smartphones' })
  @ApiOkResponse({ type: CategoryResponseDto })
  findBySlug(@Param('slug') slug: string) {
    return this.categoriesService
      .findBySlug(slug)
      .then(CategoryMapper.toResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: CategoryResponseDto })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id).then(CategoryMapper.toResponse);
  }
}
