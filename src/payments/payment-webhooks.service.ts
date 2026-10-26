/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PostgresErrorCode } from '@/common/errors/postgres-error-codes';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { PaymentMethod } from './enums/payment-method.enum';
import { WebhookProcessingStatus } from './enums/webhook-processing-status.enum';

interface PostgresError extends QueryFailedError {
  code: string;
}

@Injectable()
export class PaymentWebhooksService {
  constructor(
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEventRepo: Repository<PaymentWebhookEvent>,
  ) {}

  async recordEvent(
    provider: PaymentMethod,
    eventId: string,
    payload: Record<string, unknown>,
  ): Promise<{ isNew: boolean; record: PaymentWebhookEvent }> {
    try {
      const record = await this.webhookEventRepo.save(
        this.webhookEventRepo.create({
          provider,
          eventId,
          payload,
          status: WebhookProcessingStatus.RECEIVED,
        }),
      );
      return { isNew: true, record };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as PostgresError).code === PostgresErrorCode.UniqueViolation
      ) {
        const existing = await this.webhookEventRepo.findOneOrFail({
          where: { provider, eventId },
        });
        return { isNew: false, record: existing };
      }
      throw error;
    }
  }

  async markProcessed(
    record: PaymentWebhookEvent,
    paymentId: string,
  ): Promise<void> {
    record.status = WebhookProcessingStatus.PROCESSED;
    record.payment_id = paymentId;
    await this.webhookEventRepo.save(record);
  }

  async markIgnored(record: PaymentWebhookEvent): Promise<void> {
    record.status = WebhookProcessingStatus.IGNORED;
    await this.webhookEventRepo.save(record);
  }

  async markError(record: PaymentWebhookEvent, message: string): Promise<void> {
    record.status = WebhookProcessingStatus.ERROR;
    record.errorMessage = message;
    await this.webhookEventRepo.save(record);
  }
}
