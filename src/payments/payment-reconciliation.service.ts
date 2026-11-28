import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { Payment } from './entities/payment.entity';
import { PaymentIssueType } from './enums/payment-issue-type.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { GatewayPaymentStatus } from './gateways/payment-gateway.interface';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PaymentIssuesService } from './payment-issues.service';
import { PaymentsService } from './payments.service';
import { PaymentPolicy } from './policies/payment.policy';

const MINUTE = 60_000;
// Leave fresh payments to their webhook.
const SETTLE_DELAY = 10 * MINUTE;
// How far back unfinished payments are chased.
const OPEN_WINDOW = 72 * 60 * MINUTE;
// How far back completed payments are verified.
const COMPLETED_WINDOW = 7 * 24 * 60 * MINUTE;
const BATCH = 200;

export interface ReconciliationSummary {
  healed: number;
  failed: number;
  verified: number;
  issues: number;
  errors: number;
}

/**
 * Asks each gateway about our payments instead of trusting webhooks alone:
 * 1. Unfinished (PENDING, or FAILED by us e.g. on expiry) online payments
 *    the gateway reports paid are completed now: the webhook was lost or
 *    the customer paid after the order lapsed. Completion takes care of
 *    reviving or refunding the order.
 * 2. COMPLETED payments are verified once against the gateway: paid, for
 *    the same amount.
 * 3. Paid payments on cancelled orders (a crash between capture and the
 *    automatic refund) are flagged.
 * Anything that needs a person lands in payment_issues.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private running = false;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly paymentsService: PaymentsService,
    private readonly issuesService: PaymentIssuesService,
    private readonly paymentPolicy: PaymentPolicy,
  ) {}

  @Cron('0 */15 * * * *', { name: 'payment-reconciliation' })
  async runScheduled(): Promise<void> {
    const summary = await this.run();
    if (summary && (summary.healed || summary.issues || summary.errors)) {
      this.logger.warn(`Payment reconciliation: ${JSON.stringify(summary)}`);
    }
  }

  /** Returns null when a run is already in progress. */
  async run(now: Date = new Date()): Promise<ReconciliationSummary | null> {
    if (this.running) return null;
    this.running = true;
    const summary: ReconciliationSummary = {
      healed: 0,
      failed: 0,
      verified: 0,
      issues: 0,
      errors: 0,
    };
    try {
      await this.chaseUnfinished(now, summary);
      await this.verifyCompleted(now, summary);
      await this.flagPaidOnCancelled(summary);
      return summary;
    } finally {
      this.running = false;
    }
  }

  private async chaseUnfinished(
    now: Date,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const payments = await this.paymentRepo.find({
      where: {
        status: In([PaymentStatus.PENDING, PaymentStatus.FAILED]),
        transactionId: Not(IsNull()),
        // Set once the gateway confirmed it failed: no need to ask again.
        reconciledAt: IsNull(),
        createdAt: Between(
          new Date(now.getTime() - OPEN_WINDOW),
          new Date(now.getTime() - SETTLE_DELAY),
        ),
      },
      order: { createdAt: 'ASC' },
      take: BATCH,
    });

    for (const payment of payments) {
      const status = await this.query(payment, summary);
      if (!status) continue;

      try {
        if (status.status === 'paid') {
          await this.paymentsService.completeFromGatewayEvent(
            payment.id,
            status.transactionId ?? (payment.transactionId as string),
            { reconciledFromGateway: true },
            'Reconciliation: gateway reports the payment as paid',
            status.amount,
          );
          await this.raise(summary, payment, {
            type: PaymentIssueType.WEBHOOK_MISSED,
            summary: `Gateway reported paid but we had it ${payment.status}; completed by reconciliation`,
            resolved: true,
          });
          summary.healed++;
        } else if (status.status === 'failed') {
          if (payment.status === PaymentStatus.PENDING) {
            await this.paymentsService.failFromGatewayEvent(payment.id, {
              reconciledFromGateway: true,
            });
          }
          await this.paymentRepo.update(payment.id, { reconciledAt: now });
          summary.failed++;
        } else if (status.status === 'unknown') {
          await this.raise(summary, payment, {
            type: PaymentIssueType.GATEWAY_STATUS_UNKNOWN,
            summary: 'Gateway reported a status reconciliation cannot map',
            details: { gateway: status.raw ?? null },
          });
        }
      } catch (error) {
        this.fail(summary, payment, error);
      }
    }
  }

  private async verifyCompleted(
    now: Date,
    summary: ReconciliationSummary,
  ): Promise<void> {
    const payments = await this.paymentRepo.find({
      where: {
        status: PaymentStatus.COMPLETED,
        reconciledAt: IsNull(),
        paidAt: Between(new Date(now.getTime() - COMPLETED_WINDOW), now),
      },
      order: { paidAt: 'ASC' },
      take: BATCH,
    });

    for (const payment of payments) {
      const status = await this.query(payment, summary);
      if (!status) continue;

      try {
        if (status.status === 'paid') {
          if (
            status.amount !== undefined &&
            !this.paymentPolicy.amountsMatch(
              status.amount,
              Number(payment.amount),
            )
          ) {
            await this.raise(summary, payment, {
              type: PaymentIssueType.AMOUNT_MISMATCH,
              summary: `Gateway captured ${status.amount}, payment is ${payment.amount}`,
              details: {
                captured: status.amount,
                expected: Number(payment.amount),
              },
            });
          }
          await this.paymentRepo.update(payment.id, { reconciledAt: now });
          summary.verified++;
        } else if (status.status === 'unknown') {
          await this.raise(summary, payment, {
            type: PaymentIssueType.GATEWAY_STATUS_UNKNOWN,
            summary: 'Gateway reported a status reconciliation cannot map',
            details: { gateway: status.raw ?? null },
          });
        } else {
          await this.raise(summary, payment, {
            type: PaymentIssueType.GATEWAY_NOT_PAID,
            summary: `We have this payment as paid; the gateway says "${status.status}"`,
          });
        }
      } catch (error) {
        this.fail(summary, payment, error);
      }
    }
  }

  private async flagPaidOnCancelled(
    summary: ReconciliationSummary,
  ): Promise<void> {
    const payments = await this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin(Order, 'o', 'o.id = p.order_id')
      .where('p.status IN (:...paid)', {
        paid: [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED],
      })
      .andWhere('o.status = :cancelled', { cancelled: OrderStatus.CANCELLED })
      .take(BATCH)
      .getMany();

    for (const payment of payments) {
      await this.raise(summary, payment, {
        type: PaymentIssueType.PAID_ON_CANCELLED_ORDER,
        summary: 'Paid payment on a cancelled order with no full refund',
      });
    }
  }

  // Gateway lookup; null (and counted) when the method has none or it fails.
  private async query(
    payment: Payment,
    summary: ReconciliationSummary,
  ): Promise<GatewayPaymentStatus | null> {
    const provider = this.gatewayRegistry.resolve(payment.method);
    if (!provider?.queryStatus) return null;
    try {
      return await provider.queryStatus(payment);
    } catch (error) {
      this.fail(summary, payment, error);
      return null;
    }
  }

  private async raise(
    summary: ReconciliationSummary,
    payment: Payment,
    issue: {
      type: PaymentIssueType;
      summary: string;
      details?: Record<string, unknown>;
      resolved?: boolean;
    },
  ): Promise<void> {
    await this.issuesService.raise({
      ...issue,
      paymentId: payment.id,
      orderId: payment.order_id,
      method: payment.method,
    });
    if (!issue.resolved) summary.issues++;
  }

  private fail(
    summary: ReconciliationSummary,
    payment: Payment,
    error: unknown,
  ): void {
    summary.errors++;
    this.logger.error(
      `Reconciliation failed for payment ${payment.id}`,
      error instanceof Error ? error.stack : error,
    );
  }
}
