import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseConfig } from './environment/database.config';
import { NodeEnv } from './environment';
import { GoogleConfig } from './environment/google.config';
import { JwtConfig } from './environment/jwt.config';
import { MailConfig } from './environment/mail.config';
import { ConfigModules, ConfigModulesType } from './types/ConfigModules';
import { AppConfig } from './environment/app.config';

@Injectable()
export class TypedConfigService {
  constructor(private readonly configService: ConfigService) {}

  getModuleConfig<T>(key: ConfigModulesType): T {
    const config = this.configService.get<T>(key);
    if (!config) {
      throw new Error(`Config module "${key}" is missing`);
    }
    return config;
  }

  getAppConfig(): AppConfig {
    return this.getModuleConfig<AppConfig>(ConfigModules.App);
  }

  getDatabaseConfig(): DatabaseConfig {
    return this.getModuleConfig<DatabaseConfig>(ConfigModules.Database);
  }

  getGoogleConfig(): GoogleConfig {
    return this.getModuleConfig<GoogleConfig>(ConfigModules.Google);
  }

  getJwtConfig(): JwtConfig {
    return this.getModuleConfig<JwtConfig>(ConfigModules.Jwt);
  }

  getMailConfig(): MailConfig {
    return this.getModuleConfig<MailConfig>(ConfigModules.Mail);
  }

  getEnv(): NodeEnv {
    const appConfig = this.getModuleConfig<{
      env: NodeEnv;
    }>(ConfigModules.App);

    if (!appConfig.env) {
      throw new Error('NODE_ENV is not defined in AppConfig');
    }

    return appConfig.env;
  }

  isLocal(): boolean {
    return this.getEnv() === NodeEnv.Local;
  }

  isTest(): boolean {
    return this.getEnv() === NodeEnv.Staging;
  }

  isProduction(): boolean {
    return this.getEnv() === NodeEnv.Production;
  }
}
