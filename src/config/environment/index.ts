// @/config/environment.ts
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MinLength,
  Min,
} from 'class-validator';

export enum NodeEnv {
  Local = 'local',
  Staging = 'staging',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Local;

  //APP
  @IsString()
  @IsNotEmpty()
  APP_DOMAIN!: string;

  // Database
  @IsInt()
  @Min(1)
  PORT: number = 5432;

  @IsString()
  DB_HOST!: string;

  @IsInt()
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  // JWT
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN!: string;

  //GOOGLE
  @IsString()
  GOOGLE_CLIENT_ID!: string;

  @IsString()
  GOOGLE_CLIENT_SECRET!: string;

  @IsString()
  GOOGLE_CALLBACK_URL!: string;

  @IsEmail()
  MAIL_USER!: string;

  @IsString()
  MAIL_PASS!: string;

  @IsInt()
  MAIL_PORT!: number;
}
