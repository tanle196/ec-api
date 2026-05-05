import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from '@/users/entities/user.entity';
import { Identity } from '@/auth/entities/identity.entity';
import { Role } from '@/roles/entities/role.entity';
import { AuthProvider } from '@/auth/enums/AuthProvider';

interface UserSeedData {
  email: string;
  fullName: string;
  password: string;
  roleName: string;
}

const USERS: UserSeedData[] = [
  {
    email: 'superadmin@example.com',
    fullName: 'Super Admin',
    password: 'SuperAdmin@123',
    roleName: 'super-admin',
  },
  {
    email: 'admin@example.com',
    fullName: 'Admin',
    password: 'Admin@123',
    roleName: 'admin',
  },
  {
    email: 'member@example.com',
    fullName: 'Member',
    password: 'Member@123',
    roleName: 'member',
  },
];

export async function seedUsers(
  dataSource: DataSource,
  roles: Role[],
): Promise<User[]> {
  const userRepo = dataSource.getRepository(User);
  const identityRepo = dataSource.getRepository(Identity);

  const users: User[] = [];

  for (const data of USERS) {
    let user = await userRepo.findOne({
      where: { email: data.email },
      relations: ['roles', 'identities'],
    });

    const role = roles.find((r) => r.name === data.roleName);
    if (!role) {
      console.warn(
        `  [!] Role "${data.roleName}" not found, skipping user ${data.email}`,
      );
      continue;
    }

    if (!user) {
      user = userRepo.create({
        email: data.email,
        fullName: data.fullName,
        roles: [role],
      });
      await userRepo.save(user);

      const passwordHash = await argon2.hash(data.password);
      const identity = identityRepo.create({
        provider: AuthProvider.LOCAL,
        providerUserId: data.email,
        passwordHash,
        isActive: true,
        user,
      });
      await identityRepo.save(identity);

      console.log(`  [+] User: ${data.email} (role: ${data.roleName})`);
    } else {
      user.roles = [role];
      await userRepo.save(user);
      console.log(`  [~] User updated: ${data.email}`);
    }

    users.push(user);
  }

  return users;
}
