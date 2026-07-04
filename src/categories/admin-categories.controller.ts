import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
  CategoryTreeNodeDto,
} from './dto/category-response.dto';
import { AdminCategoryResponseDto } from './dto/admin-category-response.dto';

@ApiTags('Admin: categories')
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Permissions('category.read')
  @ApiOperation({ summary: 'List categories (paginated)' })
  @ApiOkResponse({ type: CategoryPaginatedResponseDto })
  findAll(@Query() query: CategoryListQueryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get('tree')
  @Permissions('category.read')
  @ApiOperation({ summary: 'Get full category tree (recursive)' })
  @ApiOkResponse({ type: [CategoryTreeNodeDto] })
  findTree(): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.findTree();
  }

  @Get(':id')
  @Permissions('category.read')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminCategoryResponseDto })
  findOne(@Param('id') id: string): Promise<AdminCategoryResponseDto> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Permissions('category.create')
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, type: AdminCategoryResponseDto })
  create(@Body() dto: CreateCategoryDto): Promise<AdminCategoryResponseDto> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Permissions('category.update')
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminCategoryResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/image/upload')
  @Permissions('category.update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload and set category image (replaces existing)',
  })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: AdminCategoryResponseDto })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdminCategoryResponseDto> {
    return this.categoriesService.uploadImage(id, file);
  }

  @Delete(':id/image')
  @Permissions('category.update')
  @ApiOperation({ summary: 'Remove category image (also deletes from cloud)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminCategoryResponseDto })
  removeImage(@Param('id') id: string) {
    return this.categoriesService.removeImage(id);
  }

  @Delete(':id')
  @Permissions('category.delete')
  @ApiOperation({ summary: 'Delete category (must have no children)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
