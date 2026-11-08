import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ReleaseSafetyModule } from '../release-safety/release-safety.module';
import { ReleasePolicyPersistenceService } from './services/release-policy-persistence.service';
import { ReleasePolicyEvaluatorService } from './services/release-policy-evaluator.service';
import { ReleasePolicyResolverService } from './services/release-policy-resolver.service';
import { ReleasePolicyService } from './services/release-policy.service';
import { OrganizationReleasePolicyController } from './controllers/organization-release-policy.controller';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => ReleaseSafetyModule),
  ],
  controllers: [OrganizationReleasePolicyController],
  providers: [
    ReleasePolicyPersistenceService,
    ReleasePolicyEvaluatorService,
    ReleasePolicyResolverService,
    ReleasePolicyService,
  ],
  exports: [
    ReleasePolicyPersistenceService,
    ReleasePolicyEvaluatorService,
    ReleasePolicyResolverService,
    ReleasePolicyService,
  ],
})
export class ReleasePolicyModule {}
