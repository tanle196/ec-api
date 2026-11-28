import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const shippingConfig = registerAs(ConfigModules.Shipping, () => ({
  // Province the warehouse ships from; same province = intra-province rate.
  shopProvince: process.env.SHOP_PROVINCE ?? '',
  defaultItemWeightGrams: Number(process.env.DEFAULT_ITEM_WEIGHT_GRAMS ?? 500),
  // Orders with a subtotal at or above this ship free (0 = off).
  freeShippingThreshold: Number(process.env.FREE_SHIPPING_THRESHOLD ?? 0),

  // GHN (optional; enabled when token and shop id are set)
  ghnToken: process.env.GHN_TOKEN ?? '',
  ghnShopId: process.env.GHN_SHOP_ID ?? '',
  ghnApiUrl:
    process.env.GHN_API_URL ??
    'https://dev-online-gateway.ghn.vn/shiip/public-api',
  // Shared secret GHN must send as ?token= on webhook calls (GHN does not
  // sign webhooks).
  ghnWebhookSecret: process.env.GHN_WEBHOOK_SECRET ?? '',
  ghnServiceTypeId: Number(process.env.GHN_SERVICE_TYPE_ID ?? 2),
  // CHOTHUHANG | CHOXEMHANGKHONGTHU | KHONGCHOXEMHANG
  ghnRequiredNote: process.env.GHN_REQUIRED_NOTE ?? 'CHOXEMHANGKHONGTHU',
}));

export type ShippingConfig = ConfigType<typeof shippingConfig>;
export default shippingConfig;
