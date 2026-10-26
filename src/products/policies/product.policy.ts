import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '../enums/product-status.enum';

// The fields the publish rules look at. Kept structural so the policy can be
// checked against a DTO (on create) as well as a loaded entity (on update).
export interface PublishableProduct {
  basePrice: number;
  images?: unknown[] | null;
}

// Business rules for products, kept separate from ProductsService so the
// service only orchestrates persistence. Authorization (who may call an
// endpoint) stays with PermissionsGuard; this class decides what is allowed
// to happen to a product given its current state.
@Injectable()
export class ProductPolicy {
  // ARCHIVED products must go back to DRAFT before they can be re-published,
  // so someone reviews them before they reappear on the storefront.
  private static readonly TRANSITIONS: Record<ProductStatus, ProductStatus[]> =
    {
      [ProductStatus.DRAFT]: [ProductStatus.PUBLISHED, ProductStatus.ARCHIVED],
      [ProductStatus.PUBLISHED]: [ProductStatus.DRAFT, ProductStatus.ARCHIVED],
      [ProductStatus.ARCHIVED]: [ProductStatus.DRAFT],
    };

  // ── Visibility ────────────────────────────────────────────

  isPubliclyVisible(status: ProductStatus): boolean {
    return status === ProductStatus.PUBLISHED;
  }

  // Status the storefront is restricted to when `publishedOnly` is set.
  get publicStatus(): ProductStatus {
    return ProductStatus.PUBLISHED;
  }

  // ── Status ────────────────────────────────────────────────

  canTransition(from: ProductStatus, to: ProductStatus): boolean {
    return from === to || ProductPolicy.TRANSITIONS[from].includes(to);
  }

  assertCanTransition(from: ProductStatus, to: ProductStatus): void {
    if (!this.canTransition(from, to))
      throw new BadRequestException(
        `Cannot change product status from '${from}' to '${to}'`,
      );
  }

  assertCanPublish(product: PublishableProduct): void {
    if (!(Number(product.basePrice) > 0))
      throw new BadRequestException(
        'Product must have a price greater than 0 to be published',
      );
    if (!product.images?.length)
      throw new BadRequestException(
        'Product must have at least one image to be published',
      );
  }

  // ── Mutations ─────────────────────────────────────────────

  // Published products are live on the storefront and may sit in carts or
  // wishlists; they must be archived (or moved to draft) before deletion.
  assertCanDelete(status: ProductStatus): void {
    if (status === ProductStatus.PUBLISHED)
      throw new BadRequestException(
        'Published products cannot be deleted; archive it first',
      );
  }

  // A published product must keep at least one image.
  assertCanRemoveImage(status: ProductStatus, imageCount: number): void {
    if (status === ProductStatus.PUBLISHED && imageCount <= 1)
      throw new BadRequestException(
        'Cannot remove the last image of a published product',
      );
  }
}
