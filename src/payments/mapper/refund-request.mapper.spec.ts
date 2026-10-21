import { RefundRequestMapper } from './refund-request.mapper';

describe('RefundRequestMapper', () => {
  const createdAt = new Date('2026-01-01');
  const reviewedAt = new Date('2026-01-02');
  const entity = {
    id: 'rr-1',
    payment_id: 'pay-1',
    payment: { id: 'pay-1', metadata: { secret: true } },
    order_id: 'order-1',
    order: { id: 'order-1' },
    requested_by: 'user-1',
    amount: 50,
    reason: 'damaged',
    status: 'rejected',
    adminNote: 'Outside the return window',
    reviewedBy: 'admin-1',
    reviewedAt,
    refund_id: null,
    refund: null,
    items: [
      {
        id: 'rri-1',
        refund_request_id: 'rr-1',
        order_item_id: 'oi-1',
        orderItem: { id: 'oi-1' },
        quantity: 1,
        amount: 50,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
  const expected = {
    id: 'rr-1',
    payment_id: 'pay-1',
    order_id: 'order-1',
    requested_by: 'user-1',
    amount: 50,
    reason: 'damaged',
    status: 'rejected',
    adminNote: 'Outside the return window',
    reviewedAt,
    refund_id: null,
    items: [{ id: 'rri-1', order_item_id: 'oi-1', quantity: 1, amount: 50 }],
    createdAt,
  };

  it('toResponse hides which admin reviewed the request', () => {
    const result = RefundRequestMapper.toResponse(entity as never);

    expect(result).toEqual(expected);
    expect(result).not.toHaveProperty('reviewedBy');
  });

  it('toAdminResponse includes the reviewing admin', () => {
    expect(RefundRequestMapper.toAdminResponse(entity as never)).toEqual({
      ...expected,
      reviewedBy: 'admin-1',
    });
  });
});
