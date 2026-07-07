import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentMethod } from './enums/payment-method.enum';
import { StripeWebhookVerifierService } from './gateways/stripe/stripe-webhook-verifier.service';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsService } from './payments.service';

@ApiExcludeController()
@SkipThrottle()
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(
    private readonly stripeWebhookVerifier: StripeWebhookVerifierService,
    private readonly paymentWebhooksService: PaymentWebhooksService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('stripe')
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature) || !req.rawBody) {
      throw new BadRequestException('Missing Stripe signature');
    }

    const event = this.stripeWebhookVerifier.verify(req.rawBody, signature);

    const { isNew, record } = await this.paymentWebhooksService.recordEvent(
      PaymentMethod.STRIPE,
      event.id,
      event as unknown as Record<string, unknown>,
    );
    if (!isNew) return { received: true };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const paymentId = session.metadata?.payment_id;
        if (!paymentId) {
          await this.paymentWebhooksService.markError(
            record,
            'missing payment_id metadata',
          );
          break;
        }

        const outcome = await this.paymentsService.completeFromGatewayEvent(
          paymentId,
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? session.id),
          session as unknown as Record<string, unknown>,
          `Stripe webhook ${event.id}: checkout completed`,
        );
        if (outcome === 'not_found') {
          await this.paymentWebhooksService.markError(
            record,
            `payment ${paymentId} not found`,
          );
        } else {
          await this.paymentWebhooksService.markProcessed(record, paymentId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const paymentId = paymentIntent.metadata?.payment_id;
        if (!paymentId) {
          await this.paymentWebhooksService.markError(
            record,
            'missing payment_id metadata',
          );
          break;
        }

        const outcome = await this.paymentsService.failFromGatewayEvent(
          paymentId,
          paymentIntent as unknown as Record<string, unknown>,
        );
        if (outcome === 'not_found') {
          await this.paymentWebhooksService.markError(
            record,
            `payment ${paymentId} not found`,
          );
        } else {
          await this.paymentWebhooksService.markProcessed(record, paymentId);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntentId =
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id;

        const payment = paymentIntentId
          ? await this.paymentsService.findByTransactionId(paymentIntentId)
          : null;

        if (!payment) {
          await this.paymentWebhooksService.markError(
            record,
            `no payment found for payment_intent ${paymentIntentId ?? 'unknown'}`,
          );
          break;
        }

        const outcome = await this.paymentsService.refundFromGatewayEvent(
          payment.id,
          charge as unknown as Record<string, unknown>,
          `Stripe webhook ${event.id}: charge refunded`,
        );
        if (outcome === 'not_found') {
          await this.paymentWebhooksService.markError(
            record,
            `payment ${payment.id} not found`,
          );
        } else {
          await this.paymentWebhooksService.markProcessed(record, payment.id);
        }
        break;
      }

      default:
        await this.paymentWebhooksService.markIgnored(record);
    }

    return { received: true };
  }
}
