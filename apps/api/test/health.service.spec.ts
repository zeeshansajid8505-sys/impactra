import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from '../src/health/health.service';
import { DatabaseService } from '../src/database/database.service';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';

describe('HealthService', () => {
  let service: HealthService;
  let databaseService: jest.Mocked<Partial<DatabaseService>>;
  let cacheService: jest.Mocked<Partial<CacheService>>;
  let storageService: jest.Mocked<Partial<StorageService>>;

  beforeEach(async () => {
    databaseService = {
      ping: jest.fn(),
    };
    cacheService = {
      ping: jest.fn(),
    };
    storageService = {
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseService, useValue: databaseService },
        { provide: CacheService, useValue: cacheService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('getLiveness', () => {
    it('should return ok status with service name and uptime', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('ok');
      expect(result.service).toBe('impactra-api');
      expect(result.version).toBe('0.1.0');
      expect(typeof result.uptime).toBe('number');
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('getReadiness', () => {
    it('should return ready when all dependencies report healthy', async () => {
      (databaseService.ping as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latencyMs: 3,
      });
      (cacheService.ping as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latencyMs: 1,
      });
      (storageService.ping as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latencyMs: 4,
      });

      const { isReady, payload } = await service.getReadiness();

      expect(isReady).toBe(true);
      expect(payload.status).toBe('ready');
      expect(payload.dependencies.postgres.status).toBe('healthy');
      expect(payload.dependencies.redis.status).toBe('healthy');
      expect(payload.dependencies.minio.status).toBe('healthy');
    });

    it('should return not_ready when any dependency reports unhealthy', async () => {
      (databaseService.ping as jest.Mock).mockResolvedValue({
        status: 'unhealthy',
        error: 'Connection refused',
      });
      (cacheService.ping as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latencyMs: 1,
      });
      (storageService.ping as jest.Mock).mockResolvedValue({
        status: 'healthy',
        latencyMs: 2,
      });

      const { isReady, payload } = await service.getReadiness();

      expect(isReady).toBe(false);
      expect(payload.status).toBe('not_ready');
      expect(payload.dependencies.postgres.status).toBe('unhealthy');
      expect(payload.dependencies.postgres.error).toBe('Connection refused');
    });
  });
});
