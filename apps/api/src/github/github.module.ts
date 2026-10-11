import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
import { SessionsModule } from '../sessions/sessions.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GitHubConfigService } from './config/github-config.service';
import { GitHubClientService } from './services/github-client.service';
import { GitHubInstallationStateService } from './services/github-installation-state.service';
import { GitHubInstallationService } from './services/github-installation.service';
import { GitHubRepositoryService } from './services/github-repository.service';
import { GitHubWebhookService } from './services/github-webhook.service';
import { GitHubController } from './controllers/github.controller';
import { OrganizationGitHubController } from './controllers/organization-github.controller';
import { OrganizationRepositoryController } from './controllers/organization-repository.controller';

@Module({
  imports: [DatabaseModule, CacheModule, SessionsModule, OrganizationsModule],
  controllers: [
    GitHubController,
    OrganizationGitHubController,
    OrganizationRepositoryController,
  ],
  providers: [
    GitHubConfigService,
    GitHubClientService,
    GitHubInstallationStateService,
    GitHubInstallationService,
    GitHubRepositoryService,
    GitHubWebhookService,
  ],
  exports: [
    GitHubConfigService,
    GitHubInstallationService,
    GitHubRepositoryService,
    GitHubWebhookService,
  ],
})
export class GithubModule {}
