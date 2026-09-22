import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@impactra/database';
import { DependencyStatus } from '@impactra/shared';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly prismaClient: PrismaClient;

  constructor() {
    this.prismaClient = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.prismaClient.$connect();
      this.logger.log('PostgreSQL connection established successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to connect to PostgreSQL during startup: ${msg}`);
      // Allow startup to continue so health/readiness endpoints can report failure
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prismaClient.$disconnect();
    this.logger.log('PostgreSQL connection disconnected.');
  }

  get client(): PrismaClient {
    return this.prismaClient;
  }

  async ping(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.prismaClient.$queryRaw`SELECT 1`;
      return {
        status: 'healthy',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database ping failed';
      return {
        status: 'unhealthy',
        error: msg,
      };
    }
  }
}
