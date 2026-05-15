import { DataSource } from 'typeorm';
import { Review } from '@/reviews/entities/review.entity';
import { User } from '@/users/entities/user.entity';
import { Product } from '@/products/entities/product.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';

interface ReviewSeedData {
  userEmail: string;
  // Identify product via one of its variant SKUs
  variantSku: string;
  rating: number;
  title?: string;
  content?: string;
  isApproved?: boolean;
}

const REVIEWS: ReviewSeedData[] = [
  // member@example.com — đã mua iPhone 15 Pro (DELIVERED) → isVerified = true
  {
    userEmail: 'member@example.com',
    variantSku: 'IPH-15-PRO-BLK-256',
    rating: 5,
    title: 'Sản phẩm tuyệt vời!',
    content:
      'Camera cực kỳ sắc nét, hiệu năng mượt mà, pin trâu hơn đời trước rất nhiều. Rất hài lòng với lần mua này.',
    isApproved: true,
  },
  // member@example.com — đã mua Polo Men (DELIVERED) → isVerified = true
  {
    userEmail: 'member@example.com',
    variantSku: 'POLO-MEN-WHT-M',
    rating: 4,
    title: 'Vải tốt, form đẹp',
    content:
      'Chất liệu cotton thoáng mát, form áo vừa vặn. Màu trắng giữ được khá lâu sau nhiều lần giặt. Chỉ tiếc là giao hàng hơi chậm.',
    isApproved: true,
  },
  // admin@example.com — chưa có đơn DELIVERED → isVerified = false
  {
    userEmail: 'admin@example.com',
    variantSku: 'MBA-M3-MID-8-256',
    rating: 5,
    title: 'Macbook Air M3 đỉnh của chóp',
    content:
      'Máy chạy rất êm, không nóng ngay cả khi compile lâu. Màn hình Liquid Retina đẹp mắt. Đáng tiền từng xu.',
    isApproved: true,
  },
  // Chưa được duyệt
  {
    userEmail: 'member@example.com',
    variantSku: 'LAMP-LED-WHT',
    rating: 3,
    title: 'Tạm được',
    content: 'Đèn sáng vừa phải, cảm ứng đôi khi hơi nhạy. Giá tầm trung thì chấp nhận được.',
    isApproved: false,
  },
];

async function isVerifiedPurchase(
  dataSource: DataSource,
  userId: string,
  productId: string,
): Promise<boolean> {
  const count = await dataSource
    .getRepository(Order)
    .createQueryBuilder('o')
    .innerJoin('o.items', 'i')
    .innerJoin('i.variant', 'v')
    .where('o.user_id = :userId', { userId })
    .andWhere('o.status = :status', { status: OrderStatus.DELIVERED })
    .andWhere('v.product_id = :productId', { productId })
    .getCount();

  return count > 0;
}

export async function seedReviews(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const reviewRepo = dataSource.getRepository(Review);

  for (const data of REVIEWS) {
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

    const productId = variant.product_id;

    const existing = await reviewRepo.findOne({
      where: { user_id: user.id, product_id: productId },
    });
    if (existing) {
      console.log(`  [~] Review by "${data.userEmail}" for product ${productId} already exists`);
      continue;
    }

    const isVerified = await isVerifiedPurchase(dataSource, user.id, productId);

    const review = reviewRepo.create({
      user_id: user.id,
      product_id: productId,
      rating: data.rating,
      title: data.title ?? null,
      content: data.content ?? null,
      isVerified,
      isApproved: data.isApproved ?? false,
    });

    await reviewRepo.save(review);

    const stars = '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
    const verified = isVerified ? ' ✓verified' : '';
    const approved = (data.isApproved ?? false) ? ' ✓approved' : ' (pending)';
    console.log(
      `  [+] ${data.userEmail} → ${data.variantSku} ${stars}${verified}${approved}`,
    );
  }
}
