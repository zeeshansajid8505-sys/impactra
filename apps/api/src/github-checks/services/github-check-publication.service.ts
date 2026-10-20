import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GitHubCheckPersistenceService } from './github-check-persistence.service';
import {
  GitHubCheckPayloadBuilderService,
  GITHUB_CHECK_NAME,
} from './github-check-payload-builder.service';
import {
  GitHubCheckClientService,
  GitHubCheckError,
  CheckRunResult,
} from './github-check-client.service';
import { GitHubCheckQueueService } from '../queue/github-check-queue.service';
import {
  GitHubCheckPublishResponseDto,
  GitHubCheckPublicationStatus,
  ReleaseSafetyDecision,
} from '@impactra/shared';
import { GitHubCheckConclusion } from '@impactra/database';

@Injectable()
export class GitHubCheckPublicationService {
  private readonly logger = new Logger(GitHubCheckPublicationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly persistenceService: GitHubCheckPersistenceService,
    private readonly payloadBuilder: GitHubCheckPayloadBuilderService,
    private readonly clientService: GitHubCheckClientService,
    private readonly queueService: GitHubCheckQueueService,
  ) {}

  /**
   * Triggers GitHub Check publication for a ChangeSet.
   * Enforces multi-tenancy, repository connection eligibility, and idempotent deduplication.
   */
  async triggerPublication(
    organizationId: string,
    changeSetId: string,
    assessmentId?: string,
  ): Promise<GitHubCheckPublishResponseDto> {
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: {
        id: changeSetId,
        organizationId,
      },
      include: {
        repositoryConnection: true,
      },
    });

    if (!changeSet) {
      throw new NotFoundException(
        `ChangeSet '${changeSetId}' not found in organization.`,
      );
    }

    // Resolve target assessment
    let targetAssessmentId = assessmentId;
    if (!targetAssessmentId) {
      const latestAssessment =
        await this.databaseService.client.releaseSafetyAssessment.findFirst({
          where: {
            changeSetId,
            organizationId,
            status: 'SUCCEEDED',
          },
          orderBy: { createdAt: 'desc' },
        });

      if (!latestAssessment) {
        throw new NotFoundException(
          `No completed Release Safety Assessment found for ChangeSet '${changeSetId}'.`,
        );
      }
      targetAssessmentId = latestAssessment.id;
    }

    const assessment =
      await this.databaseService.client.releaseSafetyAssessment.findFirst({
        where: {
          id: targetAssessmentId,
          organizationId,
          changeSetId,
        },
        include: {
          changeRevision: true,
        },
      });

    if (!assessment) {
      throw new NotFoundException(
        `ReleaseSafetyAssessment '${targetAssessmentId}' not found for ChangeSet '${changeSetId}'.`,
      );
    }

    if (assessment.status !== 'SUCCEEDED') {
      throw new BadRequestException(
        `Release Safety Assessment is not completed (status: ${assessment.status}). Cannot publish Check Run.`,
      );
    }

    const headSha =
      assessment.changeRevision?.headSha || changeSet.currentHeadSha;
    const externalId = this.payloadBuilder.buildExternalId(
      changeSet.repositoryConnectionId,
      headSha,
    );

    // Check repository eligibility
    const repo = changeSet.repositoryConnection;
    const isEligible =
      repo.connected &&
      Boolean(repo.githubInstallationId) &&
      changeSet.provider === 'github';

    if (!isEligible) {
      this.logger.warn(
        `Repository connection '${repo.id}' is disconnected or not a GitHub repository. Marking publication SKIPPED.`,
      );

      const pub = await this.persistenceService.upsertPublication({
        organizationId,
        repositoryConnectionId: repo.id,
        changeSetId,
        changeRevisionId: assessment.changeRevisionId,
        releaseSafetyAssessmentId: assessment.id,
        githubInstallationId: repo.githubInstallationId || '',
        headSha,
        externalId,
        status: 'SKIPPED',
        failureCode: 'REPOSITORY_NOT_CONNECTED',
        failureMessage:
          'Repository connection is disconnected or not an active GitHub App installation.',
      });

      return {
        publicationId: pub.id,
        status: 'SKIPPED' as GitHubCheckPublicationStatus,
        queued: false,
        message:
          'Publication skipped: Repository is not connected via GitHub App.',
      };
    }

    // Upsert QUEUED publication record
    const pub = await this.persistenceService.upsertPublication({
      organizationId,
      repositoryConnectionId: repo.id,
      changeSetId,
      changeRevisionId: assessment.changeRevisionId,
      releaseSafetyAssessmentId: assessment.id,
      githubInstallationId: repo.githubInstallationId,
      headSha,
      externalId,
      status: 'QUEUED',
    });

    // Enqueue BullMQ publication worker
    await this.queueService.enqueue(pub.id);

    return {
      publicationId: pub.id,
      status: 'QUEUED' as GitHubCheckPublicationStatus,
      queued: true,
      message: 'GitHub Check publication queued successfully.',
    };
  }

  /**
   * Auto-triggers GitHub Check publication for a completed assessment.
   * Safe for background execution; handles errors without throwing.
   */
  async autoTriggerForAssessment(assessmentId: string): Promise<void> {
    try {
      const assessment =
        await this.databaseService.client.releaseSafetyAssessment.findUnique({
          where: { id: assessmentId },
          include: {
            changeSet: {
              include: { repositoryConnection: true },
            },
            changeRevision: true,
          },
        });

      if (!assessment || assessment.status !== 'SUCCEEDED') {
        return;
      }

      await this.triggerPublication(
        assessment.organizationId,
        assessment.changeSetId,
        assessment.id,
      );
      this.logger.log(
        `Auto-triggered GitHub Check publication for assessment '${assessmentId}'.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to auto-trigger GitHub Check publication for assessment '${assessmentId}': ${msg}`,
      );
    }
  }

  /**
   * Authoritative execution worker: builds payload and calls GitHub Checks API.
   */
  async executePublication(publicationId: string): Promise<void> {
    this.logger.log(
      `Starting GitHub Check publication execution for '${publicationId}'.`,
    );

    const pub =
      await this.databaseService.client.gitHubCheckPublication.findUnique({
        where: { id: publicationId },
        include: {
          releaseSafetyAssessment: {
            include: { signals: true },
          },
          repositoryConnection: true,
          changeSet: true,
          changeRevision: true,
        },
      });

    if (!pub) {
      this.logger.error(
        `GitHubCheckPublication '${publicationId}' not found during worker execution.`,
      );
      return;
    }

    if (pub.status === 'SKIPPED') {
      this.logger.log(
        `Publication '${publicationId}' is marked SKIPPED. Execution aborted.`,
      );
      return;
    }

    await this.persistenceService.markRunning(publicationId);

    // Resolve owner and repo
    let owner = pub.repositoryConnection.ownerLogin;
    let repo = pub.repositoryConnection.name;
    if (
      pub.repositoryConnection.fullName &&
      pub.repositoryConnection.fullName.includes('/')
    ) {
      const parts = pub.repositoryConnection.fullName.split('/');
      owner = parts[0];
      repo = parts[1];
    }

    // Build deterministic wire payload
    const payload = this.payloadBuilder.buildPayload({
      assessment: pub.releaseSafetyAssessment,
      repositoryConnectionId: pub.repositoryConnectionId,
      headSha: pub.headSha,
      changeSetId: pub.changeSetId,
      appBaseUrl:
        process.env.APP_BASE_URL ||
        process.env.WEB_URL ||
        'http://impactra.local',
    });

    try {
      let result: CheckRunResult;

      if (pub.githubCheckRunId) {
        this.logger.log(
          `Updating existing GitHub Check Run ${pub.githubCheckRunId} for commit ${pub.headSha}.`,
        );
        result = await this.clientService.updateCheckRun(
          pub.githubInstallationId,
          owner,
          repo,
          parseInt(pub.githubCheckRunId, 10),
          payload,
        );
      } else {
        this.logger.log(
          `Creating new GitHub Check Run for commit ${pub.headSha} on ${owner}/${repo}.`,
        );
        result = await this.clientService.createCheckRun(
          pub.githubInstallationId,
          owner,
          repo,
          payload,
        );
      }

      const conclusionMap: Record<
        ReleaseSafetyDecision,
        GitHubCheckConclusion
      > = {
        PASS: 'SUCCESS',
        REVIEW_REQUIRED: 'ACTION_REQUIRED',
        BLOCKED: 'FAILURE',
      };
      const conclusion = conclusionMap[pub.releaseSafetyAssessment.decision];

      await this.persistenceService.markSucceeded(
        publicationId,
        String(result.id),
        result.html_url || null,
        conclusion,
      );

      this.logger.log(
        `Successfully published GitHub Check Run ${result.id} for commit ${pub.headSha} (conclusion: ${conclusion}).`,
      );
    } catch (err: unknown) {
      const code =
        err instanceof GitHubCheckError ? err.code : 'GITHUB_CHECK_ERROR';
      const msg = err instanceof Error ? err.message : String(err);

      this.logger.error(
        `GitHub Check publication '${publicationId}' failed: [${code}] ${msg}`,
      );

      await this.persistenceService.markFailed(publicationId, code, msg);
      throw err;
    }
  }
}
