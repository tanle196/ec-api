import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypedConfigService } from '@/config/TypedConfigService';
import { Payment } from '../../entities/payment.entity';
import { PaymentMethod } from '../../enums/payment-method.enum';
import { WebhookProcessingStatus } from '../../enums/webhook-processing-status.enum';
import { PaymentWebhooksService } from '../../payment-webhooks.service';
import { PaymentsService } from '../../payments.service';
import { PaymentPolicy } from '../../policies/payment.policy';
import {
  fromTxnRef,
  fromVnpayAmount,
  verifyQuery,
} from './vnpay-signature.util';

// What VNPay expects back from the IPN endpoint.
export interface VnpayIpnResponse {
  RspCode: '00' | '01' | '02' | '04' | '97' | '99';
  Message: string;
}

const reply = (
  RspCode: VnpayIpnResponse['RspCode'],
  Message: string,
): VnpayIpnResponse => ({ RspCode, Message });

/**
 * VNPay IPN (server-to-server, the source of truth) and return URL (the
 * customer's browser, display only).
 *
 * The IPN is answered with VNPay's codes so VNPay knows whether to retry:
 * 00 handled · 01 unknown payment · 02 already handled · 04 wrong amount ·
 * 97 bad signature · 99 our error (VNPay retries).
 */
@Injectable()
export class VnpayIpnService {
  private readonly logger = new Logger(VnpayIpnService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly config: TypedConfigService,
    private readonly webhooksService: PaymentWebhooksService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentPolicy: PaymentPolicy,
  ) {}

  async handleIpn(query: Record<string, string>): Promise<VnpayIpnResponse> {
    const { hashSecret } = this.config.getVnpayConfig();
    if (!hashSecret || !verifyQuery(query, hashSecret)) {
      return reply('97', 'Invalid signature');
    }

    const paymentId = fromTxnRef(query.vnp_TxnRef ?? '');
    const payment = paymentId
      ? await this.paymentRepo.findOne({ where: { id: paymentId } })
      : null;
    if (!payment || payment.method !== PaymentMethod.VNPAY) {
      return reply('01', 'Order not found');
    }

    const amount = fromVnpayAmount(query.vnp_Amount);
    if (!this.paymentPolicy.amountsMatch(amount, Number(payment.amount))) {
      return reply('04', 'Invalid amount');
    }

    const eventId = [
      query.vnp_TxnRef,
      query.vnp_TransactionNo ?? '',
      query.vnp_ResponseCode ?? '',
    ].join(':');
    const { isNew, record } = await this.webhooksService.recordEvent(
      PaymentMethod.VNPAY,
      eventId,
      query,
    );
    // Same as the Stripe handler: a duplicate still at RECEIVED never
    // finished processing, so it is replayed (every step is idempotent).
    if (!isNew && record.status !== WebhookProcessingStatus.RECEIVED) {
      return reply('02', 'Order already confirmed');
    }
    if (this.paymentPolicy.isTerminal(payment.status)) {
      await this.webhooksService.markProcessed(record, payment.id);
      return reply('02', 'Order already confirmed');
    }

    try {
      if (this.isSuccess(query)) {
        await this.paymentsService.completeFromGatewayEvent(
          payment.id,
          query.vnp_TransactionNo,
          {
            vnpTransactionNo: query.vnp_TransactionNo,
            vnpPayDate: query.vnp_PayDate,
            vnpBankCode: query.vnp_BankCode,
            vnpCardType: query.vnp_CardType,
          },
          `VNPay IPN: paid (transaction ${query.vnp_TransactionNo})`,
          amount,
        );
      } else {
        await this.paymentsService.failFromGatewayEvent(payment.id, {
          vnpResponseCode: query.vnp_ResponseCode,
          vnpTransactionStatus: query.vnp_TransactionStatus,
        });
      }
      await this.webhooksService.markProcessed(record, payment.id);
      return reply('00', 'Confirm Success');
    } catch (error) {
      this.logger.error(
        `VNPay IPN for payment ${payment.id} failed`,
        error instanceof Error ? error.stack : error,
      );
      await this.webhooksService.markError(
        record,
        error instanceof Error ? error.message : String(error),
      );
      return reply('99', 'Unknown error');
    }
  }

  /**
   * Where to send the customer back to. Changes nothing: the IPN decides
   * the outcome. The status shown is only what the browser claims, after
   * checking the signature.
   */
  async resolveReturnUrl(query: Record<string, string>): Promise<string> {
    const { hashSecret, resultUrl } = this.config.getVnpayConfig();
    const url = new URL(resultUrl);

    const valid = Boolean(hashSecret) && verifyQuery(query, hashSecret);
    const paymentId = valid ? fromTxnRef(query.vnp_TxnRef ?? '') : null;
    const payment = paymentId
      ? await this.paymentRepo.findOne({ where: { id: paymentId } })
      : null;

    if (payment) url.searchParams.set('order_id', payment.order_id);
    url.searchParams.set(
      'status',
      valid && payment && this.isSuccess(query) ? 'success' : 'failed',
    );
    return url.toString();
  }

  private isSuccess(query: Record<string, string>): boolean {
    return (
      query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00'
    );
  }
}
