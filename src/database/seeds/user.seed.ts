import { AppDataSource } from '../data-source';
import { User } from '../../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(User);

  const users: Partial<User>[] = [
    {
      full_name: 'Admin',
      email: 'admin@example.com',
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
      is_active: true,
    },
    {
      full_name: 'Staff User',
      email: 'staff@example.com',
      password: await bcrypt.hash('staff123', 10),
      role: 'staff',
      is_active: true,
    },
    {
      full_name: 'Customer',
      email: 'customer@example.com',
      password: await bcrypt.hash('customer123', 10),
      role: 'customer',
      is_active: true,
    },
  ];

  for (const data of users) {
    const exists = await repo.findOne({ where: { email: data.email } });
    if (!exists) {
      await repo.save(repo.create(data));
      console.log(`Seeded: ${data.email}`);
    } else {
      console.log(`Skipped (exists): ${data.email}`);
    }
  }

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
