import {
  WishlistItemResponseDto,
  WishlistProductDto,
  WishlistResponseDto,
} from '../dto/wishlist-response.dto';
import { Wishlist } from '../entities/wishlist.entity';
import { Product } from '@/products/entities/product.entity';

export class WishlistMapper {
  static toProduct = (product: Product): WishlistProductDto => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    basePrice: product.basePrice,
    sku: product.sku,
    status: product.status,
    isFeatured: product.isFeatured,
    description: product.description,
  });

  static toItem = (item: Wishlist): WishlistItemResponseDto => ({
    id: item.id,
    product_id: item.product_id,
    product: WishlistMapper.toProduct(item.product),
    createdAt: item.createdAt,
  });

  static toResponse = (items: Wishlist[]): WishlistResponseDto => ({
    items: items.map(WishlistMapper.toItem),
    total: items.length,
  });
}
