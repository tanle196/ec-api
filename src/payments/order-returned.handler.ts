import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { OrderEventPayload } from '@/orders/order-events';
import { OrderEvents } from '@/orders/order-events';
import { OutboxEvent } from '@/outbox/entities/outbox-event.entity';
import { OutboxService } from '@/outbox/outbox.service';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentsService } from './payments.service';

const REASON = 'Order returned to sender undelivered';

/**
 * An undelivered parcel came back: the customer gets their money back.
 * - Paid payments are refunded in full (whatever isn't refunded yet).
 * - Pending payments (cash on delivery that was never collected) are
 *   voided.
 * Runs from the outbox, so it is retried until it succeeds; every step is
 * idempotent (refundRemaining refunds only what is left).
 */
@Injectable()
export class OrderReturnedHandler implements OnModuleInit {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly outboxService: OutboxService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.outboxService.register(OrderEvents.RETURNED_TO_SENDER, (e) =>
      this.handle(e),
    );
  }

  async handle(event: OutboxEvent): Promise<void> {
    const { orderId } = event.payload as unknown as OrderEventPayload;
    const payments = await this.paymentRepo.find({
      where: {
        order_id: orderId,
        status: In([
          PaymentStatus.PENDING,
          PaymentStatus.COMPLETED,
          PaymentStatus.PARTIALLY_REFUNDED,
        ]),
      },
    });

    for (const payment of payments) {
      if (payment.status === PaymentStatus.PENDING) {
        await this.paymentsService.failFromGatewayEvent(payment.id, {
          failureReason: 'order_returned_to_sender',
        });
      } else {
        await this.paymentsService.refundRemaining(payment.id, REASON);
      }
    }
  }
}
