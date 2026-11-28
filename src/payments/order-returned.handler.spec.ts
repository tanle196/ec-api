import { PaymentStatus } from './enums/payment-status.enum';
import { OrderReturnedHandler } from './order-returned.handler';

describe('OrderReturnedHandler', () => {
  const build = (payments: object[]) => {
    const outbox = { register: jest.fn() };
    const paymentsService = {
      failFromGatewayEvent: jest.fn().mockResolvedValue('processed'),
      refundRemaining: jest.fn().mockResolvedValue(null),
    };
    const handler = new OrderReturnedHandler(
      { find: jest.fn().mockResolvedValue(payments) } as never,
      outbox as never,
      paymentsService as never,
    );
    return { handler, outbox, paymentsService };
  };

  it('registers for order.returned_to_sender', () => {
    const { handler, outbox } = build([]);
    handler.onModuleInit();
    expect(outbox.register).toHaveBeenCalledWith(
      'order.returned_to_sender',
      expect.any(Function),
    );
  });

  it('refunds paid payments and voids uncollected ones', async () => {
    const { handler, paymentsService } = build([
      { id: 'p-paid', status: PaymentStatus.COMPLETED },
      { id: 'p-part', status: PaymentStatus.PARTIALLY_REFUNDED },
      { id: 'p-cod', status: PaymentStatus.PENDING },
    ]);

    await handler.handle({ payload: { orderId: 'order-1' } } as never);

    expect(paymentsService.refundRemaining.mock.calls).toEqual([
      ['p-paid', 'Order returned to sender undelivered'],
      ['p-part', 'Order returned to sender undelivered'],
    ]);
    expect(paymentsService.failFromGatewayEvent).toHaveBeenCalledWith('p-cod', {
      failureReason: 'order_returned_to_sender',
    });
  });

  it('lets a refund failure propagate so the outbox retries', async () => {
    const { handler, paymentsService } = build([
      { id: 'p-paid', status: PaymentStatus.COMPLETED },
    ]);
    paymentsService.refundRemaining.mockRejectedValue(
      new Error('gateway down'),
    );

    await expect(
      handler.handle({ payload: { orderId: 'order-1' } } as never),
    ).rejects.toThrow('gateway down');
  });
});
