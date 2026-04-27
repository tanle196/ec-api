import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
         port: parseInt(process.env.DB_PORT ?? '5432', 10),
         username: process.env.DB_USERNAME ?? 'postgres',
         password: process.env.DB_PASSWORD ?? 'postgres',
         database: process.env.DB_NAME ?? 'ec_db',
    }),
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
