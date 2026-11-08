import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ReleaseSafetyQueueService } from '../queue/release-safety-queue.service';
import { ReleaseSafetyRuleEngineService } from './release-safety-rule-engine.service';
import { ReleaseSafetyScoringService } from './release-safety-scoring.service';
import { ReleaseSafetyPersistenceService } from './release-safety-persistence.service';
import { GitHubCheckPublicationService } from '../../github-checks/services/github-check-publication.service';
import {
  RELEASE_SAFETY_POLICY_VERSION,
} from '../policy/release-safety-policy';
import { ReleaseSafetyAssessmentDto, ReleasePolicySnapshotDto } from '@impactra/shared';
import { ReleasePolicyResolverService } from '../../release-policy/services/release-policy-resolver.service';
import { ReleasePolicyEvaluatorService, EvaluatorContextInput } from '../../release-policy/services/release-policy-evaluator.service';

@Injectable()
export class ReleaseSafetyAnalysisService {
  private readonly logger = new Logger(ReleaseSafetyAnalysisService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly queueService: ReleaseSafetyQueueService,
    private readonly ruleEngineService: ReleaseSafetyRuleEngineService,
    private readonly scoringService: ReleaseSafetyScoringService,
    private readonly persistenceService: ReleaseSafetyPersistenceService,
    @Optional()
    @Inject(forwardRef(() => GitHubCheckPublicationService))
    private readonly gitHubCheckPublicationService?: GitHubCheckPublicationService,
    @Optional()
    @Inject(forwardRef(() => ReleasePolicyResolverService))
    private readonly policyResolverService?: ReleasePolicyResolverService,
    @Optional()
    @Inject(forwardRef(() => ReleasePolicyEvaluatorService))
    private readonly policyEvaluatorService?: ReleasePolicyEvaluatorService,
  ) {}

  /**
   * Triggers or retries a deterministic release safety evaluation for a change set.
   * Enforces multi-tenancy and prerequisite Blast Radius analysis completion.
   */
  async triggerEvaluation(
    organizationId: string,
    changeSetId: string,
    force = false,
  ): Promise<ReleaseSafetyAssessmentDto> {
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: {
        id: changeSetId,
        organizationId,
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!changeSet) {
      throw new NotFoundException(
        `ChangeSet '${changeSetId}' not found in organization.`,
      );
    }

    const revision = changeSet.revisions[0];
    if (!revision) {
      throw new BadRequestException(
        `ChangeSet '${changeSetId}' has no revisions available to evaluate.`,
      );
    }

    // Must have a completed Blast Radius analysis
    const blastAnalysis =
      await this.databaseService.client.blastRadiusAnalysis.findFirst({
        where: {
          changeRevisionId: revision.id,
          status: 'SUCCEEDED',
        },
        orderBy: { createdAt: 'desc' },
      });

    if (!blastAnalysis) {
      throw new BadRequestException(
        `Cannot evaluate Release Safety: No successful Blast Radius analysis found for ChangeRevision '${revision.id}'. Run Blast Radius analysis first.`,
      );
    }

    // Check for existing assessment
    const existing =
      await this.databaseService.client.releaseSafetyAssessment.findUnique({
        where: {
          changeRevisionId_blastRadiusAnalysisId_policyVersion: {
            changeRevisionId: revision.id,
            blastRadiusAnalysisId: blastAnalysis.id,
            policyVersion: RELEASE_SAFETY_POLICY_VERSION,
          },
        },
        include: {
          signals: {
            orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
          },
        },
      });

    if (existing) {
      if (!force && existing.status === 'SUCCEEDED') {
        this.logger.log(
          `Returning existing SUCCEEDED release safety assessment '${existing.id}' (force=false).`,
        );
        return this.persistenceService.mapAssessmentToDto(
          existing,
          existing.signals,
        );
      }

      if (!force && (existing.status === 'QUEUED' || existing.status === 'RUNNING')) {
        this.logger.log(
          `Returning active ${existing.status} release safety assessment '${existing.id}' (force=false).`,
        );
        return this.persistenceService.mapAssessmentToDto(
          existing,
          existing.signals,
        );
      }

      // Re-evaluate on force or retry after failure
      const updated =
        await this.databaseService.client.releaseSafetyAssessment.update({
          where: { id: existing.id },
          data: {
            status: 'QUEUED',
            startedAt: null,
            completedAt: null,
            failedAt: null,
            failureCode: null,
            failureMessage: null,
          },
        });

      await this.queueService.enqueue(updated.id);
      return this.persistenceService.mapAssessmentToDto(updated);
    }

    // Create new assessment
    const created =
      await this.databaseService.client.releaseSafetyAssessment.create({
        data: {
          organizationId,
          changeSetId,
          changeRevisionId: revision.id,
          blastRadiusAnalysisId: blastAnalysis.id,
          status: 'QUEUED',
          policyVersion: RELEASE_SAFETY_POLICY_VERSION,
        },
      });

    await this.queueService.enqueue(created.id);
    this.logger.log(
      `Created and enqueued ReleaseSafetyAssessment '${created.id}' for ChangeSet '${changeSetId}'.`,
    );

    return this.persistenceService.mapAssessmentToDto(created);
  }

