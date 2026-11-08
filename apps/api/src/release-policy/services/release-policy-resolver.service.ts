import { Injectable, Logger } from '@nestjs/common';
import {
  ReleasePolicyScope,
  ReleasePolicyStatus,
} from '@impactra/database';
import {
  EffectiveReleasePolicyDto,
  ReleasePolicyDto,
} from '@impactra/shared';
import { ReleasePolicyPersistenceService } from './release-policy-persistence.service';
import {
  BUILT_IN_POLICY_NAME,
  BUILT_IN_POLICY_VERSION,
  BUILT_IN_POLICY_RULES,
  POLICY_ENGINE_VERSION,
} from '../policy/built-in-release-policy';
import { ReleasePolicyEvaluatorService, RuleEvaluationInput } from './release-policy-evaluator.service';

export interface ResolvedPolicyResult {
  dto: EffectiveReleasePolicyDto;
  policy: ReleasePolicyDto | null;
  rules: RuleEvaluationInput[];
}

@Injectable()
export class ReleasePolicyResolverService {
  private readonly logger = new Logger(ReleasePolicyResolverService.name);

  constructor(
    private readonly persistenceService: ReleasePolicyPersistenceService,
    private readonly evaluatorService: ReleasePolicyEvaluatorService,
  ) {}

