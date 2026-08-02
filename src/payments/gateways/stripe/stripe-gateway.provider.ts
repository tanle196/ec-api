import { BadRequestException, Injectable } from '@nestjs/common';
import { Order } from '@/orders/entities/order.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { Payment } from '../../entities/payment.entity';
import { PaymentMethod } from '../../enums/payment-method.enum';
import {
  PaymentGatewayProvider,
  PaymentInitiationResult,
  PaymentRefundResult,
} from '../payment-gateway.interface';
import { StripeClientProvider } from './stripe-client.provider';

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

    const session = await this.stripeClient.client.checkout.sessions.create({
      mode: 'payment',
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
            unit_amount: Math.round(Number(order.total)),
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
  ): Promise<PaymentRefundResult> {
    if (!payment.transactionId) {
      throw new BadRequestException(
        'Payment has no Stripe payment intent to refund',
      );
    }

    const refund = await this.stripeClient.client.refunds.create({
      payment_intent: payment.transactionId,
      amount: Math.round(amount),
      metadata: {
        payment_id: payment.id,
        reason,
      },
    });

    return {
      providerRef: refund.id,
      raw: refund as unknown as Record<string, unknown>,
    };
  }
}
