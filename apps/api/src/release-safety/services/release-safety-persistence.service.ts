import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Prisma,
  ReleaseSafetyAssessment,
  ReleaseSafetySignal,
  ReleaseSafetyAssessmentStatus,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
  ReleaseSafetySignalSeverity,
  ReleaseSafetySignalCategory,
} from '@impactra/database';
import {
  ReleaseSafetyAssessmentDto,
  ReleaseSafetySignalDto,
  ReleaseSafetyLatestResponseDto,
  ReleaseSafetySignalsResponseDto,
  ReleaseSafetyAssessmentsListResponseDto,
} from '@impactra/shared';
import {
  EvaluationEvidenceInput,
  ComputedSignal,
} from '../policy/release-safety-policy';
import { ScoringResult } from './release-safety-scoring.service';
import {
  ListReleaseSafetySignalsQueryDto,
  ListReleaseSafetyAssessmentsQueryDto,
} from '../dto/release-safety.dto';

@Injectable()
export class ReleaseSafetyPersistenceService {
  private readonly logger = new Logger(ReleaseSafetyPersistenceService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Loads all required evidence for evaluating Release Safety policies
   * for a specific change revision and blast radius analysis.
   */
  async loadEvaluationEvidence(
    revisionId: string,
    blastRadiusAnalysisId: string,
  ): Promise<EvaluationEvidenceInput> {
    const [revision, changedFiles, dependencyDeltas, blastAnalysis, findings] =
      await Promise.all([
        this.databaseService.client.changeRevision.findUnique({
          where: { id: revisionId },
          select: {
            id: true,
            filesAdded: true,
            filesModified: true,
            filesDeleted: true,
            filesRenamed: true,
          },
        }),
        this.databaseService.client.changedFile.findMany({
          where: { changeRevisionId: revisionId },
          select: {
            id: true,
            newPath: true,
            oldPath: true,
            status: true,
            additions: true,
            deletions: true,
            changes: true,
          },
        }),
        this.databaseService.client.dependencyDelta.findMany({
          where: { changeRevisionId: revisionId },
          select: {
            id: true,
            deltaType: true,
            sourceStableKey: true,
            targetStableKey: true,
            edgeType: true,
          },
        }),
        this.databaseService.client.blastRadiusAnalysis.findUnique({
          where: { id: blastRadiusAnalysisId },
          select: {
            id: true,
            maxDepth: true,
            rootCount: true,
            affectedNodeCount: true,
            firstOrderCount: true,
            transitiveCount: true,
            truncated: true,
          },
        }),
        this.databaseService.client.blastRadiusFinding.findMany({
          where: { analysisId: blastRadiusAnalysisId },
          select: {
            id: true,
            stableKey: true,
            nodeName: true,
            nodePath: true,
            nodeType: true,
            category: true,
            impactClass: true,
            depth: true,
          },
        }),
      ]);

    if (!revision) {
      throw new NotFoundException(
        `ChangeRevision '${revisionId}' not found for release safety evaluation.`,
      );
    }

    if (!blastAnalysis) {
      throw new NotFoundException(
        `BlastRadiusAnalysis '${blastRadiusAnalysisId}' not found for release safety evaluation.`,
      );
    }

    return {
      changeRevision: revision,
      changedFiles,
      dependencyDeltas,
      blastRadiusAnalysis: blastAnalysis,
      blastRadiusFindings: findings,
    };
  }

  /**
   * Persists an evaluation result atomically within a database transaction.
   */
  async persistAssessmentResult(
    assessmentId: string,
    scoring: ScoringResult,
    signals: ComputedSignal[],
  ): Promise<ReleaseSafetyAssessmentDto> {
    return this.databaseService.client.$transaction(async (tx) => {
      // 1. Fetch current assessment
      const assessment = await tx.releaseSafetyAssessment.findUnique({
        where: { id: assessmentId },
      });

      if (!assessment) {
        throw new NotFoundException(
          `ReleaseSafetyAssessment '${assessmentId}' not found.`,
        );
      }

      // 2. Delete existing signals if this is a re-run
      await tx.releaseSafetySignal.deleteMany({
        where: { assessmentId },
      });

      // 3. Create individual signals
      if (signals.length > 0) {
        await tx.releaseSafetySignal.createMany({
          data: signals.map((s) => ({
            organizationId: assessment.organizationId,
            assessmentId,
            ruleId: s.ruleId,
            ruleVersion: s.ruleVersion,
            category: s.category,
            severity: s.severity,
            scoreDelta: s.scoreDelta,
            blocking: s.blocking,
            requiresReview: s.requiresReview,
            title: s.title,
            description: s.description,
            evidenceType: s.evidenceType,
            evidenceReferenceId: s.evidenceReferenceId,
            evidenceStableKey: s.evidenceStableKey,
            evidenceJson: s.evidenceJson as Prisma.InputJsonValue,
          })),
        });
      }

      // 4. Update assessment
      const updated = await tx.releaseSafetyAssessment.update({
        where: { id: assessmentId },
        data: {
          status: 'SUCCEEDED',
          riskScore: scoring.score,
          riskLevel: scoring.riskLevel,
          decision: scoring.decision,
          signalCount: scoring.totalSignals,
          blockingSignalCount: scoring.blockingSignalsCount,
          reviewSignalCount: scoring.reviewSignalsCount,
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
        include: {
          signals: {
            orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
          },
        },
      });

      return this.mapAssessmentToDto(updated, updated.signals);
    });
  }

  /**
   * Retrieves the latest release safety assessment for a change set.
   */
  async getLatestAssessment(
    organizationId: string,
    changeSetId: string,
  ): Promise<ReleaseSafetyLatestResponseDto> {
    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findFirst({
        where: {
          organizationId,
          changeSetId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          signals: {
            orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
            take: 20,
          },
        },
      });

    if (!assessment) {
      return { assessment: null, summary: null };
    }

    const assessmentDto = this.mapAssessmentToDto(assessment, assessment.signals);
    return {
      assessment: assessmentDto,
      summary: {
        riskScore: assessmentDto.riskScore,
        riskLevel: assessmentDto.riskLevel,
        decision: assessmentDto.decision,
        signalCount: assessmentDto.signalCount,
        blockingSignalCount: assessmentDto.blockingSignalCount,
        reviewSignalCount: assessmentDto.reviewSignalCount,
        policyVersion: assessmentDto.policyVersion,
      },
    };
  }

  /**
   * Retrieves an assessment by ID with tenant isolation.
   */
  async getAssessmentById(
    organizationId: string,
    assessmentId: string,
  ): Promise<ReleaseSafetyAssessmentDto> {
    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findFirst({
        where: {
          id: assessmentId,
          organizationId,
        },
        include: {
          signals: {
            orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
          },
        },
      });

    if (!assessment) {
      throw new NotFoundException(
        `ReleaseSafetyAssessment '${assessmentId}' not found in organization.`,
      );
    }

    return this.mapAssessmentToDto(assessment, assessment.signals);
  }

  /**
   * Lists paginated signals for an assessment with tenant isolation.
   */
  async listSignals(
    organizationId: string,
    assessmentId: string,
    query: ListReleaseSafetySignalsQueryDto,
  ): Promise<ReleaseSafetySignalsResponseDto> {
    // Verify assessment belongs to organization
    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findFirst({
        where: { id: assessmentId, organizationId },
        select: { id: true },
      });

    if (!assessment) {
      throw new NotFoundException(
        `ReleaseSafetyAssessment '${assessmentId}' not found in organization.`,
      );
    }

    const where: Prisma.ReleaseSafetySignalWhereInput = {
      assessmentId,
      organizationId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.blocking !== undefined ? { blocking: query.blocking } : {}),
      ...(query.requiresReview !== undefined
        ? { requiresReview: query.requiresReview }
        : {}),
    };

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 50;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.databaseService.client.releaseSafetySignal.count({ where }),
      this.databaseService.client.releaseSafetySignal.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((sig) => this.mapSignalToDto(sig)),
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
    };
  }

