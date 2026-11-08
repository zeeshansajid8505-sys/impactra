import { Test, TestingModule } from '@nestjs/testing';
import { ReleasePolicyResolverService } from './release-policy-resolver.service';
import { ReleasePolicyPersistenceService } from './release-policy-persistence.service';
import { ReleasePolicyEvaluatorService } from './release-policy-evaluator.service';
import {
  ReleasePolicyScope,
  ReleasePolicyStatus,
  ReleasePolicyAction,
  ReleasePolicyRuleType,
} from '@impactra/database';
import { BUILT_IN_POLICY_NAME } from '../policy/built-in-release-policy';

describe('ReleasePolicyResolverService', () => {
  let resolver: ReleasePolicyResolverService;
  let persistenceService: jest.Mocked<ReleasePolicyPersistenceService>;

  beforeEach(async () => {
    const mockPersistence = {
      getActivePolicies: jest.fn(),
      mapPolicyToDto: jest.fn((p) => ({
        id: p.id,
        organizationId: p.organizationId,
        repositoryConnectionId: p.repositoryConnectionId,
        originPolicyId: p.originPolicyId,
        name: p.name,
        description: p.description,
        status: p.status,
        version: p.version,
        isDefault: p.isDefault,
        targetBranchPattern: p.targetBranchPattern,
        createdByUserId: p.createdByUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
        supersededAt: null,
        archivedAt: null,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReleasePolicyResolverService,
        ReleasePolicyEvaluatorService,
        {
          provide: ReleasePolicyPersistenceService,
          useValue: mockPersistence,
        },
      ],
    }).compile();

    resolver = module.get<ReleasePolicyResolverService>(ReleasePolicyResolverService);
    persistenceService = module.get(ReleasePolicyPersistenceService);
  });

  it('1. falls back to built-in Impactra default when no active policies exist', async () => {
    persistenceService.getActivePolicies.mockResolvedValue([]);

    const result = await resolver.resolveEffectivePolicy('org-1', 'repo-1', 'main');

    expect(result.dto.policyId).toBeNull();
    expect(result.dto.policyName).toBe(BUILT_IN_POLICY_NAME);
    expect(result.dto.scope).toBe(ReleasePolicyScope.BUILT_IN_DEFAULT);
    expect(result.dto.fallbackUsed).toBe(true);
    expect(result.policy).toBeNull();
    expect(result.rules.length).toBeGreaterThan(0);
  });

  it('2. selects repository branch override over all other policies', async () => {
    const repoBranchPolicy: any = {
      id: 'pol-repo-branch',
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      name: 'Repo Release Branch Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 2,
      isDefault: false,
      targetBranchPattern: 'release/*',
      rules: [
        {
          id: 'r1',
          ruleKey: 'repo_branch_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.BLOCK,
          thresholdNumeric: 60,
          order: 0,
        },
      ],
    };

    const repoDefaultPolicy: any = {
      id: 'pol-repo-default',
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      name: 'Repo Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    const orgDefaultPolicy: any = {
      id: 'pol-org-default',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    persistenceService.getActivePolicies.mockResolvedValue([
      repoBranchPolicy,
      repoDefaultPolicy,
      orgDefaultPolicy,
    ]);

    const result = await resolver.resolveEffectivePolicy('org-1', 'repo-1', 'release/2026-10');

    expect(result.dto.policyId).toBe('pol-repo-branch');
    expect(result.dto.scope).toBe(ReleasePolicyScope.REPOSITORY_BRANCH);
    expect(result.dto.fallbackUsed).toBe(false);
  });

  it('3. selects repository default policy when branch does not match repo branch policy', async () => {
    const repoBranchPolicy: any = {
      id: 'pol-repo-branch',
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      name: 'Repo Hotfix Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: false,
      targetBranchPattern: 'hotfix/*',
      rules: [],
    };

    const repoDefaultPolicy: any = {
      id: 'pol-repo-default',
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      name: 'Repo Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    const orgDefaultPolicy: any = {
      id: 'pol-org-default',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    persistenceService.getActivePolicies.mockResolvedValue([
      repoBranchPolicy,
      repoDefaultPolicy,
      orgDefaultPolicy,
    ]);

    const result = await resolver.resolveEffectivePolicy('org-1', 'repo-1', 'main');

    expect(result.dto.policyId).toBe('pol-repo-default');
    expect(result.dto.scope).toBe(ReleasePolicyScope.REPOSITORY_DEFAULT);
    expect(result.dto.fallbackUsed).toBe(false);
  });

  it('4. selects organization branch override when no repository policy matches', async () => {
    const orgBranchPolicy: any = {
      id: 'pol-org-branch',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Production Branch Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: false,
      targetBranchPattern: 'main',
      rules: [],
    };

    const orgDefaultPolicy: any = {
      id: 'pol-org-default',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    persistenceService.getActivePolicies.mockResolvedValue([
      orgBranchPolicy,
      orgDefaultPolicy,
    ]);

    const result = await resolver.resolveEffectivePolicy('org-1', 'repo-1', 'main');

    expect(result.dto.policyId).toBe('pol-org-branch');
    expect(result.dto.scope).toBe(ReleasePolicyScope.ORGANIZATION_BRANCH);
    expect(result.dto.fallbackUsed).toBe(false);
  });

  it('5. selects organization default policy when branch does not match org branch policy', async () => {
    const orgBranchPolicy: any = {
      id: 'pol-org-branch',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Hotfix Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: false,
      targetBranchPattern: 'hotfix/*',
      rules: [],
    };

    const orgDefaultPolicy: any = {
      id: 'pol-org-default',
      organizationId: 'org-1',
      repositoryConnectionId: null,
      name: 'Org Default Policy',
      status: ReleasePolicyStatus.ACTIVE,
      version: 1,
      isDefault: true,
      targetBranchPattern: null,
      rules: [],
    };

    persistenceService.getActivePolicies.mockResolvedValue([
      orgBranchPolicy,
      orgDefaultPolicy,
    ]);

    const result = await resolver.resolveEffectivePolicy('org-1', 'repo-1', 'feature/login');

    expect(result.dto.policyId).toBe('pol-org-default');
    expect(result.dto.scope).toBe(ReleasePolicyScope.ORGANIZATION_DEFAULT);
    expect(result.dto.fallbackUsed).toBe(false);
  });
});
