import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TypedConfigService } from '@/config/TypedConfigService';
import { OrdersService } from './orders.service';

// Hourly: delivered orders past RETURN_WINDOW_DAYS (and with no refund
// request still waiting) become completed.
@Injectable()
export class OrderCompletionScheduler {
  private readonly logger = new Logger(OrderCompletionScheduler.name);
  private running = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly configService: TypedConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'complete-delivered-orders' })
  async handle(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const days = this.configService.getAppConfig().returnWindowDays;
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60_000);
      const ids = await this.ordersService.findCompletableOrderIds(cutoff);

      let completed = 0;
      for (const id of ids) {
        try {
          if (await this.ordersService.completeDelivered(id, cutoff)) {
            completed++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to complete order ${id}`,
            error instanceof Error ? error.stack : error,
          );
        }
      }
      if (completed) this.logger.log(`Completed ${completed} order(s)`);
      return completed;
    } finally {
      this.running = false;
    }
  }
}
