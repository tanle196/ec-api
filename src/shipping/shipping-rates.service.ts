import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Big from 'big.js';
import { Repository } from 'typeorm';
import { toMoney } from '@/common/utils/money.util';
import { TypedConfigService } from '@/config/TypedConfigService';
import { UpsertShippingRateDto } from './dto/upsert-shipping-rate.dto';
import { ShippingRate } from './entities/shipping-rate.entity';
import { ShippingZone } from './enums/shipping-zone.enum';

export interface ShippingQuote {
  fee: number;
  standardFee: number;
  // null when no rate table is configured and the flat fee was used.
  zone: ShippingZone | null;
  weightGrams: number;
  freeShipping: 'threshold' | 'discount_code' | null;
}

/**
 * "Tỉnh Bình Dương", "TP. Hồ Chí Minh", "thanh pho ho chi minh" -> one key,
 * so the zone doesn't depend on how the province was typed.
 */
export function provinceKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/^(tinh|thanh pho|tp\.?)\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Prices shipping from the shop's own rate table (see ShippingRate), so
 * checkout never waits on a carrier API. What the carrier actually charges
 * is recorded on the shipment for comparison.
 */
@Injectable()
export class ShippingRatesService {
  constructor(
    @InjectRepository(ShippingRate)
    private readonly rateRepo: Repository<ShippingRate>,
    private readonly config: TypedConfigService,
  ) {}

  /** Packed weight of a set of lines, using the default for unknowns. */
  weightOf(lines: { weightGrams: number | null; quantity: number }[]): number {
    const fallback = this.config.getShippingConfig().defaultItemWeightGrams;
    return lines.reduce(
      (sum, l) => sum + (l.weightGrams ?? fallback) * l.quantity,
      0,
    );
  }

  async quote(params: {
    province: string;
    weightGrams: number;
    subtotal: number;
  }): Promise<ShippingQuote> {
    const { shopProvince, freeShippingThreshold } =
      this.config.getShippingConfig();

    const zone =
      shopProvince && provinceKey(shopProvince) === provinceKey(params.province)
        ? ShippingZone.INTRA_PROVINCE
        : ShippingZone.INTER_PROVINCE;
    const rate = await this.rateRepo.findOne({ where: { zone } });

    const standardFee = rate
      ? this.feeFor(rate, params.weightGrams)
      : this.config.getAppConfig().shippingFlatFee;

    const free =
      freeShippingThreshold > 0 && params.subtotal >= freeShippingThreshold;

    return {
      fee: free ? 0 : standardFee,
      standardFee,
      zone: rate ? zone : null,
      weightGrams: params.weightGrams,
      freeShipping: free ? 'threshold' : null,
    };
  }

  feeFor(rate: ShippingRate, weightGrams: number): number {
    const extra = Math.max(0, weightGrams - rate.baseWeightGrams);
    const steps = Math.ceil(extra / rate.stepWeightGrams);
    return toMoney(
      new Big(Number(rate.baseFee)).plus(
        new Big(Number(rate.stepFee)).times(steps),
      ),
    );
  }

  findAll(): Promise<ShippingRate[]> {
    return this.rateRepo.find({ order: { zone: 'ASC' } });
  }

  async upsert(
    zone: ShippingZone,
    dto: UpsertShippingRateDto,
  ): Promise<ShippingRate> {
    await this.rateRepo.upsert({ zone, ...dto }, ['zone']);
    return this.rateRepo.findOneOrFail({ where: { zone } });
  }
}
