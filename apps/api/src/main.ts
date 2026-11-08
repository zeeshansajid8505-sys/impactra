import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { json, urlencoded, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppValidationPipe } from './common/pipes/validation.pipe';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

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
      hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // 2. Cookie parser middleware for session authentication
  app.use(cookieParser());

  // 3. Request body size limits:
  // Scope raw body capture and larger limit (5MB) specifically to GitHub webhooks for HMAC signature verification.
  // Standard API endpoints use a conservative 1MB limit without raw body caching to minimize memory footprint and prevent DoS.
  app.use(
    '/github/webhooks',
    json({
      limit: '5mb',
      verify: (req: RawBodyRequest, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // 4. Strict CORS configuration with credentials and tenant headers
  const rawCorsOrigin =
    process.env.CORS_ORIGIN ||
    'http://localhost:3000,http://impactra.local';
  const allowedOrigins = rawCorsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.WEB_URL) {
    try {
      const parsedOrigin = new URL(process.env.WEB_URL).origin;
      if (!allowedOrigins.includes(parsedOrigin)) {
        allowedOrigins.push(parsedOrigin);
      }
    } catch {}
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow server-to-server, curl, container healthchecks with no origin
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-organization-id'],
    credentials: true,
  });

  // 5. Global error handling and validation
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new AppValidationPipe());

  // 6. Graceful shutdown hooks
  app.enableShutdownHooks();

  // 7. OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Impactra API')
    .setDescription(
      'Impactra — AI-Powered Software Change Intelligence & Release Safety Platform API foundation.',
    )
    .setVersion('1.0.0')
    .addTag('Health & Readiness', 'Liveness and readiness dependency verification probes')
    .addTag('Authentication & Sessions', 'User registration, login, logout, and session lifecycle')
    .addTag('Organizations & Multi-Tenancy', 'Multi-tenant organization boundary and isolation')
    .addTag('Organization Memberships & RBAC', 'Role-based access control, invitations, and member governance')
    .addTag('GitHub Integration', 'GitHub App integration, installation lifecycle, and webhooks')
    .addTag('Repository Connections', 'Repository metadata synchronization and onboarding')
    .addCookieAuth('impactra_session', {
      type: 'apiKey',
      in: 'cookie',
      name: 'impactra_session',
      description: 'HttpOnly session token cookie',
    })
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customSiteTitle: 'Impactra API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // 8. Start listener
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Impactra API is running on: http://localhost:${port}`);
  logger.log(`📚 OpenAPI / Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`🩺 Health probe: http://localhost:${port}/health`);
  logger.log(`🩺 Readiness probe: http://localhost:${port}/ready`);
}

bootstrap();
