import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentGatewayProvider } from './payment-gateway.interface';
import { PAYMENT_GATEWAY_PROVIDERS } from './tokens';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly providers = new Map<PaymentMethod, PaymentGatewayProvider>();

  constructor(
    @Inject(PAYMENT_GATEWAY_PROVIDERS)
    providers: PaymentGatewayProvider[],
  ) {
    for (const provider of providers) {
      this.providers.set(provider.method, provider);
    }
  }

  resolve(method: PaymentMethod): PaymentGatewayProvider | undefined {
    return this.providers.get(method);
  }
}
