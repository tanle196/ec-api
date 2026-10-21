import { ProductMapper } from './product.mapper';

describe('ProductMapper', () => {
  const createdAt = new Date('2026-01-01');
  const variant = (id: string, isActive: boolean) => ({
    id,
    product_id: 'product-1',
    product: { id: 'product-1' },
    name: id,
    sku: `SKU-${id}`,
    price: 100,
    stock: 5,
    attributes: null,
    isActive,
    createdAt,
    updatedAt: createdAt,
  });
  const product = {
    id: 'product-1',
    category_id: 'cat-1',
    category: { id: 'cat-1', imagePublicId: 'cat-secret' },
    name: 'Áo thun',
    slug: 'ao-thun',
    description: null,
    basePrice: 100,
    sku: 'AT',
    status: 'published',
    isFeatured: false,
    images: [
      {
        id: 'img-1',
        product_id: 'product-1',
        variant_id: null,
        url: 'https://cdn/img.png',
        publicId: 'products/img-1',
        alt: null,
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    variants: [variant('v-on', true), variant('v-off', false)],
    tags: [{ id: 't-1', name: 'Sale', slug: 'sale', products: [] }],
    createdAt,
    updatedAt: createdAt,
  };

  it('never exposes the storage publicId of images', () => {
    const [image] = ProductMapper.toResponse(product as never).images;

    expect(image).toEqual({
      id: 'img-1',
      variant_id: null,
      url: 'https://cdn/img.png',
      alt: null,
      isPrimary: true,
      sortOrder: 0,
    });
  });

  it('toResponse (admin) keeps inactive variants', () => {
    const result = ProductMapper.toResponse(product as never);

    expect(result.variants.map((v) => v.id)).toEqual(['v-on', 'v-off']);
    expect(result).not.toHaveProperty('category');
    expect(result.tags).toEqual([{ id: 't-1', name: 'Sale', slug: 'sale' }]);
  });

  it('toPublicResponse hides inactive variants', () => {
    const result = ProductMapper.toPublicResponse(product as never);

    expect(result.variants.map((v) => v.id)).toEqual(['v-on']);
  });

  it('defaults unloaded relations to empty arrays', () => {
    const result = ProductMapper.toResponse({
      ...product,
      images: undefined,
      variants: undefined,
      tags: undefined,
    } as never);

    expect(result).toMatchObject({ images: [], variants: [], tags: [] });
  });

  it('toListItem returns only list columns', () => {
    expect(ProductMapper.toListItem(product as never)).toEqual({
      id: 'product-1',
      category_id: 'cat-1',
      name: 'Áo thun',
      slug: 'ao-thun',
      basePrice: 100,
      sku: 'AT',
      status: 'published',
      isFeatured: false,
      createdAt,
      updatedAt: createdAt,
    });
  });
});
