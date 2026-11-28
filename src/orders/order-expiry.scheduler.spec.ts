import { OrderExpiryScheduler } from './order-expiry.scheduler';

describe('OrderExpiryScheduler', () => {
  const now = new Date('2026-11-28T10:30:00Z');

  const build = (ttl = 30) => {
    const ordersService = {
      findExpiredUnpaidOrderIds: jest.fn().mockResolvedValue(['a', 'b', 'c']),
      expireUnpaid: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(false),
    };
    const configService = {
      getAppConfig: () => ({ pendingOrderTtlMinutes: ttl }),
    };
    const scheduler = new OrderExpiryScheduler(
      ordersService as never,
      configService as never,
    );
    jest
      .spyOn(scheduler['logger'], 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => undefined);
    return { scheduler, ordersService };
  };

  it('expires orders older than the TTL and keeps going past failures', async () => {
    const { scheduler, ordersService } = build();

    await expect(scheduler.handle(now)).resolves.toBe(1);

    const cutoff = new Date('2026-11-28T10:00:00Z');
    expect(ordersService.findExpiredUnpaidOrderIds).toHaveBeenCalledWith(
      cutoff,
    );
    expect(ordersService.expireUnpaid).toHaveBeenCalledTimes(3);
    expect(ordersService.expireUnpaid).toHaveBeenCalledWith('c', cutoff);
  });

  it('does nothing when expiry is turned off', async () => {
    const { scheduler, ordersService } = build(0);

    await expect(scheduler.handle(now)).resolves.toBe(0);
    expect(ordersService.findExpiredUnpaidOrderIds).not.toHaveBeenCalled();
  });

  it('skips a tick while the previous one is still running', async () => {
    const { scheduler, ordersService } = build();
    let finish!: (ids: string[]) => void;
    ordersService.findExpiredUnpaidOrderIds.mockReturnValueOnce(
      new Promise((r) => (finish = r)),
    );

    const first = scheduler.handle(now);
    await expect(scheduler.handle(now)).resolves.toBe(0);
    finish([]);
    await first;

    expect(ordersService.findExpiredUnpaidOrderIds).toHaveBeenCalledTimes(1);
  });
});
