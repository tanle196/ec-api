import {
  canonicalQuery,
  fromTxnRef,
  fromVnpayAmount,
  hmacSha512,
  signQuery,
  toTxnRef,
  toVnpayAmount,
  verifyQuery,
  vnpayDate,
} from './vnpay-signature.util';

describe('vnpay signature utils', () => {
  const secret = 'TESTSECRET';

  it('sorts keys, encodes values with + for spaces and drops empties', () => {
    expect(
      canonicalQuery({
        vnp_OrderInfo: 'Thanh toan don ORD-1',
        vnp_Amount: '1000000',
        vnp_BankCode: '',
      }),
    ).toBe('vnp_Amount=1000000&vnp_OrderInfo=Thanh+toan+don+ORD-1');
  });

  it('signs with HMAC-SHA512 over the canonical query', () => {
    const query = signQuery({ b: '2', a: '1' }, secret);
    expect(query).toBe(
      `a=1&b=2&vnp_SecureHash=${hmacSha512(secret, 'a=1&b=2')}`,
    );
    expect(hmacSha512(secret, 'a=1&b=2')).toMatch(/^[0-9a-f]{128}$/);
  });

  it('verifies a callback it signed, ignoring hash fields and case', () => {
    const params = {
      vnp_Amount: '1000000',
      vnp_OrderInfo: 'Thanh toan don ORD-1',
      vnp_TxnRef: 'abc',
    };
    const hash = hmacSha512(secret, canonicalQuery(params));

    expect(
      verifyQuery(
        {
          ...params,
          vnp_SecureHash: hash.toUpperCase(),
          vnp_SecureHashType: 'HmacSHA512',
        },
        secret,
      ),
    ).toBe(true);
  });

  it('rejects a tampered or unsigned callback', () => {
    const params = { vnp_Amount: '1000000', vnp_TxnRef: 'abc' };
    const hash = hmacSha512(secret, canonicalQuery(params));

    expect(
      verifyQuery({ ...params, vnp_Amount: '1', vnp_SecureHash: hash }, secret),
    ).toBe(false);
    expect(verifyQuery(params, secret)).toBe(false);
    expect(
      verifyQuery({ ...params, vnp_SecureHash: hash }, 'OTHERSECRET'),
    ).toBe(false);
  });

  it('formats dates in Vietnam time', () => {
    expect(vnpayDate(new Date('2026-11-28T17:05:09Z'))).toBe('20261129000509');
  });

  it('round-trips payment ids through vnp_TxnRef', () => {
    const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
    expect(toTxnRef(id)).toBe('3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b');
    expect(fromTxnRef(toTxnRef(id))).toBe(id);
    expect(fromTxnRef('not-a-ref')).toBeNull();
  });

  it('converts amounts to and from VNPay units', () => {
    expect(toVnpayAmount(150000)).toBe('15000000');
    expect(fromVnpayAmount('15000000')).toBe(150000);
    expect(fromVnpayAmount(undefined)).toBeNaN();
  });
});
