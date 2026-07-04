import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import {
  ProductPaginatedResponseDto,
  ProductResponseDto,
  TagResponseDto,
} from './dto/product-response.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products (paginated, filterable)' })
  @ApiOkResponse({ type: ProductPaginatedResponseDto })
  findAll(@Query() query: ProductListQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('slug/:slug')
  @ApiOperation({
    summary: 'Get product detail by slug with images, variants, tags',
  })
  @ApiParam({ name: 'slug', example: 'iphone-15-pro' })
  @ApiOkResponse({ type: ProductResponseDto })
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product detail with images, variants, tags' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: ProductResponseDto })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List all tags' })
  @ApiOkResponse({ type: [TagResponseDto] })
  findAllTags(): Promise<TagResponseDto[]> {
    return this.productsService.findAllTags();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get tag by slug' })
  @ApiParam({ name: 'slug', example: 'sale' })
  @ApiOkResponse({ type: TagResponseDto })
  findTagBySlug(@Param('slug') slug: string): Promise<TagResponseDto> {
    return this.productsService.findTagBySlug(slug);
  }
}
