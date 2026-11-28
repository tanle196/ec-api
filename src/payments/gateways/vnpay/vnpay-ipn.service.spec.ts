import { PaymentMethod } from '../../enums/payment-method.enum';
import { PaymentStatus } from '../../enums/payment-status.enum';
import { WebhookProcessingStatus } from '../../enums/webhook-processing-status.enum';
import { PaymentPolicy } from '../../policies/payment.policy';
import { VnpayIpnService } from './vnpay-ipn.service';
import { canonicalQuery, hmacSha512 } from './vnpay-signature.util';

describe('VnpayIpnService', () => {
  const secret = 'SECRET';
  const paymentId = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
  const txnRef = '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b';

  const signed = (params: Record<string, string>) => ({
    ...params,
    vnp_SecureHash: hmacSha512(secret, canonicalQuery(params)),
  });
  const ipn = (overrides: Record<string, string> = {}) =>
    signed({
      vnp_TmnCode: 'TMN01',
      vnp_TxnRef: txnRef,
      vnp_Amount: '15000000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14000001',
      vnp_PayDate: '20261128101010',
      vnp_BankCode: 'NCB',
      ...overrides,
    });

  const build = (
    payment: object | null = {
      id: paymentId,
      order_id: 'order-1',
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.PENDING,
      amount: 150000,
    },
  ) => {
    const paymentRepo = { findOne: jest.fn().mockResolvedValue(payment) };
    const record = { id: 'rec', status: WebhookProcessingStatus.RECEIVED };
    const webhooks = {
      recordEvent: jest.fn().mockResolvedValue({ isNew: true, record }),
      markProcessed: jest.fn(),
      markError: jest.fn(),
    };
    const payments = {
      completeFromGatewayEvent: jest.fn().mockResolvedValue('processed'),
      failFromGatewayEvent: jest.fn().mockResolvedValue('processed'),
    };
    const config = {
      getVnpayConfig: () => ({
        hashSecret: secret,
        resultUrl: 'https://shop/result',
      }),
    };
    const service = new VnpayIpnService(
      paymentRepo as never,
      config as never,
      webhooks as never,
      payments as never,
      new PaymentPolicy(),
    );
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    return { service, webhooks, payments, record };
  };

  it('completes a paid transaction and confirms receipt', async () => {
    const { service, payments, webhooks, record } = build();

    await expect(service.handleIpn(ipn())).resolves.toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });

    expect(webhooks.recordEvent).toHaveBeenCalledWith(
      PaymentMethod.VNPAY,
      `${txnRef}:14000001:00`,
      expect.anything(),
    );
    expect(payments.completeFromGatewayEvent).toHaveBeenCalledWith(
      paymentId,
      '14000001',
      {
        vnpTransactionNo: '14000001',
        vnpPayDate: '20261128101010',
        vnpBankCode: 'NCB',
        vnpCardType: undefined,
      },
      expect.stringContaining('14000001'),
      150000,
    );
    expect(webhooks.markProcessed).toHaveBeenCalledWith(record, paymentId);
  });

  it('fails the payment on a declined transaction', async () => {
    const { service, payments } = build();

    await expect(
      service.handleIpn(
        ipn({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
      ),
    ).resolves.toEqual(expect.objectContaining({ RspCode: '00' }));
    expect(payments.failFromGatewayEvent).toHaveBeenCalledWith(paymentId, {
      vnpResponseCode: '24',
      vnpTransactionStatus: '02',
    });
    expect(payments.completeFromGatewayEvent).not.toHaveBeenCalled();
  });

  it('rejects a bad signature without touching anything', async () => {
    const { service, webhooks } = build();

    await expect(
      service.handleIpn({ ...ipn(), vnp_Amount: '1' }),
    ).resolves.toEqual(expect.objectContaining({ RspCode: '97' }));
    expect(webhooks.recordEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown payment', null],
    [
      'a payment by another method',
      { id: paymentId, method: PaymentMethod.STRIPE },
    ],
  ])('answers 01 for %s', async (_label, payment) => {
    const { service } = build(payment);
    await expect(service.handleIpn(ipn())).resolves.toEqual(
      expect.objectContaining({ RspCode: '01' }),
    );
  });

  it('answers 04 when the amount does not match', async () => {
    const { service, payments } = build();
    await expect(
      service.handleIpn(ipn({ vnp_Amount: '100' })),
    ).resolves.toEqual(expect.objectContaining({ RspCode: '04' }));
    expect(payments.completeFromGatewayEvent).not.toHaveBeenCalled();
  });

  it('answers 02 for a payment already settled', async () => {
    const { service, payments } = build({
      id: paymentId,
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.COMPLETED,
      amount: 150000,
    });
    await expect(service.handleIpn(ipn())).resolves.toEqual(
      expect.objectContaining({ RspCode: '02' }),
    );
    expect(payments.completeFromGatewayEvent).not.toHaveBeenCalled();
  });

  it('answers 02 for a duplicate IPN that already finished', async () => {
    const { service, webhooks, payments } = build();
    webhooks.recordEvent.mockResolvedValue({
      isNew: false,
      record: { status: WebhookProcessingStatus.PROCESSED },
    });
    await expect(service.handleIpn(ipn())).resolves.toEqual(
      expect.objectContaining({ RspCode: '02' }),
    );
    expect(payments.completeFromGatewayEvent).not.toHaveBeenCalled();
  });

  it('completes a payment we voided on expiry (late payment)', async () => {
    const { service, payments } = build({
      id: paymentId,
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.FAILED,
      amount: 150000,
    });
    await expect(service.handleIpn(ipn())).resolves.toEqual(
      expect.objectContaining({ RspCode: '00' }),
    );
    expect(payments.completeFromGatewayEvent).toHaveBeenCalled();
  });

  it('answers 99 so VNPay retries when processing fails', async () => {
    const { service, payments, webhooks, record } = build();
    payments.completeFromGatewayEvent.mockRejectedValue(new Error('db down'));

    await expect(service.handleIpn(ipn())).resolves.toEqual(
      expect.objectContaining({ RspCode: '99' }),
    );
    expect(webhooks.markError).toHaveBeenCalledWith(record, 'db down');
  });

  describe('resolveReturnUrl', () => {
    it('sends the customer to the result page for their order', async () => {
      const { service, payments } = build();
      await expect(service.resolveReturnUrl(ipn())).resolves.toBe(
        'https://shop/result?order_id=order-1&status=success',
      );
      // Display only: the IPN decides.
      expect(payments.completeFromGatewayEvent).not.toHaveBeenCalled();
    });

    it('shows failure for a declined or tampered return', async () => {
      const { service } = build();
      await expect(
        service.resolveReturnUrl(ipn({ vnp_ResponseCode: '24' })),
      ).resolves.toContain('status=failed');
      await expect(
        service.resolveReturnUrl({ ...ipn(), vnp_Amount: '1' }),
      ).resolves.toBe('https://shop/result?status=failed');
    });
  });
});
