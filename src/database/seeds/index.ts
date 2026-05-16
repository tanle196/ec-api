import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedPermissions } from './permission.seed';
import { seedRoles } from './role.seed';
import { seedUsers } from './user.seed';
import { seedCategories } from './category.seed';
import { seedProducts } from './product.seed';
import { seedAddresses } from './address.seed';
import { seedOrders } from './order.seed';
import { seedPayments } from './payment.seed';
import { seedCarts } from './cart.seed';
import { seedReviews } from './review.seed';
import { seedWishlists } from './wishlist.seed';
import { seedDiscounts } from './discount.seed';

async function main() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.\n');

  try {
    console.log('--- Seeding permissions ---');
    const permissions = await seedPermissions(AppDataSource);

    console.log('\n--- Seeding roles ---');
    const roles = await seedRoles(AppDataSource, permissions);

    console.log('\n--- Seeding users ---');
    await seedUsers(AppDataSource, roles);

    console.log('\n--- Seeding categories ---');
    await seedCategories(AppDataSource);

    console.log('\n--- Seeding products ---');
    await seedProducts(AppDataSource);

    console.log('\n--- Seeding addresses ---');
    await seedAddresses(AppDataSource);

    console.log('\n--- Seeding orders ---');
    await seedOrders(AppDataSource);

    console.log('\n--- Seeding payments ---');
    await seedPayments(AppDataSource);

    console.log('\n--- Seeding carts ---');
    await seedCarts(AppDataSource);

    console.log('\n--- Seeding reviews ---');
    await seedReviews(AppDataSource);

    console.log('\n--- Seeding wishlists ---');
    await seedWishlists(AppDataSource);

    console.log('\n--- Seeding discounts ---');
    await seedDiscounts(AppDataSource);

    console.log('\nSeed completed successfully.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
