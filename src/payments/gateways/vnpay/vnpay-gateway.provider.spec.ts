import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '../../enums/payment-method.enum';
import { VnpayGatewayProvider } from './vnpay-gateway.provider';
import { hmacSha512, signPipe, verifyQuery } from './vnpay-signature.util';

describe('VnpayGatewayProvider', () => {
  const secret = 'SECRET';
  const config = (overrides: object = {}) => ({
    getVnpayConfig: () => ({
      tmnCode: 'TMN01',
      hashSecret: secret,
      paymentUrl: 'https://sandbox.vnpay/pay',
      apiUrl: 'https://sandbox.vnpay/api',
      returnUrl: 'https://api.shop/payments/webhooks/vnpay/return',
      resultUrl: 'https://shop/result',
      ...overrides,
    }),
  });
  const payment = {
    id: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
    amount: 150000,
    metadata: {
      vnpCreateDate: '20261128100000',
      vnpTransactionNo: '14000001',
    },
  };
  const order = { id: 'order-1', orderNumber: 'ORD-1' };

  // A VNPay merchant API response, signed over `fields` the way VNPay does.
  const signedResponse = (data: Record<string, string>, fields: string[]) => ({
    ...data,
    vnp_SecureHash: signPipe(
      fields.map((f) => data[f] ?? ''),
      secret,
    ),
  });
  const REFUND_FIELDS = [
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
  const QUERY_FIELDS = [
    ...REFUND_FIELDS,
    'vnp_PromotionCode',
    'vnp_PromotionAmount',
  ];

  const build = (overrides?: object) => {
    const provider = new VnpayGatewayProvider(config(overrides) as never);
    const fetchMock = jest.fn();
    provider.fetch = fetchMock;
    const respond = (body: object, ok = true) =>
      fetchMock.mockResolvedValueOnce({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
      });
    const sentBody = () =>
      JSON.parse(
        (fetchMock.mock.calls as [string, { body: string }][])[0][1].body,
      ) as Record<string, string>;
    return { provider, fetchMock, respond, sentBody };
  };

  it('handles VNPAY and reports whether it is configured', () => {
    expect(build().provider.method).toBe(PaymentMethod.VNPAY);
    expect(build().provider.isConfigured()).toBe(true);
    expect(build({ tmnCode: '' }).provider.isConfigured()).toBe(false);
  });

  describe('initiate', () => {
    beforeEach(() =>
      jest.useFakeTimers({ now: new Date('2026-11-28T03:00:00Z') }),
    );
    afterEach(() => jest.useRealTimers());

    it('builds a signed payment URL and keeps what refunds need', async () => {
      const { provider } = build();

      const result = await provider.initiate(payment as never, order as never, {
        clientIp: '1.2.3.4',
      });

      const url = new URL(result.redirectUrl!);
      expect(url.origin + url.pathname).toBe('https://sandbox.vnpay/pay');
      const params = Object.fromEntries(url.searchParams.entries());
      expect(params).toEqual(
        expect.objectContaining({
          vnp_Version: '2.1.0',
          vnp_Command: 'pay',
          vnp_TmnCode: 'TMN01',
          vnp_Amount: '15000000',
          vnp_CurrCode: 'VND',
          vnp_TxnRef: '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b',
          vnp_OrderInfo: 'Thanh toan don hang ORD-1',
          vnp_IpAddr: '1.2.3.4',
          vnp_CreateDate: '20261128100000',
          vnp_ExpireDate: '20261128101500',
          vnp_ReturnUrl: 'https://api.shop/payments/webhooks/vnpay/return',
        }),
      );
      // VNPay verifies it exactly the way we verify IPNs.
      expect(verifyQuery(params, secret)).toBe(true);
      expect(result.providerRef).toBe('3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b');
      expect(result.metadata).toEqual({
        vnpTxnRef: '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b',
        vnpCreateDate: '20261128100000',
      });
    });
  });

  describe('refund', () => {
    it('sends a signed full refund and returns the VNPay reference', async () => {
      const { provider, respond, sentBody } = build();
      respond(
        signedResponse(
          {
            vnp_ResponseCode: '00',
            vnp_Message: 'ok',
            vnp_TransactionNo: '14000099',
          },
          REFUND_FIELDS,
        ),
      );

      const result = await provider.refund(
        payment as never,
        150000,
        'Hàng lỗi',
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      );

      const body = sentBody();
      expect(body).toEqual(
        expect.objectContaining({
          vnp_RequestId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee',
          vnp_Command: 'refund',
          vnp_TransactionType: '02',
          vnp_Amount: '15000000',
          vnp_TransactionNo: '14000001',
          vnp_TransactionDate: '20261128100000',
          vnp_OrderInfo: 'Hoan tien: Hang loi',
        }),
      );
      const { vnp_SecureHash, ...fields } = body;
      expect(vnp_SecureHash).toBe(
        hmacSha512(secret, Object.values(fields).join('|')),
      );
      expect(result.providerRef).toBe('14000099');
    });

    it('uses the partial refund type below the payment amount', async () => {
      const { provider, respond, sentBody } = build();
      respond(signedResponse({ vnp_ResponseCode: '00' }, REFUND_FIELDS));

      await provider.refund(payment as never, 50000, 'x', 'k');

      expect(sentBody().vnp_TransactionType).toBe('03');
    });

    it('fails on a non-00 response', async () => {
      const { provider, respond } = build();
      respond(
        signedResponse(
          { vnp_ResponseCode: '94', vnp_Message: 'dup' },
          REFUND_FIELDS,
        ),
      );

      await expect(
        provider.refund(payment as never, 150000, 'x', 'k'),
      ).rejects.toThrow('VNPay refund failed (94): dup');
    });

    it('rejects a response whose signature does not check out', async () => {
      const { provider, respond } = build();
      respond({ vnp_ResponseCode: '00', vnp_SecureHash: 'forged' });

      await expect(
        provider.refund(payment as never, 150000, 'x', 'k'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('needs the original transaction', async () => {
      const { provider } = build();
      await expect(
        provider.refund({ ...payment, metadata: {} } as never, 1, 'x', 'k'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('queryStatus', () => {
    it.each([
      ['00', 'paid'],
      ['01', 'pending'],
      ['02', 'failed'],
      ['07', 'unknown'],
    ])('maps transaction status %s to %s', async (code, status) => {
      const { provider, respond } = build();
      respond(
        signedResponse(
          {
            vnp_ResponseCode: '00',
            vnp_TransactionStatus: code,
            vnp_Amount: '15000000',
            vnp_TransactionNo: '14000001',
          },
          QUERY_FIELDS,
        ),
      );

      const result = await provider.queryStatus(payment as never);

      expect(result.status).toBe(status);
      if (status === 'paid') {
        expect(result).toEqual(
          expect.objectContaining({
            amount: 150000,
            transactionId: '14000001',
          }),
        );
      }
    });

    it('treats an unknown transaction as failed', async () => {
      const { provider, respond } = build();
      respond(signedResponse({ vnp_ResponseCode: '91' }, QUERY_FIELDS));

      await expect(provider.queryStatus(payment as never)).resolves.toEqual(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('cannot query a payment it never initiated', async () => {
      const { provider, fetchMock } = build();
      await expect(
        provider.queryStatus({ ...payment, metadata: null } as never),
      ).resolves.toEqual({ status: 'unknown' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails on an HTTP error', async () => {
      const { provider, respond } = build();
      respond({}, false);
      await expect(provider.queryStatus(payment as never)).rejects.toThrow(
        'VNPay API returned HTTP 500',
      );
    });
  });
});
