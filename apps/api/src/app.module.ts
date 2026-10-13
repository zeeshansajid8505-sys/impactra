import {
  Module,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MembershipsModule } from './memberships/memberships.module';
import { GithubModule } from './github/github.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChangesModule } from './changes/changes.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CacheModule,
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('app.redisUrl') ||
          process.env.REDIS_URL ||
          'redis://localhost:6379';
        try {
          const parsed = new URL(redisUrl);
          return {
            connection: {
              host: parsed.hostname || 'localhost',
              port: parseInt(parsed.port || '6379', 10),
              password: parsed.password || undefined,
              maxRetriesPerRequest: null,
            },
          };
        } catch {
          return {
            connection: {
              host: 'localhost',
              port: 6379,
              maxRetriesPerRequest: null,
            },
          };
        }
      },
      inject: [ConfigService],
    }),
    StorageModule,
    HealthModule,
    AuthorizationModule,
    SessionsModule,
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    GithubModule,
    IngestionModule,
    ChangesModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}
