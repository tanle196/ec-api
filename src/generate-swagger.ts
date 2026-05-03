/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Thêm dòng này ở đầu file, TRƯỚC tất cả imports khác
import 'tsconfig-paths/register';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateSwagger() {
  try {
    console.log('🔧 Starting Swagger generation...');

    console.log('1️⃣ Creating NestJS app...');
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    console.log('✅ App created');

    console.log('2️⃣ Building Swagger config...');
    const config = new DocumentBuilder()
      .setTitle('My API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'JWT-auth',
      )
      .build();
    console.log('✅ Config built');

    console.log('3️⃣ Creating Swagger document...');
    const document = SwaggerModule.createDocument(app, config);
    console.log('✅ Document created');

    if (!document || !document.paths) {
      throw new Error('Document is invalid or has no paths');
    }

    console.log('4️⃣ Writing to file...');
    const outputPath = path.resolve(process.cwd(), 'swagger-spec.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');
    console.log('✅ File written');

    console.log('\n📊 Summary:');
    console.log(`   Paths: ${Object.keys(document.paths).length}`);
    console.log(
      `   Schemas: ${Object.keys(document.components?.schemas || {}).length}`,
    );
    console.log(`   Output: ${outputPath}`);

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR DETAILS:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

generateSwagger();
