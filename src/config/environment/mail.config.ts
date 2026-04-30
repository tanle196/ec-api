import { ConfigType, registerAs } from '@nestjs/config';
import { ConfigModules } from '../types/ConfigModules';

const mailConfig = registerAs(ConfigModules.Mail, () => ({
  user: process.env.MAIL_USER,
  pass: process.env.MAIL_PASS,
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT ?? '587', 10),
  from: process.env.MAIL_FROM,
  secure: process.env.MAIL_SECURE === 'true',
}));

export type MailConfig = ConfigType<typeof mailConfig>;
export default mailConfig;
