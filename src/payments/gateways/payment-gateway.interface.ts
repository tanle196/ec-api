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
   *
   * `idempotencyKey` should be forwarded to the underlying gateway call
   * whenever it supports one (e.g. Stripe) — it's derived from the Refund
   * row's own id, stable for the lifetime of that row, so an
   * automatic/network-level retry of this exact call can never create a
   * second real refund at the gateway even if our own response was lost.
   */
  refund?(
    payment: Payment,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<PaymentRefundResult>;
}
