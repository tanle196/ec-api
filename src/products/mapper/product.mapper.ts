import {
  ProductImageResponseDto,
  ProductListItemDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  TagResponseDto,
} from '../dto/product-response.dto';
import { ProductImage } from '../entities/product-image.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { Tag } from '../entities/tag.entity';

export class ProductMapper {
  // publicId is a storage-provider internal and is intentionally not exposed.
  static toImage = (image: ProductImage): ProductImageResponseDto => ({
    id: image.id,
    variant_id: image.variant_id,
    url: image.url,
    alt: image.alt,
    isPrimary: image.isPrimary,
    sortOrder: image.sortOrder,
  });

  static toVariant = (variant: ProductVariant): ProductVariantResponseDto => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price: variant.price,
    stock: variant.stock,
    attributes: variant.attributes,
    isActive: variant.isActive,
    createdAt: variant.createdAt,
    updatedAt: variant.updatedAt,
  });

  static toTag = (tag: Tag): TagResponseDto => ({
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
  });

  static toTagList = (tags: Tag[]): TagResponseDto[] =>
    tags.map(ProductMapper.toTag);

  // Admin view: every variant, including inactive ones.
  static toResponse = (entity: Product): ProductResponseDto => ({
    id: entity.id,
    category_id: entity.category_id,
    name: entity.name,
    slug: entity.slug,
    description: entity.description,
    basePrice: entity.basePrice,
    sku: entity.sku,
    status: entity.status,
    isFeatured: entity.isFeatured,
    images: (entity.images ?? []).map(ProductMapper.toImage),
    variants: (entity.variants ?? []).map(ProductMapper.toVariant),
    tags: ProductMapper.toTagList(entity.tags ?? []),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  // Storefront view: inactive variants are not purchasable, so they are hidden.
  static toPublicResponse = (entity: Product): ProductResponseDto => {
    const response = ProductMapper.toResponse(entity);
    return {
      ...response,
      variants: response.variants.filter((v) => v.isActive),
    };
  };

  static toListItem = (entity: Product): ProductListItemDto => ({
    id: entity.id,
    category_id: entity.category_id,
    name: entity.name,
    slug: entity.slug,
    basePrice: entity.basePrice,
    sku: entity.sku,
    status: entity.status,
    isFeatured: entity.isFeatured,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
