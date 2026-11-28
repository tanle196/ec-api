import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TypedConfigService } from '@/config/TypedConfigService';
import { OrdersService } from './orders.service';

/**
 * Every minute, cancels unpaid online orders older than
 * PENDING_ORDER_TTL_MINUTES so their reserved stock goes back on sale.
 * Each order is re-checked under its own lock (OrdersService.expireUnpaid),
 * so overlapping runs or several instances can't double-cancel.
 */
@Injectable()
export class OrderExpiryScheduler {
  private readonly logger = new Logger(OrderExpiryScheduler.name);
  private running = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: TypedConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'expire-unpaid-orders' })
  async handle(now: Date = new Date()): Promise<number> {
    const ttl = this.configService.getAppConfig().pendingOrderTtlMinutes;
    if (!ttl || this.running) return 0;

    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - ttl * 60_000);
      const ids = await this.ordersService.findExpiredUnpaidOrderIds(cutoff);

      let expired = 0;
      for (const id of ids) {
        try {
          if (await this.ordersService.expireUnpaid(id, cutoff)) expired++;
        } catch (error) {
          // One bad order must not stop the rest of the batch.
          this.logger.error(
            `Failed to expire order ${id}`,
            error instanceof Error ? error.stack : error,
          );
        }
      }

      if (expired > 0) this.logger.log(`Expired ${expired} unpaid order(s)`);
      return expired;
    } finally {
      this.running = false;
    }
  }
}
