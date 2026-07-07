import { Order } from '@/orders/entities/order.entity';
import { Payment } from '../entities/payment.entity';
import { PaymentMethod } from '../enums/payment-method.enum';

export interface PaymentInitiationResult {
  providerRef: string;
  redirectUrl?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentGatewayProvider {
  readonly method: PaymentMethod;
  initiate(payment: Payment, order: Order): Promise<PaymentInitiationResult>;
}
