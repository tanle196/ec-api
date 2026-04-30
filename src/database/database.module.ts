import { TypedConfigService } from '@/config/TypedConfigService';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [TypedConfigService],
      useFactory: (typedConfigService: TypedConfigService) => {
        const dbConfig = typedConfigService.getDatabaseConfig();
        const isLocal = typedConfigService.isLocal();
        const isProduction = typedConfigService.isProduction();

        return {
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.user,
          password: dbConfig.pass,
          database: dbConfig.name,
          autoLoadEntities: true,
          synchronize: isLocal,
          logging: isProduction,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
