import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedPermissions } from './permission.seed';
import { seedRoles } from './role.seed';
import { seedUsers } from './user.seed';

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

    console.log('\nSeed completed successfully.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
