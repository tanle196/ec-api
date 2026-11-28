import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';

// Polls the outbox every few seconds. Overlapping ticks are skipped; other
// instances are kept apart by the SKIP LOCKED claim in dispatchDue.
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private running = false;

  constructor(private readonly outboxService: OutboxService) {}

  @Interval('outbox-dispatch', 3000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Drain in batches while there is a backlog.
      while ((await this.outboxService.dispatchDue()) === 50);
    } catch (error) {
      this.logger.error(
        'Outbox dispatch failed',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.running = false;
    }
  }
}
