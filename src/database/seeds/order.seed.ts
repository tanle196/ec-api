import { DataSource } from 'typeorm';
import { InventoryMovement } from '@/inventory/entities/inventory-movement.entity';
import { InventoryMovementReason } from '@/inventory/enums/inventory-movement-reason.enum';
import { allocateProportionally } from '@/common/utils/allocation.util';
import { allocateOrderLines } from '@/orders/pricing/order-pricing';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { User } from '@/users/entities/user.entity';
import { Order } from '@/orders/entities/order.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';

interface OrderItemSeedData {
  variantSku: string;
  quantity: number;
}

interface OrderSeedData {
  userEmail: string;
  addressLine1: string;
  status: OrderStatus;
  shippingFee?: number;
  discount?: number;
  notes?: string;
  items: OrderItemSeedData[];
  createdDaysAgo?: number;
}

const ORDERS: OrderSeedData[] = [
  {
    userEmail: 'member@example.com',
    addressLine1: '123 Đường Lê Lợi',
    status: OrderStatus.DELIVERED,
    items: [
      { variantSku: 'IPH-15-PRO-BLK-256', quantity: 1 },
      { variantSku: 'POLO-MEN-WHT-M', quantity: 2 },
    ],
    notes: 'Giao giờ hành chính',
    createdDaysAgo: 30,
  },
  {
    userEmail: 'member@example.com',
    addressLine1: '123 Đường Lê Lợi',
    status: OrderStatus.PROCESSING,
    shippingFee: 30000,
    items: [{ variantSku: 'MBA-M3-MID-8-256', quantity: 1 }],
    createdDaysAgo: 5,
  },
  {
    userEmail: 'member@example.com',
    addressLine1: '45 Đường Nguyễn Huệ',
    status: OrderStatus.PENDING,
    items: [
      { variantSku: 'POLO-MEN-BLK-L', quantity: 3 },
      { variantSku: 'POLO-MEN-BLK-M', quantity: 1 },
    ],
    notes: 'Gọi trước khi giao',
    createdDaysAgo: 1,
  },
  {
    userEmail: 'member@example.com',
    addressLine1: '123 Đường Lê Lợi',
    status: OrderStatus.CANCELLED,
    items: [{ variantSku: 'IPH-15-PRO-BLK-512', quantity: 1 }],
    createdDaysAgo: 60,
  },
  {
    userEmail: 'admin@example.com',
    addressLine1: '10 Phố Tràng Tiền',
    status: OrderStatus.SHIPPED,
    shippingFee: 50000,
    items: [{ variantSku: 'MBA-M3-STR-8-256', quantity: 1 }],
    createdDaysAgo: 3,
  },
  {
    userEmail: 'letutan500@gmail.com',
    addressLine1: '88 Đường Trần Phú',
    status: OrderStatus.DELIVERED,
    items: [{ variantSku: 'IPH-15-PRO-WHT-256', quantity: 1 }],
    notes: 'Giao giờ hành chính',
    createdDaysAgo: 15,
  },
  {
    userEmail: 'letutan500@gmail.com',
    addressLine1: '88 Đường Trần Phú',
    status: OrderStatus.PENDING,
    items: [{ variantSku: 'MBA-M3-MID-16-512', quantity: 1 }],
    createdDaysAgo: 2,
  },
];

function generateOrderNumber(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${datePart}-${random}`;
}

const RESERVING_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
];

export async function seedOrders(dataSource: DataSource): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const addressRepo = dataSource.getRepository(Address);
  const variantRepo = dataSource.getRepository(ProductVariant);
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItem);
  const movementRepo = dataSource.getRepository(InventoryMovement);

  for (const data of ORDERS) {
    const user = await userRepo.findOne({ where: { email: data.userEmail } });
    if (!user) {
      console.warn(`  [!] User "${data.userEmail}" not found, skipping order`);
      continue;
    }

    const address = await addressRepo.findOne({
      where: { user_id: user.id, addressLine1: data.addressLine1 },
    });
    if (!address) {
      console.warn(
        `  [!] Address "${data.addressLine1}" not found for ${data.userEmail}, skipping`,
      );
      continue;
    }

    const variantSkus = data.items.map((i) => i.variantSku);
    const variants = await variantRepo.find({
      where: variantSkus.map((sku) => ({ sku })),
      relations: ['product'],
    });
    const variantMap = new Map(variants.map((v) => [v.sku, v]));

    const missingSkus = variantSkus.filter((sku) => !variantMap.has(sku));
    if (missingSkus.length) {
      console.warn(
        `  [!] Variants not found: ${missingSkus.join(', ')}, skipping order`,
      );
      continue;
    }

    let subtotal = 0;
    const itemsToSave: Partial<OrderItem>[] = [];

    for (const itemData of data.items) {
      const variant = variantMap.get(itemData.variantSku)!;
      const unitPrice = Number(variant.price);
      const total = unitPrice * itemData.quantity;
      subtotal += total;

      itemsToSave.push({
        variant_id: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        unitPrice,
        quantity: itemData.quantity,
        total,
      });
    }

    const shippingFee = data.shippingFee ?? 0;
    const discount = data.discount ?? 0;
    const total = subtotal + shippingFee - discount;
    const daysAgo = data.createdDaysAgo ?? 0;

    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);

    const order = orderRepo.create({
      user_id: user.id,
      address_id: address.id,
      orderNumber: generateOrderNumber(daysAgo),
      status: data.status,
      subtotal,
      shippingFee,
      discount,
      total,
      notes: data.notes ?? null,
      createdAt,
      updatedAt: createdAt,
    });

    const savedOrder = await orderRepo.save(order);

    // Same per-line split the order flow stores. The seeded discount is
    // whole-order, so it is spread by line total like the shipping fee.
    const totals = itemsToSave.map((i) => i.total as number);
    const lineDiscounts = allocateProportionally(discount, totals);
    const lines = allocateOrderLines(totals, lineDiscounts, shippingFee);

    await itemRepo.save(
      itemsToSave.map((item, i) =>
        itemRepo.create({ ...item, ...lines[i], order_id: savedOrder.id }),
      ),
    );

    // Unshipped orders hold their stock, as they would if placed for real.
    if (RESERVING_STATUSES.includes(data.status)) {
      for (const item of itemsToSave) {
        await variantRepo.decrement(
          { id: item.variant_id! },
          'stock',
          item.quantity!,
        );
        await variantRepo.increment(
          { id: item.variant_id! },
          'reserved',
          item.quantity!,
        );
        await movementRepo.insert({
          variant_id: item.variant_id!,
          sku: data.items.find(
            (d) => variantMap.get(d.variantSku)?.id === item.variant_id,
          )!.variantSku,
          reason: InventoryMovementReason.ORDER_RESERVE,
          onHandDelta: 0,
          reservedDelta: item.quantity!,
          refType: 'order',
          refId: savedOrder.id,
        });
      }
    }

    const itemSummary = data.items
      .map((i) => `${i.variantSku} x${i.quantity}`)
      .join(', ');
    console.log(
      `  [+] Order ${savedOrder.orderNumber} [${data.status}] for ${data.userEmail}: ${itemSummary} → ${total.toLocaleString('vi-VN')}₫`,
    );
  }
}
