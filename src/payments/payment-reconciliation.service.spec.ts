import { PaymentIssueType } from './enums/payment-issue-type.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentPolicy } from './policies/payment.policy';

describe('PaymentReconciliationService', () => {
  const now = new Date('2026-11-28T10:00:00Z');
  const payment = (overrides: object = {}) => ({
    id: 'payment-1',
    order_id: 'order-1',
    method: PaymentMethod.STRIPE,
    status: PaymentStatus.PENDING,
    amount: 100000,
    transactionId: 'cs_1',
    ...overrides,
  });

  const build = (opts: {
    unfinished?: object[];
    completed?: object[];
    paidOnCancelled?: object[];
    gateway?: { status: string; amount?: number; transactionId?: string };
    noQuery?: boolean;
  }) => {
    const paymentRepo = {
      find: jest
        .fn()
        .mockResolvedValueOnce(opts.unfinished ?? [])
        .mockResolvedValueOnce(opts.completed ?? []),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(opts.paidOnCancelled ?? []),
      }),
    };
    const queryStatus = jest
      .fn()
      .mockResolvedValue(opts.gateway ?? { status: 'pending' });
    const gatewayRegistry = {
      resolve: jest.fn().mockReturnValue(opts.noQuery ? {} : { queryStatus }),
    };
    const paymentsService = {
      completeFromGatewayEvent: jest.fn().mockResolvedValue('processed'),
      failFromGatewayEvent: jest.fn().mockResolvedValue('processed'),
    };
    const issuesService = { raise: jest.fn().mockResolvedValue(undefined) };
    const service = new PaymentReconciliationService(
      paymentRepo as never,
      gatewayRegistry as never,
      paymentsService as never,
      issuesService as never,
      new PaymentPolicy(),
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    return {
      service,
      paymentRepo,
      queryStatus,
      paymentsService,
      issuesService,
    };
  };

  it('completes a payment the gateway has as paid and records the missed webhook', async () => {
    const ctx = build({
      unfinished: [payment()],
      gateway: { status: 'paid', amount: 100000, transactionId: 'pi_1' },
    });

    const summary = await ctx.service.run(now);

    expect(ctx.paymentsService.completeFromGatewayEvent).toHaveBeenCalledWith(
      'payment-1',
      'pi_1',
      { reconciledFromGateway: true },
      expect.any(String),
      100000,
    );
    expect(ctx.issuesService.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PaymentIssueType.WEBHOOK_MISSED,
        resolved: true,
      }),
    );
    expect(summary).toEqual(expect.objectContaining({ healed: 1, issues: 0 }));
  });

  it('also chases payments we voided, in case the customer paid late', async () => {
    const ctx = build({
      unfinished: [payment({ status: PaymentStatus.FAILED })],
      gateway: { status: 'paid', amount: 100000 },
    });

    await ctx.service.run(now);

    // Falls back to the stored reference when the gateway gives none.
    expect(ctx.paymentsService.completeFromGatewayEvent).toHaveBeenCalledWith(
      'payment-1',
      'cs_1',
      expect.anything(),
      expect.any(String),
      100000,
    );
  });

  it('fails a pending payment the gateway has as failed and stops asking', async () => {
    const ctx = build({
      unfinished: [payment()],
      gateway: { status: 'failed' },
    });

    await ctx.service.run(now);

    expect(ctx.paymentsService.failFromGatewayEvent).toHaveBeenCalledWith(
      'payment-1',
      { reconciledFromGateway: true },
    );
    expect(ctx.paymentRepo.update).toHaveBeenCalledWith('payment-1', {
      reconciledAt: now,
    });
  });

  it('leaves a still-pending payment alone', async () => {
    const ctx = build({
      unfinished: [payment()],
      gateway: { status: 'pending' },
    });

    await ctx.service.run(now);

    expect(ctx.paymentsService.completeFromGatewayEvent).not.toHaveBeenCalled();
    expect(ctx.paymentsService.failFromGatewayEvent).not.toHaveBeenCalled();
    expect(ctx.paymentRepo.update).not.toHaveBeenCalled();
  });

  it('verifies a completed payment and flags an amount mismatch', async () => {
    const ctx = build({
      completed: [payment({ status: PaymentStatus.COMPLETED })],
      gateway: { status: 'paid', amount: 90000 },
    });

    const summary = await ctx.service.run(now);

    expect(ctx.issuesService.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PaymentIssueType.AMOUNT_MISMATCH,
        details: { captured: 90000, expected: 100000 },
      }),
    );
    expect(ctx.paymentRepo.update).toHaveBeenCalledWith('payment-1', {
      reconciledAt: now,
    });
    expect(summary).toEqual(
      expect.objectContaining({ verified: 1, issues: 1 }),
    );
  });

  it('flags a completed payment the gateway does not have as paid', async () => {
    const ctx = build({
      completed: [payment({ status: PaymentStatus.COMPLETED })],
      gateway: { status: 'failed' },
    });

    await ctx.service.run(now);

    expect(ctx.issuesService.raise).toHaveBeenCalledWith(
      expect.objectContaining({ type: PaymentIssueType.GATEWAY_NOT_PAID }),
    );
    expect(ctx.paymentRepo.update).not.toHaveBeenCalled();
  });

  it('flags paid payments sitting on cancelled orders', async () => {
    const ctx = build({
      paidOnCancelled: [payment({ status: PaymentStatus.COMPLETED })],
    });

    await ctx.service.run(now);

    expect(ctx.issuesService.raise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PaymentIssueType.PAID_ON_CANCELLED_ORDER,
        paymentId: 'payment-1',
      }),
    );
  });

  it('skips methods without a status query and counts gateway errors', async () => {
    const noQuery = build({
      unfinished: [payment({ method: PaymentMethod.COD })],
      noQuery: true,
    });
    await expect(noQuery.service.run(now)).resolves.toEqual(
      expect.objectContaining({ errors: 0, healed: 0 }),
    );

    const broken = build({ unfinished: [payment()] });
    broken.queryStatus.mockRejectedValue(new Error('timeout'));
    await expect(broken.service.run(now)).resolves.toEqual(
      expect.objectContaining({ errors: 1 }),
    );
  });

  it('does not overlap runs', async () => {
    const ctx = build({});
    let release!: (v: object[]) => void;
    ctx.paymentRepo.find.mockReset();
    ctx.paymentRepo.find
      .mockReturnValueOnce(new Promise((r) => (release = r)))
      .mockResolvedValue([]);

    const first = ctx.service.run(now);
    await expect(ctx.service.run(now)).resolves.toBeNull();
    release([]);
    await expect(first).resolves.not.toBeNull();
  });
});
