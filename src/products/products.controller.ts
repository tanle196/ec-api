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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/product-list-query.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import {
  ProductImageResponseDto,
  ProductPaginatedResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  TagResponseDto,
} from './dto/product-response.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── Products ───────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.create')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, type: ProductResponseDto })
  create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    return this.productsService.create(dto);
  }

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

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: ProductResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.delete')
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  // ── Images ────────────────────────────────────────────────

  @Post(':id/images')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Add image to product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 201, type: ProductImageResponseDto })
  addImage(@Param('id') id: string, @Body() dto: CreateProductImageDto) {
    return this.productsService.addImage(id, dto);
  }

  @Post(':id/images/upload')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload and attach an image to a product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        alt: { type: 'string' },
        isPrimary: { type: 'boolean' },
        sortOrder: { type: 'integer' },
        variant_id: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, type: ProductImageResponseDto })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('alt') alt?: string,
    @Body('isPrimary') isPrimary?: string,
    @Body('sortOrder') sortOrder?: string,
    @Body('variant_id') variant_id?: string,
  ): Promise<ProductImageResponseDto> {
    return this.productsService.uploadImage(id, file, {
      alt,
      isPrimary: isPrimary === 'true',
      sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0,
      variant_id,
    });
  }

  @Delete(':id/images/:imageId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({
    summary: 'Remove image from product (also deletes from cloud)',
  })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiParam({ name: 'imageId', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.removeImage(id, imageId);
  }

  // ── Variants ──────────────────────────────────────────────

  @Post(':id/variants')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Add variant to product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 201, type: ProductVariantResponseDto })
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Update product variant' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiParam({ name: 'variantId', example: 'uuid-v4' })
  @ApiOkResponse({ type: ProductVariantResponseDto })
  updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Remove product variant' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiParam({ name: 'variantId', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  removeVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    return this.productsService.removeVariant(id, variantId);
  }
}

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.create')
  @ApiOperation({ summary: 'Create a tag' })
  @ApiResponse({ status: 201, type: TagResponseDto })
  createTag(@Body() dto: CreateTagDto): Promise<TagResponseDto> {
    return this.productsService.createTag(dto);
  }

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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth('access-token')
  @Permissions('product.delete')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  removeTag(@Param('id') id: string) {
    return this.productsService.removeTag(id);
  }
}
