import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../../enums/payment-method.enum';
import { StripeGatewayProvider } from './stripe-gateway.provider';

describe('StripeGatewayProvider', () => {
  const buildProvider = (currency = 'vnd') => {
    const client = {
      checkout: { sessions: { create: jest.fn() } },
      paymentIntents: { retrieve: jest.fn() },
      refunds: { create: jest.fn() },
    };
    const config = {
      getStripeConfig: () => ({
        currency,
        checkoutSuccessUrl: 'https://shop.test/checkout/success?ref=stripe',
        checkoutCancelUrl: 'https://shop.test/checkout/cancel',
      }),
    };
    const provider = new StripeGatewayProvider(
      { client } as never,
      config as never,
    );
    return { provider, client };
  };

  interface SessionArgs {
    mode: string;
    success_url: string;
    cancel_url: string;
    metadata: Record<string, string>;
    payment_intent_data: { metadata: Record<string, string> };
    line_items: { price_data: { unit_amount: number } }[];
  }
  const sessionArgs = (create: jest.Mock) =>
    (create.mock.calls as SessionArgs[][])[0][0];

  const payment = { id: 'payment-1', transactionId: 'pi_1' };
  const order = { id: 'order-1', total: '150000', orderNumber: 'ORD-1' };

  it('handles the STRIPE payment method', () => {
    expect(buildProvider().provider.method).toBe(PaymentMethod.STRIPE);
  });

  describe('initiate', () => {
    it('creates a checkout session with metadata and order-scoped redirect URLs', async () => {
      const { provider, client } = buildProvider();
      const session = { id: 'cs_1', url: 'https://stripe.test/cs_1' };
      client.checkout.sessions.create.mockResolvedValue(session);

      const result = await provider.initiate(payment as never, order as never);

      const args = sessionArgs(client.checkout.sessions.create);
      expect(args.mode).toBe('payment');
      expect(args.success_url).toBe(
        'https://shop.test/checkout/success?ref=stripe&order_id=order-1',
      );
      expect(args.cancel_url).toBe(
        'https://shop.test/checkout/cancel?order_id=order-1',
      );
      expect(args.metadata).toEqual({
        payment_id: 'payment-1',
        order_id: 'order-1',
      });
      expect(args.payment_intent_data.metadata).toEqual(args.metadata);
      expect(args.line_items[0].price_data).toEqual({
        currency: 'vnd',
        unit_amount: 150000,
        product_data: { name: 'Order ORD-1' },
      });
      expect(result).toEqual({
        providerRef: 'cs_1',
        redirectUrl: 'https://stripe.test/cs_1',
        raw: session,
      });
    });

    it('converts the amount using the configured currency', async () => {
      const { provider, client } = buildProvider('usd');
      client.checkout.sessions.create.mockResolvedValue({ id: 'cs_1' });

      const result = await provider.initiate(
        payment as never,
        {
          ...order,
          total: '49.99',
        } as never,
      );

      expect(
        sessionArgs(client.checkout.sessions.create).line_items[0].price_data
          .unit_amount,
      ).toBe(4999);
      expect(result.redirectUrl).toBeUndefined();
    });
  });

  describe('refund', () => {
    it("refunds using the payment intent's own currency and the idempotency key", async () => {
      const { provider, client } = buildProvider('vnd');
      client.paymentIntents.retrieve.mockResolvedValue({ currency: 'usd' });
      const refund = { id: 're_1' };
      client.refunds.create.mockResolvedValue(refund);

      const result = await provider.refund(
        payment as never,
        10.5,
        'damaged',
        'refund-1',
      );

      expect(client.paymentIntents.retrieve).toHaveBeenCalledWith('pi_1');
      expect(client.refunds.create).toHaveBeenCalledWith(
        {
          payment_intent: 'pi_1',
          amount: 1050,
          metadata: { payment_id: 'payment-1', reason: 'damaged' },
        },
        { idempotencyKey: 'refund-1' },
      );
      expect(result).toEqual({ providerRef: 're_1', raw: refund });
    });

    it('rejects a payment without a transaction id', async () => {
      const { provider, client } = buildProvider();

      await expect(
        provider.refund(
          { ...payment, transactionId: null } as never,
          1,
          'x',
          'k',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(client.refunds.create).not.toHaveBeenCalled();
    });
  });
});
