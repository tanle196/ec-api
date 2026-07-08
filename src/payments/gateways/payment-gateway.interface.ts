import { Order } from '@/orders/entities/order.entity';
import { Payment } from '../entities/payment.entity';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentInitiationResult {
  providerRef: string;
  redirectUrl?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentRefundResult {
  providerRef: string;
  raw?: Record<string, unknown>;
}

export interface PaymentGatewayProvider {
  readonly method: PaymentMethod;
  initiate(payment: Payment, order: Order): Promise<PaymentInitiationResult>;
  /**
   * Not all methods support refunding through the gateway (e.g. COD, bank
   * transfer are reconciled manually); implement only where applicable.
   */
  refund?(
    payment: Payment,
    amount: number,
    reason: string,
  ): Promise<PaymentRefundResult>;
}
