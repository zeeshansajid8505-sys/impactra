import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CacheModule } from '../cache/cache.module';
import { GitHubChecksModule } from '../github-checks/github-checks.module';
import { ReleaseSafetyRuleEngineService } from './services/release-safety-rule-engine.service';
import { ReleaseSafetyScoringService } from './services/release-safety-scoring.service';
import { ReleaseSafetyPersistenceService } from './services/release-safety-persistence.service';
import { ReleaseSafetyQueueService } from './queue/release-safety-queue.service';
import { ReleaseSafetyAnalysisService } from './services/release-safety-analysis.service';
import { ReleaseSafetyProcessor } from './release-safety.processor';
import { OrganizationReleaseSafetyController } from './controllers/organization-release-safety.controller';

@Module({
  imports: [
    DatabaseModule,
    OrganizationsModule,
    SessionsModule,
    CacheModule,
    BullModule.registerQueue({
      name: 'release-safety-analysis',
    }),
    forwardRef(() => GitHubChecksModule),
  ],
  controllers: [OrganizationReleaseSafetyController],
  providers: [
    ReleaseSafetyRuleEngineService,
    ReleaseSafetyScoringService,
    ReleaseSafetyPersistenceService,
    ReleaseSafetyQueueService,
    ReleaseSafetyAnalysisService,
    ReleaseSafetyProcessor,
  ],
  exports: [
    ReleaseSafetyAnalysisService,
    ReleaseSafetyQueueService,
    ReleaseSafetyRuleEngineService,
    ReleaseSafetyScoringService,
    ReleaseSafetyPersistenceService,
  ],
})
export class ReleaseSafetyModule {}
