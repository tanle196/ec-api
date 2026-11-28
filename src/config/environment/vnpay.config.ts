import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

// VNPay is optional: the gateway is only offered when TMN code and hash
// secret are set. URLs default to the VNPay sandbox.
const vnpayConfig = registerAs(ConfigModules.Vnpay, () => ({
  tmnCode: process.env.VNPAY_TMN_CODE ?? '',
  hashSecret: process.env.VNPAY_HASH_SECRET ?? '',
  paymentUrl:
    process.env.VNPAY_PAYMENT_URL ??
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  apiUrl:
    process.env.VNPAY_API_URL ??
    'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
  // This API's own public GET /payments/webhooks/vnpay/return URL.
  returnUrl: process.env.VNPAY_RETURN_URL ?? '',
  // Storefront page the customer lands on after the return URL.
  resultUrl: process.env.VNPAY_RESULT_URL ?? '',
}));

export type VnpayConfig = ConfigType<typeof vnpayConfig>;
export default vnpayConfig;
