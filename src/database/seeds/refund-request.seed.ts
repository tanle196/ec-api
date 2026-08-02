import { DataSource } from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { Order } from '@/orders/entities/order.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { Payment } from '@/payments/entities/payment.entity';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';
import { RefundRequest } from '@/payments/entities/refund-request.entity';
import { RefundRequestStatus } from '@/payments/enums/refund-request-status.enum';

interface RefundRequestSeedData {
  userEmail: string;
  orderStatus: OrderStatus;
  variantSku: string;
  quantity: number;
  reason: string;
  status: RefundRequestStatus;
  adminNote?: string;
}

// One PENDING request awaiting admin review, and one REJECTED request (with
// an admin note) to show both outcomes in the refund-request queue.
const REFUND_REQUESTS: RefundRequestSeedData[] = [
  {
    userEmail: 'member@example.com',
    orderStatus: OrderStatus.PROCESSING,
    variantSku: 'MBA-M3-MID-8-256',
    quantity: 1,
    reason: 'Đổi ý, không còn nhu cầu sử dụng sản phẩm',
    status: RefundRequestStatus.PENDING,
  },
  {
    userEmail: 'admin@example.com',
    orderStatus: OrderStatus.SHIPPED,
    variantSku: 'MBA-M3-STR-8-256',
    quantity: 1,
    reason: 'Sản phẩm giao chậm hơn dự kiến',
    status: RefundRequestStatus.REJECTED,
    adminNote:
      'Đơn hàng vẫn trong thời gian giao hàng cam kết, không đủ điều kiện hoàn tiền',
  },
];

export async function seedRefundRequests(
  dataSource: DataSource,
): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItem);
  const paymentRepo = dataSource.getRepository(Payment);
  const refundRequestRepo = dataSource.getRepository(RefundRequest);

  const reviewer = await userRepo.findOne({
    where: { email: 'superadmin@example.com' },
  });

  for (const data of REFUND_REQUESTS) {
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

    const payment = await paymentRepo.findOne({
      where: { order_id: order.id },
    });
    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      console.warn(
        `  [!] No completed payment for order ${order.orderNumber}, skipping refund request`,
      );
      continue;
    }

    const items = await itemRepo.find({
      where: { order_id: order.id },
      relations: ['variant'],
    });
    const targetItem = items.find((i) => i.variant?.sku === data.variantSku);
    if (!targetItem) {
      console.warn(
        `  [!] Order item "${data.variantSku}" not found on order ${order.orderNumber}, skipping refund request`,
      );
      continue;
    }

    const existing = await refundRequestRepo.findOne({
      where: { payment_id: payment.id },
    });
    if (existing) {
      console.log(
        `  [~] Refund request for order ${order.orderNumber} already exists, skipping`,
      );
      continue;
    }

    const amount = Number(targetItem.unitPrice) * data.quantity;

    const refundRequest = refundRequestRepo.create({
      payment_id: payment.id,
      order_id: order.id,
      requested_by: user.id,
      amount,
      reason: data.reason,
      status: data.status,
      adminNote: data.adminNote ?? null,
      reviewedBy:
        data.status === RefundRequestStatus.PENDING
          ? null
          : (reviewer?.id ?? null),
      reviewedAt:
        data.status === RefundRequestStatus.PENDING ? null : new Date(),
      items: [
        {
          order_item_id: targetItem.id,
          quantity: data.quantity,
          amount,
        },
      ],
    });

    const saved = await refundRequestRepo.save(refundRequest);

    console.log(
      `  [+] Refund request [${data.status}] of ${amount.toLocaleString('vi-VN')}₫ for ${data.quantity}x ${data.variantSku} on order ${order.orderNumber} (id: ${saved.id})`,
    );
  }
}
