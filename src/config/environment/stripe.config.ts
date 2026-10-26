import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const stripeConfig = registerAs(ConfigModules.Stripe, () => ({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  currency: process.env.STRIPE_CURRENCY ?? 'vnd',
  checkoutSuccessUrl: process.env.STRIPE_CHECKOUT_SUCCESS_URL!,
  checkoutCancelUrl: process.env.STRIPE_CHECKOUT_CANCEL_URL!,
}));

export type StripeConfig = ConfigType<typeof stripeConfig>;
export default stripeConfig;
