import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { HealthModule } from '../src/health/health.module';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;
import { DatabaseService } from '../src/database/database.service';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('Health & Readiness Endpoints (E2E)', () => {
  let app: INestApplication;
  let mockDatabaseService: { ping: jest.Mock };
  let mockCacheService: { ping: jest.Mock };
  let mockStorageService: { ping: jest.Mock };

  beforeAll(async () => {
    mockDatabaseService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 2 }),
    };
    mockCacheService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
    };
    mockStorageService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 3 }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(CacheService)
      .useValue(mockCacheService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with liveness metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'impactra-api',
      version: '0.1.0',
    });
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.timestamp).toBeDefined();
  });

  it('GET /ready returns 200 when all dependencies are healthy', async () => {
    mockDatabaseService.ping.mockResolvedValue({ status: 'healthy', latencyMs: 2 });
    mockCacheService.ping.mockResolvedValue({ status: 'healthy', latencyMs: 1 });
    mockStorageService.ping.mockResolvedValue({ status: 'healthy', latencyMs: 3 });

    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ready',
      service: 'impactra-api',
      dependencies: {
        postgres: { status: 'healthy' },
        redis: { status: 'healthy' },
        minio: { status: 'healthy' },
      },
    });
  });

  it('GET /ready returns 503 when any dependency is unhealthy', async () => {
    mockDatabaseService.ping.mockResolvedValue({
      status: 'unhealthy',
      error: 'Postgres connection failed',
    });

    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(503);

    expect(response.body).toMatchObject({
      status: 'not_ready',
      service: 'impactra-api',
      dependencies: {
        postgres: {
          status: 'unhealthy',
          error: 'Postgres connection failed',
        },
      },
    });
  });
});
