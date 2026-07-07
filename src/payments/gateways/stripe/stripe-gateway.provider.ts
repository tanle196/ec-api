import { Injectable } from '@nestjs/common';
import { Order } from '@/orders/entities/order.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { Payment } from '../../entities/payment.entity';
import { PaymentMethod } from '../../enums/payment-method.enum';
import {
  PaymentGatewayProvider,
  PaymentInitiationResult,
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

    const session = await this.stripeClient.client.checkout.sessions.create({
      mode: 'payment',
      success_url: stripeConfig.checkoutSuccessUrl,
      cancel_url: stripeConfig.checkoutCancelUrl,
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
}
