import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Prisma,
  ReleasePolicyStatus,
  ReleasePolicyRuleType,
  ReleasePolicyAction,
  ReleasePolicyScope,
  ReleaseRiskLevel,
  ReleaseSafetyDecision,
} from '@impactra/database';
import {
  ReleasePolicyDto,
  ReleasePolicyPreviewDto,
  EffectiveReleasePolicyDto,
  CreateReleasePolicyRequest,
  UpdateReleasePolicyRequest,
  PreviewReleasePolicyRequest,
} from '@impactra/shared';
import { ReleasePolicyPersistenceService } from './release-policy-persistence.service';
import { ReleasePolicyResolverService } from './release-policy-resolver.service';
import {
  ReleasePolicyEvaluatorService,
  EvaluatorContextInput,
  RuleEvaluationInput,
} from './release-policy-evaluator.service';
import { RELEASE_POLICY_ERROR_CODES } from '../dto/release-policy.dto';
import { ReleaseSafetyPersistenceService } from '../../release-safety/services/release-safety-persistence.service';
import { ReleaseSafetyRuleEngineService } from '../../release-safety/services/release-safety-rule-engine.service';
import { ReleaseSafetyScoringService } from '../../release-safety/services/release-safety-scoring.service';
import { POLICY_ENGINE_VERSION } from '../policy/built-in-release-policy';

@Injectable()
export class ReleasePolicyService {
  private readonly logger = new Logger(ReleasePolicyService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly persistenceService: ReleasePolicyPersistenceService,
    private readonly resolverService: ReleasePolicyResolverService,
    private readonly evaluatorService: ReleasePolicyEvaluatorService,
    @Inject(forwardRef(() => ReleaseSafetyPersistenceService))
    private readonly releaseSafetyPersistence: ReleaseSafetyPersistenceService,
    @Inject(forwardRef(() => ReleaseSafetyRuleEngineService))
    private readonly releaseSafetyRuleEngine: ReleaseSafetyRuleEngineService,
    @Inject(forwardRef(() => ReleaseSafetyScoringService))
    private readonly releaseSafetyScoring: ReleaseSafetyScoringService,
  ) {}

  /**
   * Lists release policies within an organization.
   */
  async listPolicies(
    organizationId: string,
    filters?: {
      repositoryConnectionId?: string;
      status?: ReleasePolicyStatus;
      isDefault?: boolean;
    },
  ): Promise<ReleasePolicyDto[]> {
    return this.persistenceService.listPolicies(organizationId, filters);
  }

