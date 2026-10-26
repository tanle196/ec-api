import { OrderMapper } from './order.mapper';

describe('OrderMapper', () => {
  const createdAt = new Date('2026-01-01');
  const order = {
    id: 'order-1',
    user_id: 'user-1',
    user: { id: 'user-1', email: 'customer@example.com' },
    address_id: 'addr-1',
    address: { id: 'addr-1', phone: '0901234567' },
    orderNumber: 'ORD-1',
    status: 'pending',
    subtotal: 200,
    shippingFee: 10,
    discount: 20,
    total: 190,
    notes: null,
    items: [
      {
        id: 'oi-1',
        order_id: 'order-1',
        variant_id: 'v-1',
        variant: { id: 'v-1', stock: 3 },
        productName: 'Áo thun',
        variantName: 'M',
        unitPrice: 100,
        quantity: 2,
        total: 200,
      },
    ],
    discounts: [
      {
        id: 'd-1',
        code: 'SALE10',
        type: 'percentage',
        value: 10,
        minOrderValue: 100,
        usageLimit: 500,
        usedCount: 42,
        isActive: true,
        startsAt: null,
        expiresAt: null,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };

  it('maps an order without user/address relations or discount internals', () => {
    expect(OrderMapper.toResponse(order as never)).toEqual({
      id: 'order-1',
      user_id: 'user-1',
      address_id: 'addr-1',
      orderNumber: 'ORD-1',
      status: 'pending',
      subtotal: 200,
      shippingFee: 10,
      discount: 20,
      total: 190,
      notes: null,
      items: [
        {
          id: 'oi-1',
          order_id: 'order-1',
          variant_id: 'v-1',
          productName: 'Áo thun',
          variantName: 'M',
          unitPrice: 100,
          quantity: 2,
          total: 200,
        },
      ],
      discounts: [{ id: 'd-1', code: 'SALE10', type: 'percentage', value: 10 }],
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('toListItem returns only summary columns', () => {
    expect(OrderMapper.toListItem(order as never)).toEqual({
      id: 'order-1',
      user_id: 'user-1',
      orderNumber: 'ORD-1',
      status: 'pending',
      total: 190,
      createdAt,
    });
  });
});
