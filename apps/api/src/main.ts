import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // 1. Basic security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. Request body size limits
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // 3. Strict CORS configuration
  const rawCorsOrigin =
    process.env.CORS_ORIGIN ||
    'http://localhost:3000,http://impactra.local';
  const allowedOrigins = rawCorsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    credentials: true,
  });

  // 4. Global error handling and validation
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new AppValidationPipe());

  // 5. Graceful shutdown hooks
  app.enableShutdownHooks();

  // 6. OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Impactra API')
    .setDescription(
      'Impactra — AI-Powered Software Change Intelligence & Release Safety Platform API foundation.',
    )
    .setVersion('0.1.0')
    .addTag('Health & Readiness', 'Liveness and readiness dependency verification probes')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customSiteTitle: 'Impactra API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // 7. Start listener
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Impactra API is running on: http://localhost:${port}`);
  logger.log(`📚 OpenAPI / Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`🩺 Health probe: http://localhost:${port}/health`);
  logger.log(`🩺 Readiness probe: http://localhost:${port}/ready`);
}

bootstrap();
