import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CarrierWebhookStatus } from '@/shipping/enums/carrier-webhook-status.enum';
import { CarrierWebhooksService } from './carrier-webhooks.service';
import { ShipmentStatus } from './enums/shipment-status.enum';

describe('CarrierWebhooksService', () => {
  const update = (
    status: ShipmentStatus | null = ShipmentStatus.DELIVERED,
  ) => ({
    trackingNumber: 'GHNABC',
    status,
    carrierStatus: 'delivered',
    description: 'Đã giao',
    occurredAt: new Date('2026-11-28T03:00:00Z'),
    eventKey: 'GHNABC:delivered:t',
  });

  const build = (
    opts: { shipment?: object | null; status?: ShipmentStatus | null } = {},
  ) => {
    const provider = {
      code: 'GHN',
      verifyWebhook: jest.fn().mockReturnValue(true),
      parseWebhook: jest
        .fn()
        .mockReturnValue(
          update(
            opts.status === undefined ? ShipmentStatus.DELIVERED : opts.status,
          ),
        ),
    };
    const eventRepo = {
      create: jest.fn((d: object) => d),
      save: jest.fn((d: object) => Promise.resolve({ id: 'evt-1', ...d })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneOrFail: jest.fn(),
    };
    const shipments = {
      findByTracking: jest
        .fn()
        .mockResolvedValue(
          opts.shipment === undefined ? { id: 'ship-1' } : opts.shipment,
        ),
      recordEvent: jest.fn().mockResolvedValue({}),
    };
    const service = new CarrierWebhooksService(
      eventRepo as never,
      { resolve: (c: string) => (c === 'ghn' ? provider : undefined) } as never,
      shipments as never,
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    return { service, provider, eventRepo, shipments };
  };
  const body = { OrderCode: 'GHNABC', Status: 'delivered' };

  it('applies a mapped update to the shipment', async () => {
    const { service, shipments, eventRepo } = build();

    await expect(service.handle('ghn', body, { token: 't' })).resolves.toBe(
      CarrierWebhookStatus.PROCESSED,
    );

    expect(shipments.findByTracking).toHaveBeenCalledWith('GHN', 'GHNABC');
    expect(shipments.recordEvent).toHaveBeenCalledWith(
      'ship-1',
      {
        status: ShipmentStatus.DELIVERED,
        description: 'Đã giao',
        occurredAt: new Date('2026-11-28T03:00:00Z'),
      },
      { source: 'carrier' },
      body,
    );
    expect(eventRepo.update).toHaveBeenCalledWith('evt-1', {
      status: CarrierWebhookStatus.PROCESSED,
      errorMessage: null,
      shipment_id: 'ship-1',
    });
  });

  it('rejects unknown carriers and unauthenticated calls', async () => {
    const { service, provider } = build();
    await expect(service.handle('ghtk', body, {})).rejects.toThrow(
      NotFoundException,
    );
    provider.verifyWebhook.mockReturnValue(false);
    await expect(service.handle('ghn', body, {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('skips a redelivered update that was already handled', async () => {
    const { service, eventRepo, shipments } = build();
    eventRepo.save.mockRejectedValue(
      Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
        code: '23505',
      }),
    );
    eventRepo.findOneOrFail.mockResolvedValue({
      status: CarrierWebhookStatus.PROCESSED,
    });

    await service.handle('ghn', body, {});

    expect(shipments.recordEvent).not.toHaveBeenCalled();
  });

  it('keeps updates for unknown parcels and unmapped statuses', async () => {
    const unknown = build({ shipment: null });
    await expect(unknown.service.handle('ghn', body, {})).resolves.toBe(
      CarrierWebhookStatus.ERROR,
    );

    const unmapped = build({ status: null });
    await expect(unmapped.service.handle('ghn', body, {})).resolves.toBe(
      CarrierWebhookStatus.UNMAPPED,
    );
    expect(unmapped.shipments.recordEvent).not.toHaveBeenCalled();
  });

  it('acknowledges an impossible move instead of making the carrier retry', async () => {
    const { service, shipments } = build();
    shipments.recordEvent.mockRejectedValue(
      new BadRequestException(
        'Cannot move shipment from "returned" to "delivered"',
      ),
    );

    await expect(service.handle('ghn', body, {})).resolves.toBe(
      CarrierWebhookStatus.ERROR,
    );
  });

  it('lets the carrier retry when applying fails on our side', async () => {
    const { service, shipments, eventRepo } = build();
    shipments.recordEvent.mockRejectedValue(new Error('db down'));

    await expect(service.handle('ghn', body, {})).rejects.toThrow('db down');
    expect(eventRepo.update).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        status: CarrierWebhookStatus.RECEIVED,
      }),
    );
  });
});
