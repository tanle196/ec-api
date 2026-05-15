import { DataSource } from 'typeorm';
import { Wishlist } from '@/wishlists/entities/wishlist.entity';
import { User } from '@/users/entities/user.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';

interface WishlistSeedData {
  userEmail: string;
  // Identify product via one of its variant SKUs
  variantSku: string;
}

const WISHLISTS: WishlistSeedData[] = [
  // member@example.com wishlist
  { userEmail: 'member@example.com', variantSku: 'MBA-M3-MID-8-256' },
  { userEmail: 'member@example.com', variantSku: 'LAMP-LED-WHT' },
  { userEmail: 'member@example.com', variantSku: 'POLO-MEN-BLK-M' },

  // admin@example.com wishlist
  { userEmail: 'admin@example.com', variantSku: 'IPH-15-PRO-BLK-256' },
  { userEmail: 'admin@example.com', variantSku: 'POLO-MEN-WHT-M' },
];

export async function seedWishlists(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const wishlistRepo = dataSource.getRepository(Wishlist);

  for (const data of WISHLISTS) {
    const user = await userRepo.findOne({ where: { email: data.userEmail } });
    if (!user) {
      console.warn(`  [!] User "${data.userEmail}" not found, skipping`);
      continue;
    }

    const variant = await variantRepo.findOne({
      where: { sku: data.variantSku },
    });
    if (!variant) {
      console.warn(`  [!] Variant SKU "${data.variantSku}" not found, skipping`);
      continue;
    }

    const existing = await wishlistRepo.findOne({
      where: { user_id: user.id, product_id: variant.product_id },
    });
    if (existing) {
      console.log(
        `  [~] Wishlist entry for "${data.userEmail}" / product ${variant.product_id} already exists`,
      );
      continue;
    }

    await wishlistRepo.save(
      wishlistRepo.create({
        user_id: user.id,
        product_id: variant.product_id,
      }),
    );

    console.log(`  [+] ${data.userEmail} → ${data.variantSku}`);
  }
}
