import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  buildSwaggerConfig,
  swaggerUiOptions,
} from './common/swagger/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const whitelist = (process.env.APP_DOMAIN ?? 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim());

  app.enableCors({
    origin: (origin: string, callback) => {
      // cho phép request không có origin (mobile app, postman, curl)
      if (!origin || whitelist.includes(origin)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        callback(null, true);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  const fullDocument = SwaggerModule.createDocument(app, buildSwaggerConfig());

  const splitDocument = (admin: boolean) => ({
    ...fullDocument,
    info: {
      ...fullDocument.info,
      title: admin ? 'EC API — Admin' : 'EC API — Public',
      description: admin
        ? 'Admin management endpoints'
        : 'Public storefront & user-facing endpoints',
    },
    paths: Object.fromEntries(
      Object.entries(fullDocument.paths).filter(([p]) =>
        admin ? p.startsWith('/admin') : !p.startsWith('/admin'),
      ),
    ),
  });

  SwaggerModule.setup('docs', app, splitDocument(false), {
    ...swaggerUiOptions,
    jsonDocumentUrl: 'docs-json',
  });
  SwaggerModule.setup('docs/admin', app, splitDocument(true), {
    ...swaggerUiOptions,
    jsonDocumentUrl: 'docs/admin-json',
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 10000;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  await app.listen(port, '0.0.0.0');

  console.log(`Application is running on port ${port}`);
}
void bootstrap();
