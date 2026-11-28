import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const appConfig = registerAs(ConfigModules.App, () => ({
  appDomain: process.env.APP_DOMAIN,
  env: process.env.NODE_ENV,
  shippingFlatFee: Number(process.env.SHIPPING_FLAT_FEE ?? 0),
  // Unpaid online orders are cancelled (and their stock released) after
  // this many minutes. 0 turns expiry off.
  pendingOrderTtlMinutes: Number(process.env.PENDING_ORDER_TTL_MINUTES ?? 30),
  codMaxOrderTotal: Number(process.env.COD_MAX_ORDER_TOTAL ?? 0),
}));

export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
