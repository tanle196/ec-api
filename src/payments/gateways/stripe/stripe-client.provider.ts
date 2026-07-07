import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { TypedConfigService } from '@/config/TypedConfigService';

@Injectable()
export class StripeClientProvider {
  readonly client: Stripe;

  constructor(config: TypedConfigService) {
    this.client = new Stripe(config.getStripeConfig().secretKey);
  }
}
