import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DependencyStatus } from '@impactra/shared';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const redisUrl =
      this.configService.get<string>('app.redisUrl') ||
      process.env.REDIS_URL ||
      'redis://localhost:6379';

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 4000,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 500, 2000);
        },
      });

      this.client.on('error', (err) => {
        this.logger.warn(`Redis client error: ${err.message}`);
      });

      this.client
        .connect()
        .then(() => {
          this.logger.log('Redis connection established successfully.');
        })
        .catch((err) => {
          this.logger.warn(
            `Initial Redis connection deferred or failed: ${err.message}`,
          );
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Redis client: ${msg}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis connection closed gracefully.');
      } catch {
        this.client.disconnect();
      }
    }
  }

  get redisClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<DependencyStatus> {
    if (!this.client) {
      return { status: 'unhealthy', error: 'Redis client not initialized' };
    }

    const start = Date.now();
    try {
      const result = await this.client.ping();
      if (result === 'PONG') {
        return {
          status: 'healthy',
          latencyMs: Date.now() - start,
        };
      }
      return {
        status: 'unhealthy',
        error: `Unexpected ping response: ${result}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Redis ping failed';
      return {
        status: 'unhealthy',
        error: msg,
      };
    }
  }
}
