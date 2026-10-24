import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { loadEnvironment } from './core/config/environment.js';
import { ApiExceptionFilter } from './core/http/api-exception.filter.js';
import { RequestContextMiddleware } from './core/http/request-context.middleware.js';
import { RequestLoggingMiddleware } from './core/http/request-logging.middleware.js';

async function bootstrap() {
  const environment = loadEnvironment(process.env);
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger:
      environment.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : undefined,
  });

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '1mb' }));
  app.use(new RequestContextMiddleware().use);
  app.use(new RequestLoggingMiddleware().use);
  app.enableCors({ origin: environment.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'internal/admin/v1/{*path}', method: RequestMethod.ALL }],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (environment.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('Pepsa Vendor API')
      .setDescription('Vendor logistics platform contract')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    document.paths = Object.fromEntries(
      Object.entries(document.paths).map(([path, operations]) => [
        path.replace(/^\/api\/internal\/admin\/v1/, '/internal/admin/v1'),
        operations,
      ]),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(environment.PORT, '0.0.0.0');
}
await bootstrap();
