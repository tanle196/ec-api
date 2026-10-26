import { DataSource } from 'typeorm';
import { Category } from '@/categories/entities/category.entity';
import { Tag } from '@/products/entities/tag.entity';
import { Product } from '@/products/entities/product.entity';
import { ProductImage } from '@/products/entities/product-image.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { ProductStatus } from '@/products/enums/product-status.enum';

interface TagSeedData {
  name: string;
  slug: string;
}

interface ImageSeedData {
  url: string;
  alt?: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

interface VariantSeedData {
  name: string;
  sku: string;
  price: number;
  stock: number;
  attributes?: Record<string, unknown>;
}

interface ProductSeedData {
  categorySlug: string;
  name: string;
  slug: string;
  sku: string;
  basePrice: number;
  description?: string;
  status?: ProductStatus;
  isFeatured?: boolean;
  tagSlugs?: string[];
  images?: ImageSeedData[];
  variants?: VariantSeedData[];
}

const TAGS: TagSeedData[] = [
  { name: 'Sale', slug: 'sale' },
  { name: 'New Arrival', slug: 'new-arrival' },
  { name: 'Best Seller', slug: 'best-seller' },
  { name: 'Limited Edition', slug: 'limited-edition' },
];

const PRODUCTS: ProductSeedData[] = [
  {
    categorySlug: 'phones',
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    sku: 'IPH-15-PRO',
    basePrice: 29990000,
    description: 'Điện thoại iPhone 15 Pro với chip A17 Pro mạnh mẽ.',
    status: ProductStatus.PUBLISHED,
    isFeatured: true,
    tagSlugs: ['new-arrival', 'best-seller'],
    images: [
      {
        url: 'https://cdn.example.com/iphone-15-pro-1.jpg',
        alt: 'iPhone 15 Pro - Titanium Black',
        isPrimary: true,
        sortOrder: 1,
      },
      {
        url: 'https://cdn.example.com/iphone-15-pro-2.jpg',
        alt: 'iPhone 15 Pro - Back view',
        sortOrder: 2,
      },
    ],
    variants: [
      {
        name: 'Titan Đen - 256GB',
        sku: 'IPH-15-PRO-BLK-256',
        price: 29990000,
        stock: 50,
        attributes: { color: 'Titan Đen', storage: '256GB' },
      },
      {
        name: 'Titan Trắng - 256GB',
        sku: 'IPH-15-PRO-WHT-256',
        price: 29990000,
        stock: 40,
        attributes: { color: 'Titan Trắng', storage: '256GB' },
      },
      {
        name: 'Titan Đen - 512GB',
        sku: 'IPH-15-PRO-BLK-512',
        price: 34990000,
        stock: 20,
        attributes: { color: 'Titan Đen', storage: '512GB' },
      },
    ],
  },
  {
    categorySlug: 'laptops',
    name: 'MacBook Air M3',
    slug: 'macbook-air-m3',
    sku: 'MBA-M3-13',
    basePrice: 27990000,
    description: 'MacBook Air 13 inch chip M3, pin 18 giờ.',
    status: ProductStatus.PUBLISHED,
    isFeatured: true,
    tagSlugs: ['new-arrival'],
    images: [
      {
        url: 'https://cdn.example.com/macbook-air-m3-1.jpg',
        alt: 'MacBook Air M3 - Midnight',
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    variants: [
      {
        name: 'Midnight - 8GB/256GB',
        sku: 'MBA-M3-MID-8-256',
        price: 27990000,
        stock: 30,
        attributes: { color: 'Midnight', ram: '8GB', storage: '256GB' },
      },
      {
        name: 'Starlight - 8GB/256GB',
        sku: 'MBA-M3-STR-8-256',
        price: 27990000,
        stock: 25,
        attributes: { color: 'Starlight', ram: '8GB', storage: '256GB' },
      },
      {
        name: 'Midnight - 16GB/512GB',
        sku: 'MBA-M3-MID-16-512',
        price: 34990000,
        stock: 15,
        attributes: { color: 'Midnight', ram: '16GB', storage: '512GB' },
      },
    ],
  },
  {
    categorySlug: 'fashion-men',
    name: 'Áo Polo Nam Basic',
    slug: 'ao-polo-nam-basic',
    sku: 'POLO-MEN-BASIC',
    basePrice: 350000,
    description: 'Áo polo nam chất liệu cotton cao cấp, thoáng mát.',
    status: ProductStatus.PUBLISHED,
    isFeatured: false,
    tagSlugs: ['sale', 'best-seller'],
    images: [
      {
        url: 'https://cdn.example.com/polo-men-1.jpg',
        alt: 'Áo Polo Nam - Trắng',
        isPrimary: true,
        sortOrder: 1,
      },
    ],
    variants: [
      {
        name: 'Trắng - S',
        sku: 'POLO-MEN-WHT-S',
        price: 350000,
        stock: 100,
        attributes: { color: 'Trắng', size: 'S' },
      },
      {
        name: 'Trắng - M',
        sku: 'POLO-MEN-WHT-M',
        price: 350000,
        stock: 120,
        attributes: { color: 'Trắng', size: 'M' },
      },
      {
        name: 'Đen - M',
        sku: 'POLO-MEN-BLK-M',
        price: 350000,
        stock: 80,
        attributes: { color: 'Đen', size: 'M' },
      },
      {
        name: 'Đen - L',
        sku: 'POLO-MEN-BLK-L',
        price: 350000,
        stock: 90,
        attributes: { color: 'Đen', size: 'L' },
      },
    ],
  },
  {
    categorySlug: 'home-living',
    name: 'Đèn Ngủ LED Cảm Ứng',
    slug: 'den-ngu-led-cam-ung',
    sku: 'LAMP-LED-TOUCH',
    basePrice: 299000,
    description: 'Đèn ngủ LED cảm ứng, 3 mức độ sáng, pin sạc USB.',
    status: ProductStatus.DRAFT,
    isFeatured: false,
    tagSlugs: [],
    images: [],
    variants: [
      {
        name: 'Trắng',
        sku: 'LAMP-LED-WHT',
        price: 299000,
        stock: 200,
        attributes: { color: 'Trắng' },
      },
      {
        name: 'Đen',
        sku: 'LAMP-LED-BLK',
        price: 299000,
        stock: 150,
        attributes: { color: 'Đen' },
      },
    ],
  },
];

export async function seedProducts(dataSource: DataSource): Promise<void> {
  const categoryRepo = dataSource.getRepository(Category);
  const tagRepo = dataSource.getRepository(Tag);
  const productRepo = dataSource.getRepository(Product);
  const imageRepo = dataSource.getRepository(ProductImage);
  const variantRepo = dataSource.getRepository(ProductVariant);

  // Seed tags
  console.log('  Seeding tags...');
  const tagMap = new Map<string, Tag>();

  for (const data of TAGS) {
    let tag = await tagRepo.findOne({ where: { slug: data.slug } });

    if (!tag) {
      tag = await tagRepo.save(tagRepo.create(data));
      console.log(`    [+] Tag: ${data.name}`);
    } else {
      console.log(`    [~] Tag exists: ${data.name}`);
    }

    tagMap.set(data.slug, tag);
  }

  // Seed products
  console.log('  Seeding products...');
  for (const data of PRODUCTS) {
    const existing = await productRepo.findOne({ where: { slug: data.slug } });
    if (existing) {
      console.log(`    [~] Product exists: ${data.name}`);
      continue;
    }

    const category = await categoryRepo.findOne({
      where: { slug: data.categorySlug },
    });
    if (!category) {
      console.warn(
        `    [!] Category "${data.categorySlug}" not found, skipping product "${data.name}"`,
      );
      continue;
    }

    const tags = (data.tagSlugs ?? [])
      .map((slug) => tagMap.get(slug))
      .filter((t): t is Tag => !!t);

    const product = await productRepo.save(
      productRepo.create({
        category_id: category.id,
        name: data.name,
        slug: data.slug,
        sku: data.sku,
        basePrice: data.basePrice,
        description: data.description ?? null,
        status: data.status ?? ProductStatus.DRAFT,
        isFeatured: data.isFeatured ?? false,
        tags,
      }),
    );

    if (data.images?.length) {
      await imageRepo.save(
        data.images.map((img) =>
          imageRepo.create({ ...img, product_id: product.id }),
        ),
      );
    }

    if (data.variants?.length) {
      await variantRepo.save(
        data.variants.map((v) =>
          variantRepo.create({ ...v, product_id: product.id }),
        ),
      );
    }

    console.log(
      `    [+] Product: ${data.name} (${data.variants?.length ?? 0} variants, ${data.images?.length ?? 0} images)`,
    );
  }
}
