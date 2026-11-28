import { ShippingZone } from './enums/shipping-zone.enum';
import { provinceKey, ShippingRatesService } from './shipping-rates.service';

describe('ShippingRatesService', () => {
  const rates = {
    [ShippingZone.INTRA_PROVINCE]: {
      zone: ShippingZone.INTRA_PROVINCE,
      baseWeightGrams: 500,
      baseFee: '22000',
      stepWeightGrams: 500,
      stepFee: '5000',
    },
    [ShippingZone.INTER_PROVINCE]: {
      zone: ShippingZone.INTER_PROVINCE,
      baseWeightGrams: 500,
      baseFee: '32000',
      stepWeightGrams: 500,
      stepFee: '8000',
    },
  };

  const build = (opts: { threshold?: number; table?: boolean } = {}) => {
    const repo = {
      findOne: jest.fn(({ where }: { where: { zone: ShippingZone } }) =>
        Promise.resolve(opts.table === false ? null : rates[where.zone]),
      ),
    };
    const config = {
      getShippingConfig: () => ({
        shopProvince: 'Thành phố Hồ Chí Minh',
        defaultItemWeightGrams: 500,
        freeShippingThreshold: opts.threshold ?? 0,
      }),
      getAppConfig: () => ({ shippingFlatFee: 30000 }),
    };
    return new ShippingRatesService(repo as never, config as never);
  };

  it('treats spellings of the same province as one', () => {
    expect(provinceKey('TP. Hồ Chí Minh')).toBe(
      provinceKey('Thành phố Hồ Chí Minh'),
    );
    expect(provinceKey('tỉnh Bình Dương')).toBe(provinceKey('Binh Duong'));
    expect(provinceKey('Đà Nẵng')).toBe('danang');
  });

  it('charges the intra-province base fee up to the base weight', async () => {
    await expect(
      build().quote({
        province: 'TP. Hồ Chí Minh',
        weightGrams: 500,
        subtotal: 100000,
      }),
    ).resolves.toEqual({
      fee: 22000,
      standardFee: 22000,
      zone: ShippingZone.INTRA_PROVINCE,
      weightGrams: 500,
      freeShipping: null,
    });
  });

  it('adds a step fee per started step above the base weight', async () => {
    const quote = await build().quote({
      province: 'Hà Nội',
      weightGrams: 1200,
      subtotal: 1,
    });
    // 32.000 + 2 × 8.000 (700 g over → 2 steps of 500 g)
    expect(quote).toEqual(
      expect.objectContaining({
        fee: 48000,
        zone: ShippingZone.INTER_PROVINCE,
      }),
    );
  });

  it('ships free at or above the threshold', async () => {
    const quote = await build({ threshold: 500000 }).quote({
      province: 'Hà Nội',
      weightGrams: 500,
      subtotal: 500000,
    });
    expect(quote).toEqual(
      expect.objectContaining({
        fee: 0,
        standardFee: 32000,
        freeShipping: 'threshold',
      }),
    );
  });

  it('falls back to the flat fee while no rate table is set up', async () => {
    const quote = await build({ table: false }).quote({
      province: 'Hà Nội',
      weightGrams: 500,
      subtotal: 1,
    });
    expect(quote).toEqual(expect.objectContaining({ fee: 30000, zone: null }));
  });

  it('weighs lines, using the default weight for unknown variants', () => {
    expect(
      build().weightOf([
        { weightGrams: 300, quantity: 2 },
        { weightGrams: null, quantity: 1 },
      ]),
    ).toBe(1100);
  });
});
