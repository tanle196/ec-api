import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { TypedConfigService } from '@/config/TypedConfigService';
import {
  CarrierBooking,
  CarrierBookingRequest,
  CarrierProvider,
  CarrierStatusUpdate,
} from '../carrier.interface';
import { mapGhnStatus } from './ghn-status';

interface GhnResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface GhnLocation {
  id: string;
  name: string;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * GHN (Giao Hàng Nhanh) public API v2. Requires the recipient's GHN
 * district id and ward code (from GHN master data, see locations()).
 * The shop pays GHN's fee (payment_type_id 1): the customer already paid
 * shipping to the shop.
 */
@Injectable()
export class GhnProvider implements CarrierProvider {
  readonly code = 'GHN';

  // Overridable in tests.
  fetch: (url: string, init: RequestInit) => Promise<Response> = (url, init) =>
    globalThis.fetch(url, init);

  private readonly locationCache = new Map<
    string,
    { at: number; data: GhnLocation[] }
  >();

  constructor(private readonly config: TypedConfigService) {}

  isConfigured(): boolean {
    const c = this.config.getShippingConfig();
    return Boolean(c.ghnToken && c.ghnShopId);
  }

  async book(request: CarrierBookingRequest): Promise<CarrierBooking> {
    const { recipient } = request;
    if (!recipient.districtCode || !recipient.wardCode) {
      throw new BadRequestException(
        'The delivery address has no GHN district/ward; update it before booking GHN',
      );
    }
    const c = this.config.getShippingConfig();

    const data = await this.call<{
      order_code: string;
      total_fee?: number;
      expected_delivery_time?: string;
    }>('POST', '/v2/shipping-order/create', {
      payment_type_id: 1,
      required_note: c.ghnRequiredNote,
      client_order_code: request.reference,
      to_name: recipient.fullName,
      to_phone: recipient.phone,
      to_address: [recipient.addressLine1, recipient.addressLine2]
        .filter(Boolean)
        .join(', '),
      to_ward_code: recipient.wardCode,
      to_district_id: Number(recipient.districtCode),
      cod_amount: Math.round(request.codAmount),
      insurance_value: Math.round(request.insuranceValue),
      weight: request.parcel.weightGrams,
      length: request.parcel.lengthCm,
      width: request.parcel.widthCm,
      height: request.parcel.heightCm,
      service_type_id: c.ghnServiceTypeId,
      note: request.note ?? '',
      items: request.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        weight: i.weightGrams,
      })),
    });

    return {
      trackingNumber: data.order_code,
      fee: typeof data.total_fee === 'number' ? data.total_fee : null,
      expectedDeliveryAt: data.expected_delivery_time
        ? new Date(data.expected_delivery_time)
        : null,
      raw: data as unknown as Record<string, unknown>,
    };
  }

  async cancel(trackingNumber: string): Promise<void> {
    await this.call('POST', '/v2/switch-status/cancel', {
      order_codes: [trackingNumber],
    });
  }

  // GHN doesn't sign webhooks; the URL registered with GHN carries a
  // shared secret as ?token=.
  verifyWebhook(query: Record<string, string>): boolean {
    const secret = this.config.getShippingConfig().ghnWebhookSecret;
    const given = query.token ?? '';
    if (!secret || given.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  }

  parseWebhook(body: Record<string, unknown>): CarrierStatusUpdate {
    const text = (v: unknown) =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    const trackingNumber = text(body.OrderCode);
    const carrierStatus = text(body.Status).toLowerCase();
    if (!trackingNumber || !carrierStatus) {
      throw new BadRequestException('GHN webhook without OrderCode/Status');
    }
    const time = typeof body.Time === 'string' ? new Date(body.Time) : null;
    const occurredAt = time && !isNaN(time.getTime()) ? time : new Date();

    return {
      trackingNumber,
      status: mapGhnStatus(carrierStatus),
      carrierStatus,
      description:
        [body.Description, body.Reason].filter(Boolean).join(' — ') ||
        `GHN: ${carrierStatus}`,
      occurredAt,
      eventKey: `${trackingNumber}:${carrierStatus}:${occurredAt.toISOString()}`,
    };
  }

  /** GHN master data for the address picker, cached for a day. */
  async locations(
    level: 'province' | 'district' | 'ward',
    parentId?: string,
  ): Promise<GhnLocation[]> {
    const key = `${level}:${parentId ?? ''}`;
    const cached = this.locationCache.get(key);
    if (cached && Date.now() - cached.at < DAY_MS) return cached.data;

    let data: GhnLocation[];
    if (level === 'province') {
      const rows = await this.call<
        { ProvinceID: number; ProvinceName: string }[]
      >('GET', '/master-data/province');
      data = rows.map((r) => ({
        id: String(r.ProvinceID),
        name: r.ProvinceName,
      }));
    } else if (level === 'district') {
      const rows = await this.call<
        { DistrictID: number; DistrictName: string }[]
      >('POST', '/master-data/district', { province_id: Number(parentId) });
      data = rows.map((r) => ({
        id: String(r.DistrictID),
        name: r.DistrictName,
      }));
    } else {
      const rows = await this.call<{ WardCode: string; WardName: string }[]>(
        'POST',
        '/master-data/ward',
        { district_id: Number(parentId) },
      );
      data = rows.map((r) => ({ id: r.WardCode, name: r.WardName }));
    }

    this.locationCache.set(key, { at: Date.now(), data });
    return data;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const c = this.config.getShippingConfig();
    const res = await this.fetch(`${c.ghnApiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Token: c.ghnToken,
        ShopId: c.ghnShopId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let json: GhnResponse<T> | null = null;
    try {
      json = (await res.json()) as GhnResponse<T>;
    } catch {
      // Non-JSON error page.
    }
    if (!res.ok || !json || json.code !== 200) {
      throw new BadGatewayException(
        `GHN ${path} failed (${json?.code ?? res.status}): ${json?.message ?? 'no response body'}`,
      );
    }
    return json.data;
  }
}
