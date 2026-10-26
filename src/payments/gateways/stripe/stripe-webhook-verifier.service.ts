import { BadRequestException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { TypedConfigService } from '@/config/TypedConfigService';
import { StripeClientProvider } from './stripe-client.provider';

@Injectable()
export class StripeWebhookVerifierService {
  constructor(
    private readonly stripeClient: StripeClientProvider,
    private readonly config: TypedConfigService,
  ) {}

  verify(rawBody: Buffer, signature: string): Stripe.Event {
    try {
      return this.stripeClient.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.config.getStripeConfig().webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }
}
