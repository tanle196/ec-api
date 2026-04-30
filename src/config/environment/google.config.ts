import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const googleConfig = registerAs(ConfigModules.Google, () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID!,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL!,
}));

export type GoogleConfig = ConfigType<typeof googleConfig>;
export default googleConfig;
