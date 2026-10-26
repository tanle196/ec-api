import { registerAs } from '@nestjs/config';
import type { StringValue as MsStringValue } from 'ms';
import { ConfigModules } from '../types/ConfigModules';

type ExpiresValue = number | MsStringValue;

const parseExpires = (value: string): ExpiresValue => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? (value as MsStringValue) : parsed;
};

const jwtConfig = registerAs(ConfigModules.Jwt, () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  accessExpiresIn: parseExpires(process.env.JWT_ACCESS_EXPIRES_IN!),
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  refreshExpiresIn: parseExpires(process.env.JWT_REFRESH_EXPIRES_IN!),
}));

export type JwtConfig = ReturnType<typeof jwtConfig>;

export default jwtConfig;
