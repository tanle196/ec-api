import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductPolicy } from './product.policy';

describe('ProductPolicy', () => {
  const policy = new ProductPolicy();

  describe('visibility', () => {
    it('only exposes published products publicly', () => {
      expect(policy.isPubliclyVisible(ProductStatus.PUBLISHED)).toBe(true);
      expect(policy.isPubliclyVisible(ProductStatus.DRAFT)).toBe(false);
      expect(policy.isPubliclyVisible(ProductStatus.ARCHIVED)).toBe(false);
      expect(policy.publicStatus).toBe(ProductStatus.PUBLISHED);
    });
  });

  describe('status transitions', () => {
    it.each([
      [ProductStatus.DRAFT, ProductStatus.PUBLISHED],
      [ProductStatus.DRAFT, ProductStatus.ARCHIVED],
      [ProductStatus.PUBLISHED, ProductStatus.DRAFT],
      [ProductStatus.PUBLISHED, ProductStatus.ARCHIVED],
      [ProductStatus.ARCHIVED, ProductStatus.DRAFT],
      [ProductStatus.DRAFT, ProductStatus.DRAFT],
    ])('allows %s -> %s', (from, to) => {
      expect(() => policy.assertCanTransition(from, to)).not.toThrow();
    });

    it('rejects ARCHIVED -> PUBLISHED', () => {
      expect(() =>
        policy.assertCanTransition(
          ProductStatus.ARCHIVED,
          ProductStatus.PUBLISHED,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertCanPublish', () => {
    it('passes with a positive price and an image', () => {
      expect(() =>
        policy.assertCanPublish({ basePrice: 100, images: [{}] }),
      ).not.toThrow();
    });

    it('accepts a decimal string price as loaded from postgres', () => {
      expect(() =>
        policy.assertCanPublish({
          basePrice: '100.00' as unknown as number,
          images: [{}],
        }),
      ).not.toThrow();
    });

    it('rejects a zero price', () => {
      expect(() =>
        policy.assertCanPublish({ basePrice: 0, images: [{}] }),
      ).toThrow(BadRequestException);
    });

    it('rejects missing images', () => {
      expect(() => policy.assertCanPublish({ basePrice: 100 })).toThrow(
        BadRequestException,
      );
      expect(() =>
        policy.assertCanPublish({ basePrice: 100, images: [] }),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertCanDelete', () => {
    it('rejects published products', () => {
      expect(() => policy.assertCanDelete(ProductStatus.PUBLISHED)).toThrow(
        BadRequestException,
      );
    });

    it('allows draft and archived products', () => {
      expect(() => policy.assertCanDelete(ProductStatus.DRAFT)).not.toThrow();
      expect(() =>
        policy.assertCanDelete(ProductStatus.ARCHIVED),
      ).not.toThrow();
    });
  });

  describe('assertCanRemoveImage', () => {
    it('rejects removing the last image of a published product', () => {
      expect(() =>
        policy.assertCanRemoveImage(ProductStatus.PUBLISHED, 1),
      ).toThrow(BadRequestException);
    });

    it('allows it when other images remain or the product is not live', () => {
      expect(() =>
        policy.assertCanRemoveImage(ProductStatus.PUBLISHED, 2),
      ).not.toThrow();
      expect(() =>
        policy.assertCanRemoveImage(ProductStatus.DRAFT, 1),
      ).not.toThrow();
    });
  });
});
