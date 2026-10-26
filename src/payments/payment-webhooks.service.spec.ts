import { QueryFailedError } from 'typeorm';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentMethod } from './enums/payment-method.enum';
import { WebhookProcessingStatus } from './enums/webhook-processing-status.enum';

const buildUniqueViolationError = () =>
  new QueryFailedError('insert into ...', [], {
    name: 'error',
    code: '23505',
    toString: () => 'duplicate key value violates unique constraint',
  } as unknown as Error);

describe('PaymentWebhooksService', () => {
  const buildService = (repo: Record<string, jest.Mock>) =>
    new PaymentWebhooksService(repo as never);

  describe('recordEvent', () => {
    it('returns isNew:true and persists a RECEIVED row on first delivery', async () => {
      const saved = { id: 'event-1', status: WebhookProcessingStatus.RECEIVED };
      const repo = {
        create: jest.fn().mockImplementation((data: unknown) => data),
        save: jest.fn().mockResolvedValue(saved),
        findOneOrFail: jest.fn(),
      };
      const service = buildService(repo);

      const result = await service.recordEvent(
        PaymentMethod.STRIPE,
        'evt_123',
        { type: 'checkout.session.completed' },
      );

      expect(result).toEqual({ isNew: true, record: saved });
      expect(repo.findOneOrFail).not.toHaveBeenCalled();
    });

    it('returns isNew:false and the existing row when the DB rejects a duplicate (provider, eventId)', async () => {
      const existing = {
        id: 'event-1',
        status: WebhookProcessingStatus.PROCESSED,
      };
      const repo = {
        create: jest.fn().mockImplementation((data: unknown) => data),
        save: jest.fn().mockRejectedValue(buildUniqueViolationError()),
        findOneOrFail: jest.fn().mockResolvedValue(existing),
      };
      const service = buildService(repo);

      const result = await service.recordEvent(
        PaymentMethod.STRIPE,
        'evt_123',
        { type: 'checkout.session.completed' },
      );

      expect(result).toEqual({ isNew: false, record: existing });
      expect(repo.findOneOrFail).toHaveBeenCalledWith({
        where: { provider: PaymentMethod.STRIPE, eventId: 'evt_123' },
      });
    });

    it('rethrows errors that are not a unique-constraint violation', async () => {
      const repo = {
        create: jest.fn().mockImplementation((data: unknown) => data),
        save: jest.fn().mockRejectedValue(new Error('connection lost')),
        findOneOrFail: jest.fn(),
      };
      const service = buildService(repo);

      await expect(
        service.recordEvent(PaymentMethod.STRIPE, 'evt_123', {}),
      ).rejects.toThrow('connection lost');
    });
  });
});
