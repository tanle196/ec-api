import { DataSource } from 'typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { User } from '@/users/entities/user.entity';

interface AddressSeedData {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  country?: string;
  postalCode?: string;
  isDefault?: boolean;
}

const ADDRESS_BY_EMAIL: Record<string, AddressSeedData[]> = {
  'member@example.com': [
    {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      addressLine1: '123 Đường Lê Lợi',
      addressLine2: 'Phường Bến Nghé',
      city: 'Thành phố Hồ Chí Minh',
      province: 'Hồ Chí Minh',
      postalCode: '700000',
      isDefault: true,
    },
    {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      addressLine1: '45 Đường Nguyễn Huệ',
      city: 'Thành phố Hồ Chí Minh',
      province: 'Hồ Chí Minh',
      postalCode: '700000',
      isDefault: false,
    },
  ],
  'admin@example.com': [
    {
      fullName: 'Admin User',
      phone: '0912345678',
      addressLine1: '10 Phố Tràng Tiền',
      addressLine2: 'Phường Tràng Tiền',
      city: 'Hà Nội',
      province: 'Hà Nội',
      postalCode: '100000',
      isDefault: true,
    },
  ],
};

export async function seedAddresses(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const addressRepo = dataSource.getRepository(Address);

  for (const [email, addresses] of Object.entries(ADDRESS_BY_EMAIL)) {
    const user = await userRepo.findOne({ where: { email } });
    if (!user) {
      console.warn(`  [!] User "${email}" not found, skipping addresses`);
      continue;
    }

    const existing = await addressRepo.count({ where: { user_id: user.id } });
    if (existing > 0) {
      console.log(`  [~] Addresses exist for: ${email}`);
      continue;
    }

    for (const data of addresses) {
      const address = addressRepo.create({ ...data, user_id: user.id });
      await addressRepo.save(address);
      console.log(`  [+] Address for ${email}: ${data.addressLine1}`);
    }
  }
}
