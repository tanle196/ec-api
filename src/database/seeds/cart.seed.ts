import { DataSource } from 'typeorm';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { User } from '@/users/entities/user.entity';
import { Cart } from '@/carts/entities/cart.entity';
import { CartItem } from '@/carts/entities/cart-item.entity';

interface CartItemSeedData {
  variantSku: string;
  quantity: number;
}

interface CartSeedData {
  userEmail: string;
  items: CartItemSeedData[];
}

const CARTS: CartSeedData[] = [
  {
    userEmail: 'member@example.com',
    items: [
      { variantSku: 'IPH-15-PRO-BLK-256', quantity: 1 },
      { variantSku: 'POLO-MEN-WHT-M', quantity: 2 },
    ],
  },
  {
    userEmail: 'admin@example.com',
    items: [{ variantSku: 'MBA-M3-MID-8-256', quantity: 1 }],
  },
];

export async function seedCarts(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const cartRepo = dataSource.getRepository(Cart);
  const itemRepo = dataSource.getRepository(CartItem);

  for (const data of CARTS) {
    const user = await userRepo.findOne({ where: { email: data.userEmail } });
    if (!user) {
      console.warn(`  [!] User "${data.userEmail}" not found, skipping cart`);
      continue;
    }

    const existing = await cartRepo.findOne({ where: { user_id: user.id } });
    if (existing) {
      console.log(`  [~] Cart for ${data.userEmail} already exists, skipping`);
      continue;
    }

    const variantSkus = data.items.map((i) => i.variantSku);
    const variants = await variantRepo.find({
      where: variantSkus.map((sku) => ({ sku })),
    });
    const variantMap = new Map(variants.map((v) => [v.sku, v]));

    const missingSkus = variantSkus.filter((sku) => !variantMap.has(sku));
    if (missingSkus.length) {
      console.warn(
        `  [!] Variants not found: ${missingSkus.join(', ')}, skipping cart for ${data.userEmail}`,
      );
      continue;
    }

    const cart = await cartRepo.save(cartRepo.create({ user_id: user.id }));

    await itemRepo.save(
      data.items.map((itemData) =>
        itemRepo.create({
          cart_id: cart.id,
          variant_id: variantMap.get(itemData.variantSku)!.id,
          quantity: itemData.quantity,
        }),
      ),
    );

    const itemSummary = data.items
      .map((i) => `${i.variantSku} x${i.quantity}`)
      .join(', ');
    console.log(`  [+] Cart for ${data.userEmail}: ${itemSummary}`);
  }
}
