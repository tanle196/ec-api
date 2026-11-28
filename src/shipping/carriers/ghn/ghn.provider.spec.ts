import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ShipmentStatus } from '@/orders/shipments/enums/shipment-status.enum';
import { GhnProvider } from './ghn.provider';

describe('GhnProvider', () => {
  const config = {
    getShippingConfig: () => ({
      ghnToken: 'tok',
      ghnShopId: '885',
      ghnApiUrl: 'https://ghn.test/shiip/public-api',
      ghnWebhookSecret: 'webhook-secret-123456',
      ghnServiceTypeId: 2,
      ghnRequiredNote: 'CHOXEMHANGKHONGTHU',
    }),
  };
  const build = () => {
    const provider = new GhnProvider(config as never);
    const fetchMock = jest.fn();
    provider.fetch = fetchMock;
    const respond = (body: object, ok = true) =>
      fetchMock.mockResolvedValueOnce({
        ok,
        status: ok ? 200 : 500,
        json: () => Promise.resolve(body),
      });
    const call = (i = 0) => {
      const [url, init] = (fetchMock.mock.calls as [string, RequestInit][])[i];
      return {
        url,
        headers: init.headers as Record<string, string>,
        body: init.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : undefined,
      };
    };
    return { provider, respond, call, fetchMock };
  };
  const request = {
    reference: 'ORD-1',
    recipient: {
      fullName: 'An',
      phone: '0900',
      addressLine1: '1 Lê Lợi',
      addressLine2: 'Lầu 2',
      city: 'Q1',
      province: 'HCM',
      districtCode: '1442',
      wardCode: '20109',
    },
    items: [{ name: 'Áo - M', quantity: 2, weightGrams: 300 }],
    parcel: { weightGrams: 900, lengthCm: 30, widthCm: 20, heightCm: 10 },
    codAmount: 350000,
    insuranceValue: 300000,
  };

  it('books an order and returns the GHN order code, fee and ETA', async () => {
    const { provider, respond, call } = build();
    respond({
      code: 200,
      message: 'Success',
      data: {
        order_code: 'GHNABC',
        total_fee: 32000,
        expected_delivery_time: '2026-12-01T10:00:00Z',
      },
    });

    await expect(provider.book(request)).resolves.toEqual(
      expect.objectContaining({
        trackingNumber: 'GHNABC',
        fee: 32000,
        expectedDeliveryAt: new Date('2026-12-01T10:00:00Z'),
      }),
    );

    const { url, headers, body } = call();
    expect(url).toBe(
      'https://ghn.test/shiip/public-api/v2/shipping-order/create',
    );
    expect(headers).toEqual(
      expect.objectContaining({ Token: 'tok', ShopId: '885' }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        payment_type_id: 1,
        required_note: 'CHOXEMHANGKHONGTHU',
        client_order_code: 'ORD-1',
        to_address: '1 Lê Lợi, Lầu 2',
        to_ward_code: '20109',
        to_district_id: 1442,
        cod_amount: 350000,
        weight: 900,
        service_type_id: 2,
        items: [{ name: 'Áo - M', quantity: 2, weight: 300 }],
      }),
    );
  });

  it('refuses an address without GHN location codes', async () => {
    const { provider, fetchMock } = build();
    await expect(
      provider.book({
        ...request,
        recipient: { ...request.recipient, wardCode: null },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces GHN errors', async () => {
    const { provider, respond } = build();
    respond({ code: 400, message: 'Số điện thoại không hợp lệ', data: null });
    await expect(provider.book(request)).rejects.toThrow(
      new BadGatewayException(
        'GHN /v2/shipping-order/create failed (400): Số điện thoại không hợp lệ',
      ),
    );
  });

  it('cancels by order code', async () => {
    const { provider, respond, call } = build();
    respond({ code: 200, message: 'ok', data: [] });
    await provider.cancel('GHNABC');
    expect(call().body).toEqual({ order_codes: ['GHNABC'] });
  });

  it('accepts only webhooks carrying the shared secret', () => {
    const { provider } = build();
    expect(provider.verifyWebhook({ token: 'webhook-secret-123456' })).toBe(
      true,
    );
    expect(provider.verifyWebhook({ token: 'wrong' })).toBe(false);
    expect(provider.verifyWebhook({})).toBe(false);
  });

  it.each([
    ['delivering', ShipmentStatus.IN_TRANSIT],
    ['delivered', ShipmentStatus.DELIVERED],
    ['delivery_fail', ShipmentStatus.DELIVERY_FAILED],
    ['waiting_to_return', ShipmentStatus.RETURNING],
    ['returned', ShipmentStatus.RETURNED],
    ['lost', null],
    ['something_new', null],
  ])('maps GHN status %s', (ghnStatus, status) => {
    const { provider } = build();
    const update = provider.parseWebhook({
      OrderCode: 'GHNABC',
      Status: ghnStatus,
      Time: '2026-11-28T03:00:00Z',
      Reason: 'Khách hẹn lại',
    });
    expect(update).toEqual({
      trackingNumber: 'GHNABC',
      status,
      carrierStatus: ghnStatus,
      description: 'Khách hẹn lại',
      occurredAt: new Date('2026-11-28T03:00:00Z'),
      eventKey: `GHNABC:${ghnStatus}:2026-11-28T03:00:00.000Z`,
    });
  });

  it('rejects a webhook without order code or status', () => {
    expect(() =>
      build().provider.parseWebhook({ Status: 'delivered' }),
    ).toThrow(BadRequestException);
  });

  it('lists and caches master-data locations', async () => {
    const { provider, respond, call, fetchMock } = build();
    respond({
      code: 200,
      message: 'ok',
      data: [{ DistrictID: 1442, DistrictName: 'Quận 1' }],
    });

    await expect(provider.locations('district', '202')).resolves.toEqual([
      { id: '1442', name: 'Quận 1' },
    ]);
    await provider.locations('district', '202');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call().body).toEqual({ province_id: 202 });
  });
});
