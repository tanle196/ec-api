import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TypedConfigService } from '@/config/TypedConfigService';
import { Order } from '@/orders/entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { PaymentMethod } from '../../enums/payment-method.enum';
import {
  GatewayPaymentStatus,
  PaymentGatewayProvider,
  PaymentInitiationContext,
  PaymentInitiationResult,
  PaymentRefundResult,
} from '../payment-gateway.interface';
import {
  fromVnpayAmount,
  safeEqualHex,
  signPipe,
  signQuery,
  toTxnRef,
  toVnpayAmount,
  vnpayDate,
} from './vnpay-signature.util';

const VERSION = '2.1.0';
// How long VNPay keeps the payment page open.
const PAYMENT_WINDOW_MS = 15 * 60_000;

type ApiResponse = Record<string, string>;

// Fields the merchant API signs its responses over, in order.
const REFUND_RESPONSE_FIELDS = [
  'vnp_ResponseId',
  'vnp_Command',
  'vnp_ResponseCode',
  'vnp_Message',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_Amount',
  'vnp_BankCode',
  'vnp_PayDate',
  'vnp_TransactionNo',
  'vnp_TransactionType',
  'vnp_TransactionStatus',
  'vnp_OrderInfo',
];
const QUERY_RESPONSE_FIELDS = [
  ...REFUND_RESPONSE_FIELDS,
  'vnp_PromotionCode',
  'vnp_PromotionAmount',
];

/**
 * VNPay (v2.1.0). The payment URL is built and signed locally; the outcome
 * arrives by IPN (VnpayIpnService), which is the source of truth. The
 * return URL only tells the customer where to go next.
 *
 * Payment metadata keeps what later calls need:
 *   vnpTxnRef, vnpCreateDate         set here; vnpCreateDate is the
 *                                    "transaction date" refund and
 *                                    querydr refer to
 *   vnpTransactionNo, vnpPayDate     set from the IPN
 */
@Injectable()
export class VnpayGatewayProvider implements PaymentGatewayProvider {
  readonly method = PaymentMethod.VNPAY;

  // Overridable in tests.
  fetch: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
    globalThis.fetch(url, init);

  constructor(private readonly config: TypedConfigService) {}

  isConfigured(): boolean {
    const c = this.config.getVnpayConfig();
    return Boolean(c.tmnCode && c.hashSecret);
  }

  initiate(
    payment: Payment,
    order: Order,
    context?: PaymentInitiationContext,
  ): Promise<PaymentInitiationResult> {
    const c = this.config.getVnpayConfig();
    const now = new Date();
    const txnRef = toTxnRef(payment.id);
    const createDate = vnpayDate(now);

    const query = signQuery(
      {
        vnp_Version: VERSION,
        vnp_Command: 'pay',
        vnp_TmnCode: c.tmnCode,
        vnp_Amount: toVnpayAmount(Number(payment.amount)),
        vnp_CurrCode: 'VND',
        vnp_TxnRef: txnRef,
        // ASCII only: VNPay rejects or mangles diacritics here.
        vnp_OrderInfo: `Thanh toan don hang ${order.orderNumber}`,
        vnp_OrderType: 'other',
        vnp_Locale: 'vn',
        vnp_ReturnUrl: c.returnUrl,
        vnp_IpAddr: context?.clientIp ?? '127.0.0.1',
        vnp_CreateDate: createDate,
        vnp_ExpireDate: vnpayDate(new Date(now.getTime() + PAYMENT_WINDOW_MS)),
      },
      c.hashSecret,
    );

    return Promise.resolve({
      providerRef: txnRef,
      redirectUrl: `${c.paymentUrl}?${query}`,
      metadata: { vnpTxnRef: txnRef, vnpCreateDate: createDate },
    });
  }

