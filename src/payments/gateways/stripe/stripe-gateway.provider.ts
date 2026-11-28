import { BadRequestException, Injectable } from '@nestjs/common';
import { Order } from '@/orders/entities/order.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { Payment } from '../../entities/payment.entity';
import { PaymentMethod } from '../../enums/payment-method.enum';
import {
  GatewayPaymentStatus,
  PaymentGatewayProvider,
  PaymentInitiationResult,
  PaymentRefundResult,
} from '../payment-gateway.interface';
import { StripeClientProvider } from './stripe-client.provider';
import { fromStripeAmount, toStripeAmount } from './stripe-currency.util';

// Stripe only accepts a Checkout Session expiry between 30 minutes and
// 24 hours from creation; a minute of margin on each side.
const MIN_SESSION_TTL_MS = 31 * 60_000;
const MAX_SESSION_TTL_MS = 23 * 60 * 60_000;

@Injectable()
export class StripeGatewayProvider implements PaymentGatewayProvider {
  readonly method = PaymentMethod.STRIPE;

  constructor(
    private readonly stripeClient: StripeClientProvider,
    private readonly config: TypedConfigService,
  ) {}

  async initiate(
    payment: Payment,
    order: Order,
  ): Promise<PaymentInitiationResult> {
    const stripeConfig = this.config.getStripeConfig();

    const successUrl = new URL(stripeConfig.checkoutSuccessUrl);
    successUrl.searchParams.set('order_id', order.id);
    const cancelUrl = new URL(stripeConfig.checkoutCancelUrl);
    cancelUrl.searchParams.set('order_id', order.id);

    const expiresAt = this.sessionExpiry(order);

    const session = await this.stripeClient.client.checkout.sessions.create({
      mode: 'payment',
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        payment_id: payment.id,
        order_id: order.id,
      },
      // Session-level metadata isn't automatically copied to the
      // PaymentIntent, so set it explicitly for payment_intent.* events too.
      payment_intent_data: {
        metadata: {
          payment_id: payment.id,
          order_id: order.id,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: stripeConfig.currency,
            unit_amount: toStripeAmount(
              Number(order.total),
              stripeConfig.currency,
            ),
            product_data: {
              name: `Order ${order.orderNumber}`,
            },
          },
        },
      ],
    });

    return {
      providerRef: session.id,
      redirectUrl: session.url ?? undefined,
      raw: session as unknown as Record<string, unknown>,
    };
  }

  async refund(
    payment: Payment,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<PaymentRefundResult> {
    if (!payment.transactionId) {
      throw new BadRequestException(
        'Payment has no Stripe payment intent to refund',
      );
    }

    // Use the PaymentIntent's actual currency, not the currently configured
    // default — if STRIPE_CURRENCY is ever changed after this payment was
    // originally charged, using the config value here would apply the wrong
    // unit multiplier to `amount`, even though Stripe itself always refunds
    // in the original charge's currency regardless of what we pass.
    const paymentIntent =
      await this.stripeClient.client.paymentIntents.retrieve(
        payment.transactionId,
      );

    const refund = await this.stripeClient.client.refunds.create(
      {
        payment_intent: payment.transactionId,
        amount: toStripeAmount(amount, paymentIntent.currency),
        metadata: {
          payment_id: payment.id,
          reason,
        },
      },
      // Without this, the Stripe SDK's own automatic network-error retry
      // (or an application-level retry after an ambiguous timeout) can
      // create a second real refund at Stripe even though the first
      // request actually succeeded server-side — Stripe dedupes any
      // request replayed with the same key instead of double-refunding.
      { idempotencyKey },
    );

    return {
      providerRef: refund.id,
      raw: refund as unknown as Record<string, unknown>,
    };
  }

  /**
   * Payments start out holding the Checkout Session id (`cs_...`) and
   * switch to the PaymentIntent id (`pi_...`) once the checkout webhook
   * lands, so either may be stored.
   */
  async queryStatus(payment: Payment): Promise<GatewayPaymentStatus> {
    const ref = payment.transactionId;
    if (!ref) return { status: 'unknown' };

    if (ref.startsWith('cs_')) {
      const session =
        await this.stripeClient.client.checkout.sessions.retrieve(ref);
      const raw = session as unknown as Record<string, unknown>;
      if (session.payment_status === 'paid') {
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        return {
          status: 'paid',
          amount: fromStripeAmount(
            session.amount_total ?? 0,
            session.currency ?? '',
          ),
          transactionId: paymentIntentId,
          raw,
        };
      }
      if (session.status === 'expired') return { status: 'failed', raw };
      return { status: 'pending', raw };
    }

    if (ref.startsWith('pi_')) {
      const intent =
        await this.stripeClient.client.paymentIntents.retrieve(ref);
      const raw = intent as unknown as Record<string, unknown>;
      if (intent.status === 'succeeded') {
        return {
          status: 'paid',
          amount: fromStripeAmount(intent.amount_received, intent.currency),
          transactionId: intent.id,
          raw,
        };
      }
      if (intent.status === 'canceled') return { status: 'failed', raw };
      return { status: 'pending', raw };
    }

    return { status: 'unknown' };
  }

  /**
   * Lets the session lapse when the order's stock hold does, so Stripe stops
   * taking money for an order that is about to be cancelled. Clamped to
   * Stripe's allowed window; undefined (Stripe's 24h default) when order
   * expiry is off.
   */
  private sessionExpiry(order: Order): number | undefined {
    const ttlMinutes = this.config.getAppConfig().pendingOrderTtlMinutes;
    if (!ttlMinutes) return undefined;

    const now = Date.now();
    const holdEnds = new Date(order.createdAt).getTime() + ttlMinutes * 60_000;
    const clamped = Math.min(
      Math.max(holdEnds, now + MIN_SESSION_TTL_MS),
      now + MAX_SESSION_TTL_MS,
    );
    return Math.floor(clamped / 1000);
  }
}
