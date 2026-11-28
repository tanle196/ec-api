import { OrderNotificationsHandler } from './order-notifications.handler';

describe('OrderNotificationsHandler', () => {
  const order = {
    id: 'order-1',
    user_id: 'user-1',
    orderNumber: 'ORD-1',
    subtotal: '59.97',
    shippingFee: '5',
    discount: '0',
    total: '64.97',
    items: [
      {
        productName: 'Áo',
        variantName: 'M',
        quantity: 3,
        unitPrice: '19.99',
        total: '59.97',
      },
    ],
  };

  const build = (
    found: object | null = order,
    user: object | null = { email: 'a@x.vn' },
  ) => {
    const outbox = { register: jest.fn() };
    const mail = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const handler = new OrderNotificationsHandler(
      { findOne: jest.fn().mockResolvedValue(found) } as never,
      outbox as never,
      mail as never,
      { findById: jest.fn().mockResolvedValue(user) } as never,
    );
    return { handler, outbox, mail };
  };

  it('registers for order.placed and order.status_changed', () => {
    const { handler, outbox } = build();
    handler.onModuleInit();
    expect(outbox.register.mock.calls.map(([type]) => type as string)).toEqual([
      'order.placed',
      'order.status_changed',
    ]);
  });

  it('sends the confirmation with the order lines', async () => {
    const { handler, mail } = build();
    await handler.onPlaced({ payload: { orderId: 'order-1' } } as never);
    expect(mail.sendOrderConfirmation).toHaveBeenCalledWith(
      'a@x.vn',
      expect.objectContaining({
        orderNumber: 'ORD-1',
        total: 64.97,
        items: [expect.objectContaining({ unitPrice: 19.99, quantity: 3 })],
      }),
    );
  });

  it('describes the change the event is about, not the current status', async () => {
    const { handler, mail } = build({ ...order, status: 'shipped' });
    await handler.onStatusChanged({
      payload: {
        orderId: 'order-1',
        fromStatus: 'pending',
        toStatus: 'confirmed',
      },
    } as never);
    expect(mail.sendOrderStatusUpdate).toHaveBeenCalledWith('a@x.vn', {
      orderNumber: 'ORD-1',
      fromStatus: 'pending',
      toStatus: 'confirmed',
    });
  });

  it('lets a mail failure propagate so the outbox retries', async () => {
    const { handler, mail } = build();
    mail.sendOrderConfirmation.mockRejectedValue(new Error('smtp'));
    await expect(
      handler.onPlaced({ payload: { orderId: 'order-1' } } as never),
    ).rejects.toThrow('smtp');
  });

  it.each([
    ['the order is gone', null, { email: 'a' }],
    ['the customer is gone', order, null],
  ])('sends nothing when %s', async (_l, found, user) => {
    const { handler, mail } = build(found, user);
    await handler.onPlaced({ payload: { orderId: 'order-1' } } as never);
    expect(mail.sendOrderConfirmation).not.toHaveBeenCalled();
  });
});
