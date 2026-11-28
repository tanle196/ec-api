import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailService } from '@/mail/mail.service';
import { OutboxEvent } from '@/outbox/entities/outbox-event.entity';
import { OutboxService } from '@/outbox/outbox.service';
import { UsersService } from '@/users/users.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { OrderEventPayload, OrderEvents } from './order-events';

/**
 * Customer emails for order events, sent from the outbox: only for changes
 * that committed, retried if the mail server is down. Delivery is
 * at-least-once, so a retry after a timeout can repeat an email; that is
 * the accepted trade-off against losing one.
 */
@Injectable()
export class OrderNotificationsHandler implements OnModuleInit {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly outboxService: OutboxService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit(): void {
    this.outboxService.register(OrderEvents.PLACED, (e) => this.onPlaced(e));
    this.outboxService.register(OrderEvents.STATUS_CHANGED, (e) =>
      this.onStatusChanged(e),
    );
  }

  async onPlaced(event: OutboxEvent): Promise<void> {
    const loaded = await this.load(event);
    if (!loaded) return;
    const { order, email } = loaded;

    await this.mailService.sendOrderConfirmation(email, {
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        productName: item.productName,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
      })),
      subtotal: Number(order.subtotal),
      shippingFee: Number(order.shippingFee),
      discount: Number(order.discount),
      total: Number(order.total),
    });
  }

  async onStatusChanged(event: OutboxEvent): Promise<void> {
    const loaded = await this.load(event);
    if (!loaded) return;
    const payload = event.payload as unknown as OrderEventPayload;

    await this.mailService.sendOrderStatusUpdate(loaded.email, {
      orderNumber: loaded.order.orderNumber,
      fromStatus: payload.fromStatus ?? null,
      // The status the event is about, not the current one: a later change
      // gets its own email.
      toStatus: payload.toStatus as OrderStatus,
    });
  }

  // Null when the order or its customer is gone: nothing to send, and
  // nothing to retry.
  private async load(
    event: OutboxEvent,
  ): Promise<{ order: Order; email: string } | null> {
    const { orderId } = event.payload as unknown as OrderEventPayload;
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
    if (!order) return null;
    const user = await this.usersService.findById(order.user_id);
    return user ? { order, email: user.email } : null;
  }
}
