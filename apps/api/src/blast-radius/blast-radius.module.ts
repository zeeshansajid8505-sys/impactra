import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CacheModule } from '../cache/cache.module';
import { BlastRadiusEdgePolicy } from './services/blast-radius-edge-policy';
import { BlastRadiusTraversalService } from './services/blast-radius-traversal.service';
import { BlastRadiusPersistenceService } from './services/blast-radius-persistence.service';
import { BlastRadiusQueueService } from './queue/blast-radius-queue.service';
import { BlastRadiusAnalysisService } from './services/blast-radius-analysis.service';
import { BlastRadiusProcessor } from './blast-radius.processor';
import { OrganizationBlastRadiusController } from './controllers/organization-blast-radius.controller';

import { forwardRef } from '@nestjs/common';
import { ReleaseSafetyModule } from '../release-safety/release-safety.module';

@Module({
  imports: [
    DatabaseModule,
    OrganizationsModule,
    SessionsModule,
    CacheModule,
    forwardRef(() => ReleaseSafetyModule),
    BullModule.registerQueue({
      name: 'blast-radius-analysis',
    }),
  ],
  controllers: [OrganizationBlastRadiusController],
  providers: [
    BlastRadiusEdgePolicy,
    BlastRadiusTraversalService,
    BlastRadiusPersistenceService,
    BlastRadiusQueueService,
    BlastRadiusAnalysisService,
    BlastRadiusProcessor,
  ],
  exports: [
    BlastRadiusAnalysisService,
    BlastRadiusQueueService,
    BlastRadiusEdgePolicy,
    BlastRadiusTraversalService,
  ],
})
export class BlastRadiusModule {}
