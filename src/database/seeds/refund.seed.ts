import { DataSource } from 'typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { Payment } from '@/payments/entities/payment.entity';
import { Refund } from '@/payments/entities/refund.entity';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';
import { RefundStatus } from '@/payments/enums/refund-status.enum';

interface RefundSeedData {
  orderStatus: OrderStatus;
  variantSku: string;
  quantity: number;
  reason: string;
}

// Partial refund on the DELIVERED order's payment seeded in payment.seed.ts:
// refund 1 of the 2 "POLO-MEN-WHT-M" units, leaving the payment/order in a
// PARTIALLY_REFUNDED state so the item-level refund flow has example data.
const REFUNDS: RefundSeedData[] = [
  {
    orderStatus: OrderStatus.DELIVERED,
    variantSku: 'POLO-MEN-WHT-M',
    quantity: 1,
    reason: 'Sản phẩm bị lỗi đường chỉ, khách yêu cầu hoàn 1 sản phẩm',
  },
];

export async function seedRefunds(dataSource: DataSource): Promise<void> {
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItem);
  const paymentRepo = dataSource.getRepository(Payment);
  const refundRepo = dataSource.getRepository(Refund);

  for (const data of REFUNDS) {
    const order = await orderRepo.findOne({
      where: { status: data.orderStatus },
    });
    if (!order) {
      console.warn(
        `  [!] Order [${data.orderStatus}] not found, skipping refund`,
      );
      continue;
    }

    const payment = await paymentRepo.findOne({
      where: { order_id: order.id },
    });
    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      console.warn(
        `  [!] No completed payment for order ${order.orderNumber}, skipping refund`,
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
        `  [!] Order item "${data.variantSku}" not found on order ${order.orderNumber}, skipping refund`,
      );
      continue;
    }

    const existing = await refundRepo.findOne({
      where: { payment_id: payment.id },
    });
    if (existing) {
      console.log(
        `  [~] Refund for order ${order.orderNumber} already exists, skipping`,
      );
      continue;
    }

    const amount = Number(targetItem.unitPrice) * data.quantity;

    const refund = refundRepo.create({
      payment_id: payment.id,
      order_id: order.id,
      amount,
      reason: data.reason,
      status: RefundStatus.SUCCEEDED,
      actorId: null,
      items: [
        {
          order_item_id: targetItem.id,
          quantity: data.quantity,
          amount,
        },
      ],
    });

    const saved = await refundRepo.save(refund);

    payment.status = PaymentStatus.PARTIALLY_REFUNDED;
    await paymentRepo.save(payment);

    order.status = OrderStatus.PARTIALLY_REFUNDED;
    await orderRepo.save(order);

    console.log(
      `  [+] Refund of ${amount.toLocaleString('vi-VN')}₫ for ${data.quantity}x ${data.variantSku} on order ${order.orderNumber} (id: ${saved.id})`,
    );
  }
}
