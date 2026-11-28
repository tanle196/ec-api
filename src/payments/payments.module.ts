import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrdersModule } from '@/orders/orders.module';
import { OutboxModule } from '@/outbox/outbox.module';
import { UsersModule } from '@/users/users.module';
import { MailModule } from '@/mail/mail.module';
import { PaymentIssue } from './entities/payment-issue.entity';
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
import { VnpayGatewayProvider } from './gateways/vnpay/vnpay-gateway.provider';
import { VnpayIpnService } from './gateways/vnpay/vnpay-ipn.service';
import { AdminPaymentOperationsController } from './admin-payment-operations.controller';
import { PaymentIssuesService } from './payment-issues.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { OrderReturnedHandler } from './order-returned.handler';
import { PaymentsController } from './payments.controller';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { RefundRequestsController } from './refund-requests.controller';
import { AdminRefundRequestsController } from './admin-refund-requests.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentsService } from './payments.service';
import { RefundRequestsService } from './refund-requests.service';
import { PaymentPolicy } from './policies/payment.policy';
import { RefundRequestPolicy } from './policies/refund-request.policy';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Order,
      PaymentWebhookEvent,
      PaymentIssue,
      Refund,
      RefundItem,
      RefundRequest,
      RefundRequestItem,
    ]),
    OrdersModule,
    OutboxModule,
    UsersModule,
    MailModule,
  ],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    PaymentWebhooksController,
    RefundRequestsController,
    AdminRefundRequestsController,
    AdminPaymentOperationsController,
  ],
  providers: [
    PaymentsService,
    PaymentWebhooksService,
    RefundRequestsService,
    PaymentPolicy,
    RefundRequestPolicy,
    PaymentGatewayRegistry,
    StripeClientProvider,
    StripeGatewayProvider,
    StripeWebhookVerifierService,
    VnpayGatewayProvider,
    VnpayIpnService,
    PaymentIssuesService,
    PaymentReconciliationService,
    OrderReturnedHandler,
    {
      provide: PAYMENT_GATEWAY_PROVIDERS,
      // VNPay is only offered once its merchant credentials are configured.
      useFactory: (
        stripe: StripeGatewayProvider,
        vnpay: VnpayGatewayProvider,
      ) => (vnpay.isConfigured() ? [stripe, vnpay] : [stripe]),
      inject: [StripeGatewayProvider, VnpayGatewayProvider],
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
