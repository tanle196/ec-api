import { DataSource } from 'typeorm';
import { Category } from '@/categories/entities/category.entity';

interface CategorySeedData {
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  children?: Omit<CategorySeedData, 'children'>[];
}

const CATEGORIES: CategorySeedData[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic devices and accessories',
    sortOrder: 1,
    children: [
      { name: 'Phones', slug: 'phones', sortOrder: 1 },
      { name: 'Laptops', slug: 'laptops', sortOrder: 2 },
      { name: 'Tablets', slug: 'tablets', sortOrder: 3 },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    description: 'Clothing and accessories',
    sortOrder: 2,
    children: [
      { name: 'Men', slug: 'fashion-men', sortOrder: 1 },
      { name: 'Women', slug: 'fashion-women', sortOrder: 2 },
      { name: 'Kids', slug: 'fashion-kids', sortOrder: 3 },
    ],
  },
  {
    name: 'Home & Living',
    slug: 'home-living',
    description: 'Furniture and home décor',
    sortOrder: 3,
  },
];

export async function seedCategories(
  dataSource: DataSource,
): Promise<Category[]> {
  const repo = dataSource.getRepository(Category);
  const result: Category[] = [];

  for (const data of CATEGORIES) {
    let parent = await repo.findOne({ where: { slug: data.slug } });

    if (!parent) {
      parent = repo.create({
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: true,
      });
      await repo.save(parent);
      console.log(`  [+] Category: ${data.name}`);
    } else {
      console.log(`  [~] Category exists: ${data.name}`);
    }

    result.push(parent);

    for (const child of data.children ?? []) {
      let childCat = await repo.findOne({ where: { slug: child.slug } });

      if (!childCat) {
        childCat = repo.create({
          name: child.name,
          slug: child.slug,
          description: child.description ?? null,
          sortOrder: child.sortOrder ?? 0,
          isActive: true,
          parent,
        });
        await repo.save(childCat);
        console.log(`    [+] Sub-category: ${child.name}`);
      } else {
        console.log(`    [~] Sub-category exists: ${child.name}`);
      }

      result.push(childCat);
    }
  }

  return result;
}
