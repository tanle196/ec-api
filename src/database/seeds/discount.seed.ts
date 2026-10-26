import { DataSource } from 'typeorm';
import { Discount } from '@/discounts/entities/discount.entity';
import { DiscountType } from '@/discounts/enums/discount-type.enum';

interface DiscountSeedData {
  code: string;
  type: DiscountType;
  value: number;
  minOrderValue?: number;
  usageLimit?: number;
  isActive?: boolean;
  startsAt?: Date;
  expiresAt?: Date;
}

const now = new Date();
const future = (days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d;
};
const past = (days: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
};

const DISCOUNTS: DiscountSeedData[] = [
  {
    code: 'WELCOME10',
    type: DiscountType.PERCENT,
    value: 10,
    minOrderValue: 100000,
    usageLimit: 500,
    isActive: true,
    expiresAt: future(365),
  },
  {
    code: 'SALE20',
    type: DiscountType.PERCENT,
    value: 20,
    minOrderValue: 300000,
    usageLimit: 200,
    isActive: true,
    startsAt: now,
    expiresAt: future(30),
  },
  {
    code: 'FREESHIP',
    type: DiscountType.FIXED,
    value: 30000,
    minOrderValue: 200000,
    isActive: true,
    expiresAt: future(60),
  },
  {
    code: 'VIP50',
    type: DiscountType.PERCENT,
    value: 50,
    minOrderValue: 1000000,
    usageLimit: 50,
    isActive: true,
    expiresAt: future(90),
  },
  {
    code: 'FLASH100K',
    type: DiscountType.FIXED,
    value: 100000,
    minOrderValue: 500000,
    usageLimit: 100,
    isActive: true,
    startsAt: now,
    expiresAt: future(7),
  },
  {
    code: 'EXPIRED30',
    type: DiscountType.PERCENT,
    value: 30,
    isActive: false,
    expiresAt: past(10),
  },
];

export async function seedDiscounts(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Discount);

  for (const data of DISCOUNTS) {
    const existing = await repo.findOne({ where: { code: data.code } });
    if (existing) {
      console.log(`  [~] Discount "${data.code}" already exists, skipping`);
      continue;
    }

    const discount = repo.create({
      ...data,
      isActive: data.isActive ?? true,
    });

    await repo.save(discount);
    console.log(
      `  [+] ${data.code} — ${data.type === DiscountType.PERCENT ? `${data.value}%` : `${data.value.toLocaleString('vi-VN')}₫`}${data.minOrderValue ? ` (min ${data.minOrderValue.toLocaleString('vi-VN')}₫)` : ''}${data.usageLimit ? ` · limit ${data.usageLimit}` : ''}`,
    );
  }
}
