import { OutboxEventStatus } from './enums/outbox-event-status.enum';
import {
  backoffMs,
  OUTBOX_MAX_ATTEMPTS,
  OutboxService,
} from './outbox.service';

describe('OutboxService', () => {
  const now = new Date('2026-11-28T10:00:00Z');

  const build = (due: object[] = []) => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(due),
    };
    const manager = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const eventRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: typeof manager) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const service = new OutboxService(eventRepo as never, dataSource as never);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    return { service, qb, manager, eventRepo };
  };
  const event = (overrides: object = {}) => ({
    id: 'e-1',
    type: 'thing.happened',
    attempts: 0,
    payload: {},
    ...overrides,
  });

  it('enqueues inside the caller transaction', async () => {
    const { service, manager } = build();
    await service.enqueue(manager as never, {
      type: 'order.placed',
      aggregateType: 'order',
      aggregateId: 'o-1',
      payload: { orderId: 'o-1' },
    });
    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), {
      type: 'order.placed',
      aggregateType: 'order',
      aggregateId: 'o-1',
      payload: { orderId: 'o-1' },
    });
  });

  it('claims due events with SKIP LOCKED and leases them before handling', async () => {
    const e = event();
    const { service, qb, manager, eventRepo } = build([e]);
    const handler = jest.fn().mockResolvedValue(undefined);
    service.register('thing.happened', handler);

    await expect(service.dispatchDue(50, now)).resolves.toBe(1);

    expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'e-1', {
      attempts: 1,
      availableAt: new Date(now.getTime() + 5 * 60_000),
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e-1' }),
    );
    expect(eventRepo.update).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({ status: OutboxEventStatus.PROCESSED }),
    );
  });

  it('schedules a retry with backoff when the handler fails', async () => {
    const { service, eventRepo } = build([event()]);
    service.register('thing.happened', () =>
      Promise.reject(new Error('smtp down')),
    );

    await expect(service.dispatchDue(50, now)).resolves.toBe(0);

    expect(eventRepo.update).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({
        status: OutboxEventStatus.PENDING,
        lastError: 'smtp down',
      }),
    );
  });

  it('gives up after the last attempt', async () => {
    const { service, eventRepo } = build([
      event({ attempts: OUTBOX_MAX_ATTEMPTS - 1 }),
    ]);
    service.register('thing.happened', () => Promise.reject(new Error('x')));

    await service.dispatchDue(50, now);

    expect(eventRepo.update).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({ status: OutboxEventStatus.DEAD }),
    );
  });

  it('marks events nobody handles as dead straight away', async () => {
    const { service, eventRepo } = build([event({ type: 'unknown' })]);

    await service.dispatchDue(50, now);

    expect(eventRepo.update).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({
        status: OutboxEventStatus.DEAD,
        lastError: 'No handler for "unknown"',
      }),
    );
  });

  it('refuses two handlers for one type', () => {
    const { service } = build();
    service.register('a', jest.fn());
    expect(() => service.register('a', jest.fn())).toThrow();
  });

  it('retry puts an event back with fresh attempts', async () => {
    const { service, eventRepo } = build();
    eventRepo.findOne.mockResolvedValue(
      event({ status: OutboxEventStatus.DEAD }),
    );

    await service.retry('e-1');

    expect(eventRepo.update).toHaveBeenCalledWith(
      'e-1',
      expect.objectContaining({
        status: OutboxEventStatus.PENDING,
        attempts: 0,
        lastError: null,
      }),
    );
  });

  it('backs off exponentially up to an hour', () => {
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(2)).toBe(20_000);
    expect(backoffMs(4)).toBe(80_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});
