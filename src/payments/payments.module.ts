import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrdersModule } from '@/orders/orders.module';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { Payment } from './entities/payment.entity';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PAYMENT_GATEWAY_PROVIDERS } from './gateways/tokens';
import { StripeClientProvider } from './gateways/stripe/stripe-client.provider';
import { StripeGatewayProvider } from './gateways/stripe/stripe-gateway.provider';
import { StripeWebhookVerifierService } from './gateways/stripe/stripe-webhook-verifier.service';
import { PaymentsController } from './payments.controller';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Order, PaymentWebhookEvent]),
    OrdersModule,
  ],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    PaymentWebhooksController,
  ],
  providers: [
    PaymentsService,
    PaymentWebhooksService,
    PaymentGatewayRegistry,
    StripeClientProvider,
    StripeGatewayProvider,
    StripeWebhookVerifierService,
    {
      provide: PAYMENT_GATEWAY_PROVIDERS,
      useFactory: (stripeGatewayProvider: StripeGatewayProvider) => [
        stripeGatewayProvider,
      ],
      inject: [StripeGatewayProvider],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
