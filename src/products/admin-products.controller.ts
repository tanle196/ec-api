import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
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
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import {
  ProductImageResponseDto,
  ProductVariantResponseDto,
} from './dto/product-response.dto';
import {
  AdminProductResponseDto,
  AdminTagResponseDto,
} from './dto/admin-product-response.dto';

@ApiTags('Admin: products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── Products ───────────────────────────────────────────────

  @Post()
  @Permissions('product.create')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, type: AdminProductResponseDto })
  create(@Body() dto: CreateProductDto): Promise<AdminProductResponseDto> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminProductResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('product.delete')
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  // ── Images ────────────────────────────────────────────────

  @Post(':id/images')
  @Permissions('product.update')
  @ApiOperation({ summary: 'Add image to product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 201, type: ProductImageResponseDto })
  addImage(@Param('id') id: string, @Body() dto: CreateProductImageDto) {
    return this.productsService.addImage(id, dto);
  }

  @Post(':id/images/upload')
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
  @Permissions('product.update')
  @ApiOperation({ summary: 'Add variant to product' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiResponse({ status: 201, type: ProductVariantResponseDto })
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
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

@ApiTags('Admin: tags')
@Controller('admin/tags')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminTagsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Permissions('product.create')
  @ApiOperation({ summary: 'Create a tag' })
  @ApiResponse({ status: 201, type: AdminTagResponseDto })
  createTag(@Body() dto: CreateTagDto): Promise<AdminTagResponseDto> {
    return this.productsService.createTag(dto);
  }

  @Delete(':id')
  @Permissions('product.delete')
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  removeTag(@Param('id') id: string) {
    return this.productsService.removeTag(id);
  }
}
