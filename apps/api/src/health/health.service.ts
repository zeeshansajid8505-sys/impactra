import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CacheService } from '../cache/cache.service';
import { StorageService } from '../storage/storage.service';
import { HealthResponse, ReadinessResponse } from '@impactra/shared';

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly storageService: StorageService,
  ) {}

  getLiveness(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime() * 100) / 100,
      service: 'impactra-api',
      version: '1.0.0',
    };
  }

  async getReadiness(): Promise<{ isReady: boolean; payload: ReadinessResponse }> {
    const [postgres, redis, minio] = await Promise.all([
      this.databaseService.ping(),
      this.cacheService.ping(),
      this.storageService.ping(),
    ]);

    const isReady =
      postgres.status === 'healthy' &&
      redis.status === 'healthy' &&
      minio.status === 'healthy';

    const payload: ReadinessResponse = {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      service: 'impactra-api',
      dependencies: {
        postgres,
        redis,
        minio,
      },
    };

    return { isReady, payload };
  }
}
