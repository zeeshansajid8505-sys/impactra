import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GitHubChecksModule } from '../github-checks/github-checks.module';
import { ReleaseAuthorizationService } from './services/release-authorization.service';
import { ReleaseApprovalPersistenceService } from './services/release-approval-persistence.service';
import { ReleaseApprovalService } from './services/release-approval.service';
import { OrganizationReleaseApprovalController } from './controllers/organization-release-approval.controller';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    forwardRef(() => GitHubChecksModule),
  ],
  controllers: [OrganizationReleaseApprovalController],
  providers: [
    ReleaseAuthorizationService,
    ReleaseApprovalPersistenceService,
    ReleaseApprovalService,
  ],
  exports: [
    ReleaseAuthorizationService,
    ReleaseApprovalPersistenceService,
    ReleaseApprovalService,
  ],
})
export class ReleaseApprovalModule {}