  /**
   * Safely auto-triggers release safety evaluation after Blast Radius completes.
   * Never throws exceptions to prevent failing the blast radius worker.
   */
  async autoTriggerEvaluation(
    changeSetId: string,
    revisionId: string,
    blastRadiusAnalysisId: string,
  ): Promise<void> {
    try {
      const changeSet = await this.databaseService.client.changeSet.findUnique({
        where: { id: changeSetId },
        select: { organizationId: true },
      });

      if (!changeSet) {
        this.logger.warn(
          `Cannot auto-trigger release safety: ChangeSet '${changeSetId}' not found.`,
        );
        return;
      }

      const existing =
        await this.databaseService.client.releaseSafetyAssessment.findUnique({
          where: {
            changeRevisionId_blastRadiusAnalysisId_policyVersion: {
              changeRevisionId: revisionId,
              blastRadiusAnalysisId,
              policyVersion: RELEASE_SAFETY_POLICY_VERSION,
            },
          },
        });

      if (existing) {
        this.logger.log(
          `Release safety assessment already exists for revision '${revisionId}' and blast radius '${blastRadiusAnalysisId}'. Skipping auto-trigger.`,
        );
        return;
      }

      const assessment =
        await this.databaseService.client.releaseSafetyAssessment.create({
          data: {
            organizationId: changeSet.organizationId,
            changeSetId,
            changeRevisionId: revisionId,
            blastRadiusAnalysisId,
            status: 'QUEUED',
            policyVersion: RELEASE_SAFETY_POLICY_VERSION,
          },
        });

      await this.queueService.enqueue(assessment.id);
      this.logger.log(
        `Auto-triggered ReleaseSafetyAssessment '${assessment.id}' after Blast Radius completion.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to auto-trigger Release Safety evaluation for revision '${revisionId}': ${msg}`,
      );
    }
  }

  /**
   * Authoritative execution worker: processes the evaluation end-to-end.
   */
  async executeEvaluation(assessmentId: string): Promise<void> {
    this.logger.log(
      `Starting deterministic Release Safety evaluation for '${assessmentId}'.`,
    );

    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findUnique({
        where: { id: assessmentId },
      });

    if (!assessment) {
      this.logger.error(
        `ReleaseSafetyAssessment '${assessmentId}' not found during worker execution.`,
      );
      return;
    }

    if (assessment.status === 'RUNNING') {
      this.logger.warn(
        `ReleaseSafetyAssessment '${assessmentId}' is already running. Skipping duplicate run.`,
      );
      return;
    }

    await this.databaseService.client.releaseSafetyAssessment.update({
      where: { id: assessmentId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });

    try {
      // 1. Load complete evidence
      const evidence = await this.persistenceService.loadEvaluationEvidence(
        assessment.changeRevisionId,
        assessment.blastRadiusAnalysisId,
      );

      // 2. Evaluate all rules
      const signals = this.ruleEngineService.evaluateRules(evidence);

      // 3. Compute score, risk level, decision
      const scoring = this.scoringService.calculateScore(signals);

      // 4. Resolve and evaluate Release Policy (Phase 11)
      let finalDecision = scoring.decision;
      let policyId: string | null = null;
      let policySnapshot: ReleasePolicySnapshotDto | null = null;

      if (this.policyResolverService && this.policyEvaluatorService) {
        try {
          const changeSet = await this.databaseService.client.changeSet.findUnique({
            where: { id: assessment.changeSetId },
            select: { repositoryConnectionId: true, baseRef: true },
          });

          const resolved = await this.policyResolverService.resolveEffectivePolicy(
            assessment.organizationId,
            changeSet?.repositoryConnectionId,
            changeSet?.baseRef,
          );

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

          const evaluation = this.policyEvaluatorService.evaluatePolicy(
            context,
            resolved.rules,
            {
              policyId: resolved.dto.policyId,
              policyName: resolved.dto.policyName,
              policyVersion: resolved.dto.policyVersion,
              scope: resolved.dto.scope,
              targetBranchPattern: resolved.dto.targetBranchPattern,
            },
          );

          finalDecision = evaluation.finalDecision;
          policyId = resolved.dto.policyId;
          policySnapshot = evaluation.snapshot;
        } catch (policyErr: unknown) {
          const errDetail = policyErr instanceof Error ? policyErr.message : String(policyErr);
          this.logger.warn(
            `Policy resolution/evaluation failed for assessment '${assessmentId}', falling back to default scoring decision: ${errDetail}`,
          );
        }
      }

      // 5. Atomically persist results
      await this.persistenceService.persistAssessmentResult(
        assessmentId,
        {
          ...scoring,
          decision: finalDecision,
        },
        signals,
        policyId,
        policySnapshot,
      );

      this.logger.log(
        `Release Safety evaluation '${assessmentId}' SUCCEEDED with decision=${scoring.decision}, score=${scoring.score}/100, signals=${signals.length}.`,
      );

      // 5. Asynchronously auto-trigger GitHub Check publication
      try {
        if (this.gitHubCheckPublicationService) {
          await this.gitHubCheckPublicationService.autoTriggerForAssessment(
            assessmentId,
          );
        }
      } catch (checkErr: unknown) {
        this.logger.warn(
          `Auto-triggering GitHub Check publication failed for '${assessmentId}': ${checkErr}`,
        );
      }
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Release Safety evaluation '${assessmentId}' failed: ${errMessage}`,
      );

      await this.databaseService.client.releaseSafetyAssessment.update({
        where: { id: assessmentId },
        data: {
          status: 'FAILED',
          failureCode: 'EVALUATION_ERROR',
          failureMessage: errMessage,
          failedAt: new Date(),
        },
      });

      throw err;
    }
  }
}
