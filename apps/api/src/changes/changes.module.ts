import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { GithubModule } from '../github/github.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { BlastRadiusModule } from '../blast-radius/blast-radius.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CacheModule } from '../cache/cache.module';
import { ChangeQueueService } from './queue/change-queue.service';
import { GithubPullRequestService } from './services/github-pull-request.service';
import { ChangedFileService } from './services/changed-file.service';
import { SnapshotAlignmentService } from './services/snapshot-alignment.service';
import { TwinChangeMapperService } from './services/twin-change-mapper.service';
import { DependencyDeltaService } from './services/dependency-delta.service';
import { ChangeOrchestratorService } from './services/change-orchestrator.service';
import { ChangesProcessor } from './changes.processor';
import { OrganizationChangesController } from './controllers/organization-changes.controller';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => GithubModule),
    IngestionModule,
    OrganizationsModule,
    SessionsModule,
    CacheModule,
    forwardRef(() => BlastRadiusModule),
    BullModule.registerQueue({
      name: 'change-ingestion',
    }),
  ],
  controllers: [OrganizationChangesController],
  providers: [
    ChangeQueueService,
    GithubPullRequestService,
    ChangedFileService,
    SnapshotAlignmentService,
    TwinChangeMapperService,
    DependencyDeltaService,
    ChangeOrchestratorService,
    ChangesProcessor,
  ],
  exports: [
    ChangeOrchestratorService,
    ChangeQueueService,
    GithubPullRequestService,
  ],
})
export class ChangesModule {}
