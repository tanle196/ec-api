import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ProductVariant } from '@/products/entities/product-variant.entity';

// Business rules for carts. Lookups, locking and persistence stay in
// CartsService; this class decides whether a quantity of a variant may be
// put in the cart.
@Injectable()
export class CartPolicy {
  assertVariantPurchasable(variant: Pick<ProductVariant, 'isActive'>): void {
    if (!variant.isActive)
      throw new UnprocessableEntityException('Variant is inactive');
  }

  assertStockAvailable(stock: number, requested: number): void {
    if (stock < requested)
      throw new UnprocessableEntityException(
        `Insufficient stock: available ${stock}, requested ${requested}`,
      );
  }
}
