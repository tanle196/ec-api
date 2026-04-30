import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const appConfig = registerAs(ConfigModules.App, () => ({
  appDomain: process.env.APP_DOMAIN,
  env: process.env.NODE_ENV,
}));

export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
