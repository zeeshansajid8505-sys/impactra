import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CacheModule } from '../cache/cache.module';
import { GithubModule } from '../github/github.module';
import { GitHubCheckPayloadBuilderService } from './services/github-check-payload-builder.service';
import { GitHubCheckClientService } from './services/github-check-client.service';
import { GitHubCheckPersistenceService } from './services/github-check-persistence.service';
import { GitHubCheckQueueService } from './queue/github-check-queue.service';
import { GitHubCheckPublicationService } from './services/github-check-publication.service';
import { GitHubCheckProcessor } from './github-check.processor';
import { OrganizationGitHubCheckController } from './controllers/organization-github-check.controller';

@Module({
  imports: [
    DatabaseModule,
    OrganizationsModule,
    SessionsModule,
    CacheModule,
    forwardRef(() => GithubModule),
    BullModule.registerQueue({
      name: 'github-check-publication',
    }),
  ],
  controllers: [OrganizationGitHubCheckController],
  providers: [
    GitHubCheckPayloadBuilderService,
    GitHubCheckClientService,
    GitHubCheckPersistenceService,
    GitHubCheckQueueService,
    GitHubCheckPublicationService,
    GitHubCheckProcessor,
  ],
  exports: [
    GitHubCheckPublicationService,
    GitHubCheckQueueService,
    GitHubCheckPersistenceService,
    GitHubCheckPayloadBuilderService,
    GitHubCheckClientService,
  ],
})
export class GitHubChecksModule {}