  /**
   * Lists paginated assessments for an organization.
   */
  async listAssessments(
    organizationId: string,
    query: ListReleaseSafetyAssessmentsQueryDto,
  ): Promise<ReleaseSafetyAssessmentsListResponseDto> {
    const where: Prisma.ReleaseSafetyAssessmentWhereInput = {
      organizationId,
      ...(query.decision ? { decision: query.decision } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.databaseService.client.releaseSafetyAssessment.count({ where }),
      this.databaseService.client.releaseSafetyAssessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: items.map((a) => this.mapAssessmentToDto(a)),
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
    };
  }

  /**
   * Helper: maps Prisma model to ReleaseSafetyAssessmentDto
   */
  public mapAssessmentToDto(
    assessment: ReleaseSafetyAssessment,
    signals?: ReleaseSafetySignal[],
  ): ReleaseSafetyAssessmentDto {
    return {
      id: assessment.id,
      organizationId: assessment.organizationId,
      changeSetId: assessment.changeSetId,
      changeRevisionId: assessment.changeRevisionId,
      blastRadiusAnalysisId: assessment.blastRadiusAnalysisId,
      status: assessment.status as ReleaseSafetyAssessmentStatus,
      policyVersion: assessment.policyVersion,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel as ReleaseRiskLevel,
      decision: assessment.decision as ReleaseSafetyDecision,
      signalCount: assessment.signalCount,
      blockingSignalCount: assessment.blockingSignalCount,
      reviewSignalCount: assessment.reviewSignalCount,
      startedAt: assessment.startedAt ? assessment.startedAt.toISOString() : null,
      completedAt: assessment.completedAt
        ? assessment.completedAt.toISOString()
        : null,
      failedAt: assessment.failedAt ? assessment.failedAt.toISOString() : null,
      failureCode: assessment.failureCode,
      failureMessage: assessment.failureMessage,
      createdAt: assessment.createdAt.toISOString(),
      updatedAt: assessment.updatedAt.toISOString(),
      signals: signals ? signals.map((s) => this.mapSignalToDto(s)) : undefined,
    };
  }

  /**
   * Helper: maps Prisma model to ReleaseSafetySignalDto
   */
  public mapSignalToDto(signal: ReleaseSafetySignal): ReleaseSafetySignalDto {
    let evidenceJson: Record<string, unknown> = {};
    if (signal.evidenceJson && typeof signal.evidenceJson === 'object' && !Array.isArray(signal.evidenceJson)) {
      evidenceJson = signal.evidenceJson as Record<string, unknown>;
    }

    return {
      id: signal.id,
      ruleId: signal.ruleId,
      ruleVersion: signal.ruleVersion,
      category: signal.category as ReleaseSafetySignalCategory,
      severity: signal.severity as ReleaseSafetySignalSeverity,
      scoreDelta: signal.scoreDelta,
      blocking: signal.blocking,
      requiresReview: signal.requiresReview,
      title: signal.title,
      description: signal.description,
      evidenceType: signal.evidenceType,
      evidenceReferenceId: signal.evidenceReferenceId,
      evidenceStableKey: signal.evidenceStableKey,
      evidenceJson,
      createdAt: signal.createdAt.toISOString(),
    };
  }
}
