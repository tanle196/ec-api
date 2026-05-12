import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryListQueryDto } from './dto/category-list-query.dto';
import {
  CategoryPaginatedResponseDto,
  CategoryResponseDto,
  CategoryTreeNodeDto,
} from './dto/category-response.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('category.create')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, type: CategoryResponseDto })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List categories (paginated)' })
  @ApiOkResponse({ type: CategoryPaginatedResponseDto })
  findAll(@Query() query: CategoryListQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Get full category tree (recursive)' })
  @ApiOkResponse({ type: [CategoryTreeNodeDto] })
  findTree(): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.findTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: CategoryResponseDto })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('category.update')
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: CategoryResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('category.delete')
  @ApiOperation({ summary: 'Delete category (must have no children)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
