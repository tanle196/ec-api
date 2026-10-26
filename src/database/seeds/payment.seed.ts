import { DataSource } from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { Payment } from '@/payments/entities/payment.entity';
import { PaymentMethod } from '@/payments/enums/payment-method.enum';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';

interface PaymentSeedData {
  userEmail: string;
  orderStatus: OrderStatus;
  method: PaymentMethod;
  paymentStatus: PaymentStatus;
  transactionId?: string;
  paidDaysAgo?: number;
}

const PAYMENTS: PaymentSeedData[] = [
  {
    userEmail: 'member@example.com',
    orderStatus: OrderStatus.DELIVERED,
    method: PaymentMethod.VNPAY,
    paymentStatus: PaymentStatus.COMPLETED,
    transactionId: 'VNPAY-TXN-20260415-001',
    paidDaysAgo: 30,
  },
  {
    userEmail: 'member@example.com',
    orderStatus: OrderStatus.PROCESSING,
    method: PaymentMethod.MOMO,
    paymentStatus: PaymentStatus.COMPLETED,
    transactionId: 'MOMO-TXN-20260510-002',
    paidDaysAgo: 5,
  },
  {
    userEmail: 'member@example.com',
    orderStatus: OrderStatus.PENDING,
    method: PaymentMethod.COD,
    paymentStatus: PaymentStatus.PENDING,
  },
  {
    userEmail: 'member@example.com',
    orderStatus: OrderStatus.CANCELLED,
    method: PaymentMethod.STRIPE,
    paymentStatus: PaymentStatus.FAILED,
    transactionId: 'STRIPE-TXN-20260315-003',
  },
  {
    userEmail: 'admin@example.com',
    orderStatus: OrderStatus.SHIPPED,
    method: PaymentMethod.BANK_TRANSFER,
    paymentStatus: PaymentStatus.COMPLETED,
    transactionId: 'BANK-TXN-20260512-004',
    paidDaysAgo: 3,
  },
];

export async function seedPayments(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const orderRepo = dataSource.getRepository(Order);
  const paymentRepo = dataSource.getRepository(Payment);

  for (const data of PAYMENTS) {
    const user = await userRepo.findOne({ where: { email: data.userEmail } });
    if (!user) {
      console.warn(`  [!] User "${data.userEmail}" not found, skipping`);
      continue;
    }

    const order = await orderRepo.findOne({
      where: { user_id: user.id, status: data.orderStatus },
    });
    if (!order) {
      console.warn(
        `  [!] Order [${data.orderStatus}] for "${data.userEmail}" not found, skipping`,
      );
      continue;
    }

    const existing = await paymentRepo.findOne({
      where: { order_id: order.id },
    });
    if (existing) {
      console.log(
        `  [~] Payment for order ${order.orderNumber} already exists, skipping`,
      );
      continue;
    }

    let paidAt: Date | null = null;
    if (data.paymentStatus === PaymentStatus.COMPLETED && data.paidDaysAgo) {
      paidAt = new Date();
      paidAt.setDate(paidAt.getDate() - data.paidDaysAgo);
    }

    const payment = paymentRepo.create({
      order_id: order.id,
      method: data.method,
      status: data.paymentStatus,
      amount: order.total,
      transactionId: data.transactionId ?? null,
      metadata: data.transactionId
        ? { gateway: data.method, raw: { txnId: data.transactionId } }
        : null,
      paidAt,
    });

    const saved = await paymentRepo.save(payment);
    console.log(
      `  [+] Payment [${data.paymentStatus}] via ${data.method} for order ${order.orderNumber} → ${Number(order.total).toLocaleString('vi-VN')}₫ (id: ${saved.id})`,
    );
  }
}