  /**
   * Retrieves a single release policy by ID.
   */
  async getPolicy(
    organizationId: string,
    policyId: string,
  ): Promise<ReleasePolicyDto> {
    const policy = await this.persistenceService.getPolicyById(
      organizationId,
      policyId,
    );
    if (!policy) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.NOT_FOUND}: ReleasePolicy '${policyId}' not found in organization.`,
      );
    }
    return policy;
  }

  /**
   * Creates a new DRAFT policy with validated rules.
   */
  async createDraftPolicy(
    organizationId: string,
    actorUserId: string,
    dto: CreateReleasePolicyRequest,
  ): Promise<ReleasePolicyDto> {
    const cleanName = this.validatePolicyName(dto.name);
    const cleanDescription = dto.description ? dto.description.trim() : null;
    const cleanBranchPattern = dto.targetBranchPattern
      ? this.validateBranchPattern(dto.targetBranchPattern)
      : null;

    // Validate repository connection ownership if specified
    if (dto.repositoryConnectionId) {
      await this.validateRepositoryOwnership(organizationId, dto.repositoryConnectionId);
    }

    // Validate rules
    const validatedRules = this.validateRules(dto.rules || []);

    // Deterministic version calculation
    const nextVersion = await this.persistenceService.getNextVersion(
      organizationId,
      cleanName,
      dto.repositoryConnectionId ?? null,
    );

    return this.persistenceService.createDraftPolicy(
      {
        organization: { connect: { id: organizationId } },
        ...(dto.repositoryConnectionId && {
          repositoryConnection: { connect: { id: dto.repositoryConnectionId } },
        }),
        name: cleanName,
        description: cleanDescription,
        status: ReleasePolicyStatus.DRAFT,
        version: nextVersion,
        isDefault: dto.isDefault ?? false,
        targetBranchPattern: cleanBranchPattern,
        createdByUser: { connect: { id: actorUserId } },
      },
      validatedRules,
      actorUserId,
    );
  }

  /**
   * Updates an existing DRAFT policy. ACTIVE or ARCHIVED policies cannot be updated.
   */
  async updateDraftPolicy(
    organizationId: string,
    policyId: string,
    actorUserId: string,
    dto: UpdateReleasePolicyRequest,
  ): Promise<ReleasePolicyDto> {
    const existing = await this.databaseService.client.releasePolicy.findFirst({
      where: { id: policyId, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.NOT_FOUND}: ReleasePolicy '${policyId}' not found.`,
      );
    }

    if (existing.status !== ReleasePolicyStatus.DRAFT) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.INVALID_STATE}: Only policies in DRAFT status can be updated. Current status is ${existing.status}.`,
      );
    }

    const cleanName = dto.name !== undefined ? this.validatePolicyName(dto.name) : undefined;
    const cleanBranchPattern =
      dto.targetBranchPattern !== undefined
        ? dto.targetBranchPattern
          ? this.validateBranchPattern(dto.targetBranchPattern)
          : null
        : undefined;

    if (dto.repositoryConnectionId) {
      await this.validateRepositoryOwnership(organizationId, dto.repositoryConnectionId);
    }

    const validatedRules = dto.rules !== undefined ? this.validateRules(dto.rules) : undefined;

    return this.persistenceService.updateDraftPolicy(
      policyId,
      {
        name: cleanName,
        description: dto.description !== undefined ? dto.description : undefined,
        repositoryConnectionId: dto.repositoryConnectionId,
        isDefault: dto.isDefault,
        targetBranchPattern: cleanBranchPattern,
      },
      validatedRules,
      actorUserId,
    );
  }

  /**
   * Activates a DRAFT policy, superseding conflicting previous active versions atomically.
   */
  async activatePolicy(
    organizationId: string,
    policyId: string,
    actorUserId: string,
  ): Promise<ReleasePolicyDto> {
    const policy = await this.databaseService.client.releasePolicy.findFirst({
      where: { id: policyId, organizationId },
    });

    if (!policy) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.NOT_FOUND}: ReleasePolicy '${policyId}' not found.`,
      );
    }

    if (policy.status === ReleasePolicyStatus.ACTIVE) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.ALREADY_ACTIVE}: ReleasePolicy '${policyId}' is already ACTIVE.`,
      );
    }

    if (policy.status !== ReleasePolicyStatus.DRAFT) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.INVALID_STATE}: Cannot activate policy in ${policy.status} status. Only DRAFT policies can be activated.`,
      );
    }

    // Find conflicting prior ACTIVE policies at the same scope
    const priorActive = await this.databaseService.client.releasePolicy.findMany({
      where: {
        organizationId,
        status: ReleasePolicyStatus.ACTIVE,
        repositoryConnectionId: policy.repositoryConnectionId,
        OR: [
          // Same name (version progression)
          { name: policy.name },
          // Conflicting default policy at the same scope
          ...(policy.isDefault ? [{ isDefault: true }] : []),
          // Conflicting branch pattern targeting at the same scope
          ...(policy.targetBranchPattern
            ? [{ targetBranchPattern: policy.targetBranchPattern }]
            : []),
        ],
      },
      select: { id: true },
    });

    const conflictingIds = priorActive
      .map((p) => p.id)
      .filter((id) => id !== policyId);

    return this.persistenceService.activatePolicyAtomically(
      policyId,
      actorUserId,
      conflictingIds,
    );
  }

  /**
   * Archives a policy.
   */
  async archivePolicy(
    organizationId: string,
    policyId: string,
    actorUserId: string,
  ): Promise<ReleasePolicyDto> {
    const policy = await this.databaseService.client.releasePolicy.findFirst({
      where: { id: policyId, organizationId },
    });

    if (!policy) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.NOT_FOUND}: ReleasePolicy '${policyId}' not found.`,
      );
    }

    if (policy.status === ReleasePolicyStatus.ARCHIVED) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.INVALID_STATE}: ReleasePolicy '${policyId}' is already ARCHIVED.`,
      );
    }

    return this.persistenceService.archivePolicy(
      organizationId,
      policyId,
      actorUserId,
    );
  }

  /**
   * Dry-run evaluates a release policy against an existing change set/revision.
   * STRICT NON-MUTATION: Zero database writes or external publications.
   */
  async previewPolicy(
    organizationId: string,
    policyId: string,
    dto: PreviewReleasePolicyRequest,
  ): Promise<ReleasePolicyPreviewDto> {
    const policy = await this.databaseService.client.releasePolicy.findFirst({
      where: { id: policyId, organizationId },
      include: {
        rules: { orderBy: [{ order: 'asc' }, { ruleKey: 'asc' }] },
      },
    });

    if (!policy) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.NOT_FOUND}: ReleasePolicy '${policyId}' not found in organization.`,
      );
    }

    // Locate ChangeSet and Revision
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: { id: dto.changeSetId, organizationId },
      include: {
        revisions: {
          where: dto.changeRevisionId ? { id: dto.changeRevisionId } : undefined,
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!changeSet || changeSet.revisions.length === 0) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.PREVIEW_FAILED}: ChangeSet '${dto.changeSetId}' or Revision not found in organization.`,
      );
    }

    const revision = changeSet.revisions[0];

    // Find completed Blast Radius analysis
    const blastAnalysis =
      await this.databaseService.client.blastRadiusAnalysis.findFirst({
        where: { changeRevisionId: revision.id, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
      });

    if (!blastAnalysis) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.PREVIEW_FAILED}: No successful Blast Radius analysis found for ChangeRevision '${revision.id}'.`,
      );
    }

    // Load evaluation evidence without mutating anything
    const evidence = await this.releaseSafetyPersistence.loadEvaluationEvidence(
      revision.id,
      blastAnalysis.id,
    );

    // Compute signals and score using existing deterministic engine
    const signals = this.releaseSafetyRuleEngine.evaluateRules(evidence);
    const scoring = this.releaseSafetyScoring.calculateScore(signals);

    // Prepare context for policy evaluator
    const changedPaths = evidence.changedFiles
      .map((f) => f.newPath || f.oldPath || '')
      .filter(Boolean);

    const context: EvaluatorContextInput = {
      riskScore: scoring.score,
      riskLevel: scoring.riskLevel,
      signals: signals.map((s) => ({
        ruleId: s.ruleId,
        category: s.category,
        severity: s.severity,
        scoreDelta: s.scoreDelta,
        blocking: s.blocking,
        requiresReview: s.requiresReview,
        title: s.title,
      })),
      blastRadius: {
        affectedNodeCount: evidence.blastRadiusAnalysis.affectedNodeCount,
        maxDepth: evidence.blastRadiusAnalysis.maxDepth,
        rootCount: evidence.blastRadiusAnalysis.rootCount,
      },
      changedPaths,
    };

    const rulesInput: RuleEvaluationInput[] = policy.rules.map((r) => ({
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
    }));

    const scope: ReleasePolicyScope = policy.repositoryConnectionId
      ? policy.targetBranchPattern
        ? ReleasePolicyScope.REPOSITORY_BRANCH
        : ReleasePolicyScope.REPOSITORY_DEFAULT
      : policy.targetBranchPattern
      ? ReleasePolicyScope.ORGANIZATION_BRANCH
      : ReleasePolicyScope.ORGANIZATION_DEFAULT;

    const evaluation = this.evaluatorService.evaluatePolicy(
      context,
      rulesInput,
      {
        policyId: policy.id,
        policyName: policy.name,
        policyVersion: policy.version,
        scope,
        targetBranchPattern: policy.targetBranchPattern,
      },
    );

    return {
      previewOnly: true,
      policy: {
        id: policy.id,
        name: policy.name,
        version: policy.version,
        scope,
        targetBranchPattern: policy.targetBranchPattern,
        isDefault: policy.isDefault,
      },
      changeSetId: changeSet.id,
      changeRevisionId: revision.id,
      riskScore: scoring.score,
      riskLevel: scoring.riskLevel,
      predictedDecision: evaluation.finalDecision,
      finalAction: evaluation.finalAction,
      matchedRules: evaluation.matchedRules,
      unmatchedRules: evaluation.unmatchedRules,
      evaluationResults: evaluation.evaluations,
      policyEngineVersion: POLICY_ENGINE_VERSION,
      message: 'Preview evaluation simulated successfully. No ReleaseSafetyAssessment or GitHub Check was created.',
    };
  }

  /**
   * Resolves effective policy for a repository and branch.
   */
  async getEffectivePolicy(
    organizationId: string,
    repositoryConnectionId?: string | null,
    branch?: string | null,
  ): Promise<EffectiveReleasePolicyDto> {
    if (repositoryConnectionId) {
      await this.validateRepositoryOwnership(organizationId, repositoryConnectionId);
    }
    const resolved = await this.resolverService.resolveEffectivePolicy(
      organizationId,
      repositoryConnectionId,
      branch,
    );
    return resolved.dto;
  }

  private validatePolicyName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Policy name is required.`,
      );
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Policy name cannot be empty or whitespace only.`,
      );
    }
    if (trimmed.length > 150) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Policy name exceeds maximum length of 150 characters.`,
      );
    }
    return trimmed;
  }

  private validateBranchPattern(pattern: string): string {
    const trimmed = pattern.trim();
    if (trimmed.length > 255) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Branch pattern exceeds maximum length of 255 characters.`,
      );
    }
    // Safe validation: disallow dangerous shell or control characters
    if (/[;`$|&><\n\r]/.test(trimmed)) {
      throw new BadRequestException(
        `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Branch pattern contains invalid characters.`,
      );
    }
    return trimmed;
  }

  private async validateRepositoryOwnership(
    organizationId: string,
    repositoryConnectionId: string,
  ): Promise<void> {
    const repo = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        id: repositoryConnectionId,
        organizationId,
      },
      select: { id: true },
    });

    if (!repo) {
      throw new NotFoundException(
        `${RELEASE_POLICY_ERROR_CODES.REPOSITORY_NOT_FOUND}: RepositoryConnection '${repositoryConnectionId}' not found in organization.`,
      );
    }
  }

  private validateRules(
    rules: Array<{
      ruleKey?: string;
      ruleType: ReleasePolicyRuleType;
      enabled?: boolean;
      severity?: any;
      action?: ReleasePolicyAction;
      thresholdNumeric?: number | null;
      thresholdText?: string | null;
      configuration?: Record<string, unknown>;
      order?: number;
    }>,
  ): Array<Omit<Prisma.ReleasePolicyRuleCreateManyPolicyInput, 'releasePolicyId'>> {
    const seenKeys = new Set<string>();

    return rules.map((r, idx) => {
      const key = (r.ruleKey && r.ruleKey.trim()) || `rule_${r.ruleType.toLowerCase()}_${idx + 1}`;
      if (seenKeys.has(key)) {
        throw new BadRequestException(
          `${RELEASE_POLICY_ERROR_CODES.RULE_INVALID}: Duplicate rule key '${key}' detected in policy.`,
        );
      }
      seenKeys.add(key);

      // Validate threshold ranges
      if (r.ruleType === ReleasePolicyRuleType.MAX_RISK_SCORE) {
        if (r.thresholdNumeric !== undefined && r.thresholdNumeric !== null) {
          if (r.thresholdNumeric < 0 || r.thresholdNumeric > 100) {
            throw new BadRequestException(
              `${RELEASE_POLICY_ERROR_CODES.THRESHOLD_INVALID}: MAX_RISK_SCORE threshold must be between 0 and 100. Received: ${r.thresholdNumeric}`,
            );
          }
        }
      }

      if (r.ruleType === ReleasePolicyRuleType.HIGH_SIGNAL_COUNT) {
        if (r.thresholdNumeric !== undefined && r.thresholdNumeric !== null) {
          if (r.thresholdNumeric < 0 || !Number.isInteger(r.thresholdNumeric)) {
            throw new BadRequestException(
              `${RELEASE_POLICY_ERROR_CODES.THRESHOLD_INVALID}: HIGH_SIGNAL_COUNT threshold must be a non-negative integer. Received: ${r.thresholdNumeric}`,
            );
          }
        }
      }

      if (r.ruleType === ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD) {
        if (r.thresholdNumeric !== undefined && r.thresholdNumeric !== null) {
          if (r.thresholdNumeric < 0) {
            throw new BadRequestException(
              `${RELEASE_POLICY_ERROR_CODES.THRESHOLD_INVALID}: BLAST_RADIUS_THRESHOLD must be a non-negative number. Received: ${r.thresholdNumeric}`,
            );
          }
        }
      }

      const action = r.action || ReleasePolicyAction.REQUIRE_REVIEW;

      return {
        ruleKey: key,
        ruleType: r.ruleType,
        enabled: r.enabled !== false,
        severity: r.severity ?? null,
        action,
        thresholdNumeric: r.thresholdNumeric ?? null,
        thresholdText: r.thresholdText ? r.thresholdText.trim() : null,
        configuration: (r.configuration ?? {}) as Prisma.InputJsonValue,
        order: r.order ?? idx,
      };
    });
  }
}