  async refund(
    payment: Payment,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<PaymentRefundResult> {
    const meta = payment.metadata ?? {};
    const transactionNo = meta.vnpTransactionNo as string | undefined;
    const createDate = meta.vnpCreateDate as string | undefined;
    if (!transactionNo || !createDate) {
      throw new BadRequestException(
        'Payment has no VNPay transaction to refund',
      );
    }

    const c = this.config.getVnpayConfig();
    // Same request id on a retry, so VNPay can recognise the duplicate.
    const requestId = toTxnRef(idempotencyKey);
    const transactionType = amount >= Number(payment.amount) ? '02' : '03'; // full : partial
    const fields = {
      vnp_RequestId: requestId,
      vnp_Version: VERSION,
      vnp_Command: 'refund',
      vnp_TmnCode: c.tmnCode,
      vnp_TransactionType: transactionType,
      vnp_TxnRef: toTxnRef(payment.id),
      vnp_Amount: toVnpayAmount(amount),
      vnp_TransactionNo: transactionNo,
      vnp_TransactionDate: createDate,
      vnp_CreateBy: 'system',
      vnp_CreateDate: vnpayDate(new Date()),
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: `Hoan tien: ${asciiOnly(reason)}`.slice(0, 255),
    };

    const response = await this.callApi(
      {
        ...fields,
        vnp_SecureHash: signPipe(Object.values(fields), c.hashSecret),
      },
      REFUND_RESPONSE_FIELDS,
    );

    if (response.vnp_ResponseCode !== '00') {
      throw new BadGatewayException(
        `VNPay refund failed (${response.vnp_ResponseCode}): ${response.vnp_Message ?? ''}`,
      );
    }

    return {
      providerRef: response.vnp_TransactionNo ?? requestId,
      raw: response,
    };
  }

  async queryStatus(payment: Payment): Promise<GatewayPaymentStatus> {
    const createDate = payment.metadata?.vnpCreateDate as string | undefined;
    if (!createDate) return { status: 'unknown' };

    const c = this.config.getVnpayConfig();
    const fields = {
      vnp_RequestId: toTxnRef(randomUUID()),
      vnp_Version: VERSION,
      vnp_Command: 'querydr',
      vnp_TmnCode: c.tmnCode,
      vnp_TxnRef: toTxnRef(payment.id),
      vnp_TransactionDate: createDate,
      vnp_CreateDate: vnpayDate(new Date()),
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: `Truy van ${toTxnRef(payment.id)}`,
    };
    const response = await this.callApi(
      {
        ...fields,
        vnp_SecureHash: signPipe(Object.values(fields), c.hashSecret),
      },
      QUERY_RESPONSE_FIELDS,
    );

    if (response.vnp_ResponseCode === '91')
      return { status: 'failed', raw: response }; // no such transaction
    if (response.vnp_ResponseCode !== '00')
      return { status: 'unknown', raw: response };

    switch (response.vnp_TransactionStatus) {
      case '00':
        return {
          status: 'paid',
          amount: fromVnpayAmount(response.vnp_Amount),
          transactionId: response.vnp_TransactionNo,
          raw: response,
        };
      case '01':
        return { status: 'pending', raw: response };
      case '02':
        return { status: 'failed', raw: response };
      default:
        // Reversal, refund in progress, suspected fraud...: a person decides.
        return { status: 'unknown', raw: response };
    }
  }

  /**
   * POSTs to the merchant API and checks the response signature, which is
   * over `signedFields` joined with "|" in that order.
   */
  private async callApi(
    body: Record<string, string>,
    signedFields: string[],
  ): Promise<ApiResponse> {
    const c = this.config.getVnpayConfig();
    const res = await this.fetch(c.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new BadGatewayException(`VNPay API returned HTTP ${res.status}`);
    }
    const data = (await res.json()) as ApiResponse;

    const signed = signedFields.map((k) => data[k] ?? '');
    if (
      !data.vnp_SecureHash ||
      !safeEqualHex(signPipe(signed, c.hashSecret), data.vnp_SecureHash)
    ) {
      throw new BadGatewayException('VNPay API response signature mismatch');
    }
    return data;
  }
}

function asciiOnly(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]/g, '');
}
