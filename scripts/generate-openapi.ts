import { writeFileSync, mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';

process.env.DATABASE_URL ??=
  'postgresql://postgres:postgres@localhost:5432/pepsa_vendor';
process.env.AUTH_ISSUER ??= 'pepsa-vendor';
process.env.AUTH_AUDIENCE ??= 'pepsa-vendor-api';
const app = await NestFactory.create(AppModule, {
  logger: false,
  preview: true,
});
app.setGlobalPrefix('api', {
  exclude: [{ path: 'internal/admin/v1/{*path}', method: RequestMethod.ALL }],
});
app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
const config = new DocumentBuilder()
  .setTitle('Pepsa Vendor API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
mkdirSync('openapi', { recursive: true });
const document = SwaggerModule.createDocument(app, config);
document.paths = Object.fromEntries(
  Object.entries(document.paths).map(([path, operations]) => [
    path.replace(/^\/api\/internal\/admin\/v1/, '/internal/admin/v1'),
    operations,
  ]),
);
writeFileSync('openapi/openapi.json', JSON.stringify(document, null, 2) + '\n');
await app.close();
