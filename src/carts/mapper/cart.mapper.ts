import {
  CartItemResponseDto,
  CartItemVariantDto,
  CartResponseDto,
} from '../dto/cart-response.dto';
import { CartItem } from '../entities/cart-item.entity';
import { Cart } from '../entities/cart.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';

export class CartMapper {
  static toVariant = (variant: ProductVariant): CartItemVariantDto => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price: variant.price,
    stock: variant.stock,
    attributes: variant.attributes,
  });

  static toItem = (item: CartItem): CartItemResponseDto => ({
    id: item.id,
    cart_id: item.cart_id,
    variant_id: item.variant_id,
    variant: CartMapper.toVariant(item.variant),
    quantity: item.quantity,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });

  static toResponse = (entity: Cart): CartResponseDto => ({
    id: entity.id,
    user_id: entity.user_id,
    items: (entity.items ?? []).map(CartMapper.toItem),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}
