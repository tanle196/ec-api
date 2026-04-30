import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const databaseConfig = registerAs(ConfigModules.Database, () => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME,
  pass: process.env.DB_PASSWORD,
  name: process.env.DB_NAME,
}));

export type DatabaseConfig = ConfigType<typeof databaseConfig>;
export default databaseConfig;
