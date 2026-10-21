import { PaymentMapper } from './payment.mapper';

describe('PaymentMapper', () => {
  const createdAt = new Date('2026-01-01');
  const base = {
    id: 'pay-1',
    order_id: 'order-1',
    order: { id: 'order-1', user_id: 'user-1' },
    method: 'stripe',
    status: 'pending',
    amount: 100,
    transactionId: 'pi_1',
    paidAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  const expectedBase = {
    id: 'pay-1',
    order_id: 'order-1',
    method: 'stripe',
    status: 'pending',
    amount: 100,
    transactionId: 'pi_1',
    paidAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  // Shape of what the Stripe webhook stores: the whole Checkout Session.
  const gatewayMetadata = {
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_1',
    id: 'cs_1',
    customer_details: { email: 'customer@example.com' },
    payment_intent: 'pi_1',
  };

  describe('toResponse (customer)', () => {
    it('keeps only checkoutUrl from the gateway metadata', () => {
      expect(
        PaymentMapper.toResponse({
          ...base,
          metadata: gatewayMetadata,
        } as never),
      ).toEqual({
        ...expectedBase,
        metadata: { checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_1' },
      });
    });

    it('returns a null checkoutUrl when the metadata has none', () => {
      expect(
        PaymentMapper.toResponse({
          ...base,
          metadata: { id: 'cs_1' },
        } as never).metadata,
      ).toEqual({ checkoutUrl: null });
    });

    it('returns null metadata when nothing is stored', () => {
      expect(
        PaymentMapper.toResponse({ ...base, metadata: null } as never).metadata,
      ).toBeNull();
    });
  });

  it('toAdminResponse keeps the full gateway metadata', () => {
    expect(
      PaymentMapper.toAdminResponse({
        ...base,
        metadata: gatewayMetadata,
      } as never),
    ).toEqual({ ...expectedBase, metadata: gatewayMetadata });
  });
});