  /**
   * Deterministically resolves the effective policy governing a release
   * according to canonical precedence:
   * 1. REPOSITORY_BRANCH
   * 2. REPOSITORY_DEFAULT
   * 3. ORGANIZATION_BRANCH
   * 4. ORGANIZATION_DEFAULT
   * 5. BUILT_IN_DEFAULT
   */
  async resolveEffectivePolicy(
    organizationId: string,
    repositoryConnectionId?: string | null,
    branch?: string | null,
  ): Promise<ResolvedPolicyResult> {
    const cleanBranch = branch ? branch.trim().replace(/^refs\/heads\//, '') : '';

    // Fetch all ACTIVE policies in this organization and repository
    const activePolicies = await this.persistenceService.getActivePolicies(
      organizationId,
      repositoryConnectionId ?? undefined,
    );

    // 1. Check for Repository + Branch pattern match
    if (repositoryConnectionId && cleanBranch) {
      const repoBranchPolicies = activePolicies.filter(
        (p) =>
          p.repositoryConnectionId === repositoryConnectionId &&
          p.targetBranchPattern &&
          this.evaluatorService.matchGlobPattern(p.targetBranchPattern, cleanBranch),
      );

      if (repoBranchPolicies.length > 0) {
        // Sort: exact match over wildcard, then highest version
        const selected = repoBranchPolicies.sort((a, b) => {
          const aExact = a.targetBranchPattern === cleanBranch ? 1 : 0;
          const bExact = b.targetBranchPattern === cleanBranch ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return b.version - a.version;
        })[0];

        const mapped = this.persistenceService.mapPolicyToDto(selected);
        return {
          dto: {
            policyId: selected.id,
            policyName: selected.name,
            policyVersion: selected.version,
            scope: ReleasePolicyScope.REPOSITORY_BRANCH,
            repositoryConnectionId: selected.repositoryConnectionId,
            targetBranchPattern: selected.targetBranchPattern,
            selectionReason: `Matched repository branch pattern '${selected.targetBranchPattern}' for branch '${cleanBranch}'.`,
            fallbackUsed: false,
            source: 'REPOSITORY_POLICY_BRANCH_OVERRIDE',
            policy: mapped,
          },
          policy: mapped,
          rules: selected.rules.map((r) => ({
            id: r.id,
            ruleKey: r.ruleKey,
            ruleType: r.ruleType,
            enabled: r.enabled,
            severity: r.severity,
            action: r.action,
            thresholdNumeric: r.thresholdNumeric,
            thresholdText: r.thresholdText,
            configuration: (r.configuration as Record<string, unknown>) ?? {},
            order: r.order,
          })),
        };
      }
    }

    // 2. Check for Repository Default policy
    if (repositoryConnectionId) {
      const repoDefaultPolicies = activePolicies.filter(
        (p) =>
          p.repositoryConnectionId === repositoryConnectionId &&
          p.isDefault === true,
      );

      if (repoDefaultPolicies.length > 0) {
        const selected = repoDefaultPolicies.sort((a, b) => b.version - a.version)[0];
        const mapped = this.persistenceService.mapPolicyToDto(selected);
        return {
          dto: {
            policyId: selected.id,
            policyName: selected.name,
            policyVersion: selected.version,
            scope: ReleasePolicyScope.REPOSITORY_DEFAULT,
            repositoryConnectionId: selected.repositoryConnectionId,
            targetBranchPattern: selected.targetBranchPattern,
            selectionReason: `Selected active repository default policy '${selected.name}'.`,
            fallbackUsed: false,
            source: 'REPOSITORY_DEFAULT_POLICY',
            policy: mapped,
          },
          policy: mapped,
          rules: selected.rules.map((r) => ({
            id: r.id,
            ruleKey: r.ruleKey,
            ruleType: r.ruleType,
            enabled: r.enabled,
            severity: r.severity,
            action: r.action,
            thresholdNumeric: r.thresholdNumeric,
            thresholdText: r.thresholdText,
            configuration: (r.configuration as Record<string, unknown>) ?? {},
            order: r.order,
          })),
        };
      }
    }

    // 3. Check for Organization + Branch pattern match
    if (cleanBranch) {
      const orgBranchPolicies = activePolicies.filter(
        (p) =>
          !p.repositoryConnectionId &&
          p.targetBranchPattern &&
          this.evaluatorService.matchGlobPattern(p.targetBranchPattern, cleanBranch),
      );

      if (orgBranchPolicies.length > 0) {
        const selected = orgBranchPolicies.sort((a, b) => {
          const aExact = a.targetBranchPattern === cleanBranch ? 1 : 0;
          const bExact = b.targetBranchPattern === cleanBranch ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return b.version - a.version;
        })[0];

        const mapped = this.persistenceService.mapPolicyToDto(selected);
        return {
          dto: {
            policyId: selected.id,
            policyName: selected.name,
            policyVersion: selected.version,
            scope: ReleasePolicyScope.ORGANIZATION_BRANCH,
            repositoryConnectionId: null,
            targetBranchPattern: selected.targetBranchPattern,
            selectionReason: `Matched organization branch pattern '${selected.targetBranchPattern}' for branch '${cleanBranch}'.`,
            fallbackUsed: false,
            source: 'ORGANIZATION_POLICY_BRANCH_OVERRIDE',
            policy: mapped,
          },
          policy: mapped,
          rules: selected.rules.map((r) => ({
            id: r.id,
            ruleKey: r.ruleKey,
            ruleType: r.ruleType,
            enabled: r.enabled,
            severity: r.severity,
            action: r.action,
            thresholdNumeric: r.thresholdNumeric,
            thresholdText: r.thresholdText,
            configuration: (r.configuration as Record<string, unknown>) ?? {},
            order: r.order,
          })),
        };
      }
    }

    // 4. Check for Organization Default policy
    const orgDefaultPolicies = activePolicies.filter(
      (p) => !p.repositoryConnectionId && p.isDefault === true,
    );

    if (orgDefaultPolicies.length > 0) {
      const selected = orgDefaultPolicies.sort((a, b) => b.version - a.version)[0];
      const mapped = this.persistenceService.mapPolicyToDto(selected);
      return {
        dto: {
          policyId: selected.id,
          policyName: selected.name,
          policyVersion: selected.version,
          scope: ReleasePolicyScope.ORGANIZATION_DEFAULT,
          repositoryConnectionId: null,
          targetBranchPattern: selected.targetBranchPattern,
          selectionReason: `Selected active organization default policy '${selected.name}'.`,
          fallbackUsed: false,
          source: 'ORGANIZATION_DEFAULT_POLICY',
          policy: mapped,
        },
        policy: mapped,
        rules: selected.rules.map((r) => ({
          id: r.id,
          ruleKey: r.ruleKey,
          ruleType: r.ruleType,
          enabled: r.enabled,
          severity: r.severity,
          action: r.action,
          thresholdNumeric: r.thresholdNumeric,
          thresholdText: r.thresholdText,
          configuration: (r.configuration as Record<string, unknown>) ?? {},
          order: r.order,
        })),
      };
    }

    // 5. Built-in Impactra Default Fallback
    return {
      dto: {
        policyId: null,
        policyName: BUILT_IN_POLICY_NAME,
        policyVersion: BUILT_IN_POLICY_VERSION,
        scope: ReleasePolicyScope.BUILT_IN_DEFAULT,
        repositoryConnectionId: null,
        targetBranchPattern: null,
        selectionReason: 'No matching repository or organization policy found; using Impactra built-in default release policy.',
        fallbackUsed: true,
        source: 'BUILT_IN_DEFAULT_FALLBACK',
        policy: null,
      },
      policy: null,
      rules: BUILT_IN_POLICY_RULES.map((r) => ({
        ruleKey: r.ruleKey,
        ruleType: r.ruleType,
        enabled: r.enabled,
        severity: r.severity ?? null,
        action: r.action,
        thresholdNumeric: r.thresholdNumeric ?? null,
        thresholdText: r.thresholdText ?? null,
        configuration: r.configuration ?? {},
        order: r.order,
      })),
    };
  }
}
