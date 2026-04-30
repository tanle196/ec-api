import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateConfig } from './validation';
import { TypedConfigService } from './TypedConfigService';
import databaseConfig from './environment/database.config';
import googleConfig from './environment/google.config';
import jwtConfig from './environment/jwt.config';
import mailConfig from './environment/mail.config';
import appConfig from './environment/app.config';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
      load: [appConfig, databaseConfig, googleConfig, jwtConfig, mailConfig],
      validate: validateConfig,
      expandVariables: true,
    }),
  ],
  providers: [TypedConfigService],
  exports: [TypedConfigService],
})
export class AppConfigModule {}
