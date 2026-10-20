import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  GitHubCheckPublication,
  GitHubCheckPublicationStatus,
  GitHubCheckConclusion,
  ReleaseSafetyAssessment,
} from '@impactra/database';
import {
  GitHubCheckPublicationDto,
  GitHubCheckLatestResponseDto,
  ReleaseSafetyAssessmentDto,
} from '@impactra/shared';
import { GITHUB_CHECK_NAME } from './github-check-payload-builder.service';

export interface UpsertPublicationParams {
  organizationId: string;
  repositoryConnectionId: string;
  changeSetId: string;
  changeRevisionId: string;
  releaseSafetyAssessmentId: string;
  githubInstallationId: string;
  headSha: string;
  checkName?: string;
  externalId: string;
  status: GitHubCheckPublicationStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
}

@Injectable()
export class GitHubCheckPersistenceService {
  private readonly logger = new Logger(GitHubCheckPersistenceService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Retrieves the latest GitHub Check publication for a change set within an organization.
   */
  async findLatestByChangeSet(
    organizationId: string,
    changeSetId: string,
  ): Promise<GitHubCheckLatestResponseDto> {
    const publication =
      await this.databaseService.client.gitHubCheckPublication.findFirst({
        where: {
          organizationId,
          changeSetId,
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          releaseSafetyAssessment: true,
        },
      });

    if (!publication) {
      return {
        publication: null,
        summary: null,
      };
    }

    const dto = this.mapToDto(publication);
    return {
      publication: dto,
      summary: {
        checkName: dto.checkName,
        status: dto.status,
        conclusion: dto.conclusion,
        headSha: dto.headSha,
        remoteCheckUrl: dto.remoteCheckUrl,
        publishedAt: dto.publishedAt,
      },
    };
  }

  /**
   * Retrieves a specific publication by ID within an organization.
   */
  async findById(
    organizationId: string,
    publicationId: string,
  ): Promise<GitHubCheckPublicationDto> {
    const publication =
      await this.databaseService.client.gitHubCheckPublication.findFirst({
        where: {
          id: publicationId,
          organizationId,
        },
        include: {
          releaseSafetyAssessment: true,
        },
      });

    if (!publication) {
      throw new NotFoundException(
        `GitHub Check publication '${publicationId}' not found.`,
      );
    }

    return this.mapToDto(publication);
  }

  /**
   * Upserts the publication record idempotently for a given repository, head SHA, and check name.
   */
  async upsertPublication(
    params: UpsertPublicationParams,
  ): Promise<GitHubCheckPublication> {
    const checkName = params.checkName || GITHUB_CHECK_NAME;

    return this.databaseService.client.gitHubCheckPublication.upsert({
      where: {
        repositoryConnectionId_headSha_checkName: {
          repositoryConnectionId: params.repositoryConnectionId,
          headSha: params.headSha,
          checkName,
        },
      },
      create: {
        organizationId: params.organizationId,
        repositoryConnectionId: params.repositoryConnectionId,
        changeSetId: params.changeSetId,
        changeRevisionId: params.changeRevisionId,
        releaseSafetyAssessmentId: params.releaseSafetyAssessmentId,
        githubInstallationId: params.githubInstallationId,
        headSha: params.headSha,
        checkName,
        externalId: params.externalId,
        status: params.status,
        queuedAt: new Date(),
        failureCode: params.failureCode || null,
        failureMessage: params.failureMessage || null,
      },
      update: {
        // When superseding with a newer assessment for the same HEAD commit:
        changeSetId: params.changeSetId,
        changeRevisionId: params.changeRevisionId,
        releaseSafetyAssessmentId: params.releaseSafetyAssessmentId,
        githubInstallationId: params.githubInstallationId,
        externalId: params.externalId,
        status: params.status,
        queuedAt: new Date(),
        failureCode: params.failureCode || null,
        failureMessage: params.failureMessage || null,
      },
    });
  }

  /**
   * Marks a publication as RUNNING.
   */
  async markRunning(publicationId: string): Promise<GitHubCheckPublication> {
    return this.databaseService.client.gitHubCheckPublication.update({
      where: { id: publicationId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        attemptCount: { increment: 1 },
        failureCode: null,
        failureMessage: null,
      },
    });
  }

  /**
   * Marks a publication as SUCCEEDED with remote check details.
   */
  async markSucceeded(
    publicationId: string,
    githubCheckRunId: string,
    remoteCheckUrl: string | null,
    conclusion: GitHubCheckConclusion,
  ): Promise<GitHubCheckPublication> {
    const now = new Date();
    return this.databaseService.client.gitHubCheckPublication.update({
      where: { id: publicationId },
      data: {
        status: 'SUCCEEDED',
        githubCheckRunId,
        remoteCheckUrl,
        conclusion,
        completedAt: now,
        publishedAt: now,
        failureCode: null,
        failureMessage: null,
      },
    });
  }

  /**
   * Marks a publication as FAILED with sanitized error code and message.
   */
  async markFailed(
    publicationId: string,
    failureCode: string,
    failureMessage: string,
  ): Promise<GitHubCheckPublication> {
    return this.databaseService.client.gitHubCheckPublication.update({
      where: { id: publicationId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode,
        failureMessage,
      },
    });
  }

  /**
   * Marks a publication as SKIPPED with a reason.
   */
  async markSkipped(
    publicationId: string,
    reason: string,
  ): Promise<GitHubCheckPublication> {
    return this.databaseService.client.gitHubCheckPublication.update({
      where: { id: publicationId },
      data: {
        status: 'SKIPPED',
        completedAt: new Date(),
        failureCode: 'SKIPPED',
        failureMessage: reason,
      },
    });
  }

  /**
   * Maps a database entity to the shared DTO contract.
   */
  public mapToDto(
    pub: GitHubCheckPublication & {
      releaseSafetyAssessment?: ReleaseSafetyAssessment | null;
    },
  ): GitHubCheckPublicationDto {
    return {
      id: pub.id,
      organizationId: pub.organizationId,
      repositoryConnectionId: pub.repositoryConnectionId,
      changeSetId: pub.changeSetId,
      changeRevisionId: pub.changeRevisionId,
      releaseSafetyAssessmentId: pub.releaseSafetyAssessmentId,
      githubInstallationId: pub.githubInstallationId,
      headSha: pub.headSha,
      checkName: pub.checkName,
      externalId: pub.externalId,
      githubCheckRunId: pub.githubCheckRunId,
      remoteCheckUrl: pub.remoteCheckUrl,
      status: pub.status,
      conclusion: pub.conclusion,
      detailsUrl: pub.detailsUrl,
      attemptCount: pub.attemptCount,
      queuedAt: pub.queuedAt.toISOString(),
      startedAt: pub.startedAt ? pub.startedAt.toISOString() : null,
      completedAt: pub.completedAt ? pub.completedAt.toISOString() : null,
      publishedAt: pub.publishedAt ? pub.publishedAt.toISOString() : null,
      failedAt: pub.failedAt ? pub.failedAt.toISOString() : null,
      failureCode: pub.failureCode,
      failureMessage: pub.failureMessage,
      createdAt: pub.createdAt.toISOString(),
      updatedAt: pub.updatedAt.toISOString(),
      releaseSafetyAssessment: pub.releaseSafetyAssessment
        ? this.mapAssessmentToDto(pub.releaseSafetyAssessment)
        : undefined,
    };
  }

  private mapAssessmentToDto(
    assessment: ReleaseSafetyAssessment,
  ): ReleaseSafetyAssessmentDto {
    return {
      id: assessment.id,
      organizationId: assessment.organizationId,
      changeSetId: assessment.changeSetId,
      changeRevisionId: assessment.changeRevisionId,
      blastRadiusAnalysisId: assessment.blastRadiusAnalysisId,
      status: assessment.status,
      policyVersion: assessment.policyVersion,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      decision: assessment.decision,
      signalCount: assessment.signalCount,
      blockingSignalCount: assessment.blockingSignalCount,
      reviewSignalCount: assessment.reviewSignalCount,
      startedAt: assessment.startedAt ? assessment.startedAt.toISOString() : null,
      completedAt: assessment.completedAt ? assessment.completedAt.toISOString() : null,
      failedAt: assessment.failedAt ? assessment.failedAt.toISOString() : null,
      failureCode: assessment.failureCode,
      failureMessage: assessment.failureMessage,
      createdAt: assessment.createdAt.toISOString(),
      updatedAt: assessment.updatedAt.toISOString(),
    };
  }
}
