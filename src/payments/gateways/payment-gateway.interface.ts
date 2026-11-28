import { Order } from '@/orders/entities/order.entity';
import { Payment } from '../entities/payment.entity';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentInitiationContext {
  // The customer's IP; some gateways (VNPay) require it.
  clientIp?: string;
}

export interface PaymentInitiationResult {
  providerRef: string;
  redirectUrl?: string;
  // Kept on the payment's metadata for later calls (refund, status query).
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface PaymentRefundResult {
  providerRef: string;
  raw?: Record<string, unknown>;
}

/**
 * What the gateway itself says about a payment, used by reconciliation to
 * catch webhooks that never arrived and records that disagree.
 * - paid:    money was captured (`amount` is what was captured)
 * - pending: the customer hasn't finished, or the gateway is still settling
 * - failed:  cancelled, expired or declined; no money taken
 * - unknown: the gateway answered with something we can't map; flag it
 */
export interface GatewayPaymentStatus {
  status: 'paid' | 'pending' | 'failed' | 'unknown';
  amount?: number;
  // The gateway's id for the captured transaction, when paid.
  transactionId?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentGatewayProvider {
  readonly method: PaymentMethod;
  initiate(
    payment: Payment,
    order: Order,
    context?: PaymentInitiationContext,
  ): Promise<PaymentInitiationResult>;
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
  /** Asks the gateway for the payment's current state (reconciliation). */
  queryStatus?(payment: Payment): Promise<GatewayPaymentStatus>;
}
