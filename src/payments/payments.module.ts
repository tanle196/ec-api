import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrdersModule } from '@/orders/orders.module';
import { UsersModule } from '@/users/users.module';
import { MailModule } from '@/mail/mail.module';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { RefundItem } from './entities/refund-item.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { RefundRequestItem } from './entities/refund-request-item.entity';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { PAYMENT_GATEWAY_PROVIDERS } from './gateways/tokens';
import { StripeClientProvider } from './gateways/stripe/stripe-client.provider';
import { StripeGatewayProvider } from './gateways/stripe/stripe-gateway.provider';
import { StripeWebhookVerifierService } from './gateways/stripe/stripe-webhook-verifier.service';
import { PaymentsController } from './payments.controller';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { RefundRequestsController } from './refund-requests.controller';
import { AdminRefundRequestsController } from './admin-refund-requests.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsService } from './payments.service';
import { RefundRequestsService } from './refund-requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Order,
      PaymentWebhookEvent,
      Refund,
      RefundItem,
      RefundRequest,
      RefundRequestItem,
    ]),
    OrdersModule,
    UsersModule,
    MailModule,
  ],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    PaymentWebhooksController,
    RefundRequestsController,
    AdminRefundRequestsController,
  ],
  providers: [
    PaymentsService,
    PaymentWebhooksService,
    RefundRequestsService,
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
