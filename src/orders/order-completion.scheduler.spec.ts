import { OrderCompletionScheduler } from './order-completion.scheduler';

describe('OrderCompletionScheduler', () => {
  it('completes delivered orders older than the return window', async () => {
    const ordersService = {
      findCompletableOrderIds: jest.fn().mockResolvedValue(['a', 'b']),
      completeDelivered: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('boom')),
    };
    const scheduler = new OrderCompletionScheduler(
      ordersService as never,
      { getAppConfig: () => ({ returnWindowDays: 7 }) } as never,
    );
    jest
      .spyOn(scheduler['logger'], 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => undefined);

    await expect(
      scheduler.handle(new Date('2026-11-28T00:00:00Z')),
    ).resolves.toBe(1);

    const cutoff = new Date('2026-11-21T00:00:00Z');
    expect(ordersService.findCompletableOrderIds).toHaveBeenCalledWith(cutoff);
    expect(ordersService.completeDelivered).toHaveBeenCalledWith('b', cutoff);
  });
});
