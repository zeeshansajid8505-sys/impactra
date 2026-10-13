import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ChangeQueueService } from '../queue/change-queue.service';
import { GithubPullRequestService } from './github-pull-request.service';
import { ChangedFileService } from './changed-file.service';
import { SnapshotAlignmentService } from './snapshot-alignment.service';
import { TwinChangeMapperService } from './twin-change-mapper.service';
import { DependencyDeltaService } from './dependency-delta.service';
import {
  ListChangeSetsQueryDto,
  ListChangeRevisionsQueryDto,
  ListChangedFilesQueryDto,
  ListTwinChangeMappingsQueryDto,
  ListDependencyDeltasQueryDto,
} from '../dto/changes.dto';
import {
  ChangeSetDto,
  ChangeRevisionDto,
  ChangedFileDto,
  TwinChangeMappingDto,
  DependencyDeltaDto,
  ChangeSetListResponse,
  ChangeRevisionListResponse,
  ChangedFilesResponse,
  TwinChangeMappingsResponse,
  DependencyDeltaResponse,
  ChangedFileStatus,
  ChangeRevisionStatus,
} from '@impactra/shared';

@Injectable()
export class ChangeOrchestratorService {
  private readonly logger = new Logger(ChangeOrchestratorService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly queueService: ChangeQueueService,
    private readonly githubPullRequestService: GithubPullRequestService,
    private readonly changedFileService: ChangedFileService,
    private readonly snapshotAlignmentService: SnapshotAlignmentService,
    private readonly twinChangeMapperService: TwinChangeMapperService,
    private readonly dependencyDeltaService: DependencyDeltaService,
  ) {}

  /**
   * Processes an incoming GitHub pull_request webhook event.
   */
  async handlePullRequestWebhook(event: string, payload: any): Promise<any> {
    if (event !== 'pull_request') {
      return { ignored: true, reason: `Ignored event: ${event}` };
    }

    const action = payload.action;
    const allowedActions = ['opened', 'synchronize', 'reopened', 'closed'];
    if (!allowedActions.includes(action)) {
      return { ignored: true, reason: `Ignored action: ${action}` };
    }

    const githubRepoId = payload.repository?.id;
    if (!githubRepoId) {
      return { ignored: true, reason: 'Missing repository ID in payload' };
    }

    // Tenancy lookup: find connected repository connection
    const repository = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        githubRepositoryId: String(githubRepoId),
        connected: true,
      },
      include: {
        installation: true,
      },
    });

    if (!repository) {
      this.logger.log(`No active connected repository found for githubRepoId: ${githubRepoId}`);
      return { ignored: true, reason: 'Repository not connected' };
    }

    const pr = payload.pull_request;
    const prNumber = pr.number;
    const baseSha = pr.base.sha;
    const baseRef = pr.base.ref;
    const headSha = pr.head.sha;
    const headRef = pr.head.ref;
    const authorLogin = pr.user?.login || 'unknown';
    const isMerged = Boolean(pr.merged);
    const isDraft = Boolean(pr.draft);
    const providerPullRequestId = String(pr.id || pr.number);

    if (action === 'closed') {
      await this.databaseService.client.changeSet.updateMany({
        where: {
          repositoryConnectionId: repository.id,
          pullRequestNumber: prNumber,
        },
        data: {
          state: 'closed',
          isMerged,
          currentBaseSha: baseSha,
          currentHeadSha: headSha,
        },
      });
      return { handled: true, action: 'closed', isMerged };
    }

    // opened, synchronize, reopened
    let changeSet = await this.databaseService.client.changeSet.findUnique({
      where: {
        repositoryConnectionId_pullRequestNumber: {
          repositoryConnectionId: repository.id,
          pullRequestNumber: prNumber,
        },
      },
    });

    if (!changeSet) {
      try {
        changeSet = await this.databaseService.client.changeSet.create({
          data: {
            organizationId: repository.organizationId,
            repositoryConnectionId: repository.id,
            provider: 'github',
            providerPullRequestId,
            pullRequestNumber: prNumber,
            title: pr.title || `PR #${prNumber}`,
            authorLogin,
            baseRef,
            headRef,
            currentBaseSha: baseSha,
            currentHeadSha: headSha,
            state: 'open',
            isDraft,
            isMerged: false,
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          changeSet = await this.databaseService.client.changeSet.findUnique({
            where: {
              repositoryConnectionId_pullRequestNumber: {
                repositoryConnectionId: repository.id,
                pullRequestNumber: prNumber,
              },
            },
          });
        } else {
          throw err;
        }
      }
    } else {
      // Check for stale out-of-order webhook delivery
      const isStale = Boolean(
        (pr.updated_at && new Date(pr.updated_at).getTime() < changeSet.updatedAt.getTime()) ||
        (changeSet.currentHeadSha !== headSha &&
          (await this.databaseService.client.changeRevision.findFirst({
            where: { changeSetId: changeSet.id, headSha },
          })))
      );

      if (isStale) {
        this.logger.warn(
          `Received stale out-of-order webhook for PR #${prNumber} (head: ${headSha.slice(0, 7)}). Preserving current head ${changeSet.currentHeadSha.slice(0, 7)}.`,
        );
      } else {
        // Update existing change set with new head/title
        changeSet = await this.databaseService.client.changeSet.update({
          where: { id: changeSet.id },
          data: {
            title: pr.title || changeSet.title,
            authorLogin,
            baseRef,
            headRef,
            currentBaseSha: baseSha,
            currentHeadSha: headSha,
            state: 'open',
            isDraft,
          },
        });
      }
    }

    if (!changeSet) {
      throw new Error(`Failed to resolve change set for PR #${prNumber}`);
    }

    // Create or find immutable ChangeRevision for this exact (baseSha -> headSha) pair
    let revision = await this.databaseService.client.changeRevision.findUnique({
      where: {
        changeSetId_baseSha_headSha_analysisVersion: {
          changeSetId: changeSet.id,
          baseSha,
          headSha,
          analysisVersion: 'change-analysis-v1',
        },
      },
    });

    if (!revision) {
      try {
        revision = await this.databaseService.client.changeRevision.create({
          data: {
            changeSetId: changeSet.id,
            organizationId: repository.organizationId,
            repositoryConnectionId: repository.id,
            baseSha,
            headSha,
            analysisVersion: 'change-analysis-v1',
            status: 'QUEUED',
            stage: 'QUEUED',
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          revision = await this.databaseService.client.changeRevision.findUnique({
            where: {
              changeSetId_baseSha_headSha_analysisVersion: {
                changeSetId: changeSet.id,
                baseSha,
                headSha,
                analysisVersion: 'change-analysis-v1',
              },
            },
          });
        } else {
          throw err;
        }
      }
    }

    if (revision && (revision.status === 'QUEUED' || revision.status === 'WAITING_FOR_SNAPSHOTS')) {
      await this.queueService.enqueue(revision.id);
    }

    return { handled: true, changeSetId: changeSet.id, revisionId: revision?.id };
  }

  /**
   * Manually triggers or re-syncs a Pull Request for a repository.
   */
  async syncPullRequest(
    organizationId: string,
    repositoryId: string,
    prNumber: number,
  ): Promise<ChangeSetDto> {
    const repository = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        id: repositoryId,
        organizationId,
      },
      include: {
        installation: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(`Repository '${repositoryId}' not found in organization.`);
    }

    if (!repository.connected) {
      throw new BadRequestException(`Repository '${repository.fullName}' is not connected.`);
    }

    if (!repository.installation || repository.installation.status !== 'ACTIVE') {
      throw new BadRequestException(
        `GitHub App installation for repository '${repository.fullName}' is not active.`,
      );
    }

    // Fetch PR details from GitHub
    const { pullRequest } = await this.githubPullRequestService.fetchPullRequestAndFiles({
      githubInstallationId: repository.installation.githubInstallationId,
      owner: repository.ownerLogin,
      repo: repository.name,
      pullNumber: prNumber,
    });

    // Upsert ChangeSet
    const changeSet = await this.databaseService.client.changeSet.upsert({
      where: {
        repositoryConnectionId_pullRequestNumber: {
          repositoryConnectionId: repository.id,
          pullRequestNumber: prNumber,
        },
      },
      create: {
        organizationId,
        repositoryConnectionId: repository.id,
        provider: 'github',
        providerPullRequestId: String(pullRequest.number),
        pullRequestNumber: prNumber,
        title: pullRequest.title,
        authorLogin: pullRequest.authorUsername,
        baseRef: pullRequest.baseRef,
        headRef: pullRequest.headRef,
        currentBaseSha: pullRequest.baseSha,
        currentHeadSha: pullRequest.headSha,
        state: pullRequest.state,
        isDraft: false,
        isMerged: pullRequest.merged,
      },
      update: {
        title: pullRequest.title,
        authorLogin: pullRequest.authorUsername,
        baseRef: pullRequest.baseRef,
        headRef: pullRequest.headRef,
        currentBaseSha: pullRequest.baseSha,
        currentHeadSha: pullRequest.headSha,
        state: pullRequest.state,
        isMerged: pullRequest.merged,
      },
    });

    // Upsert ChangeRevision
    let revision = await this.databaseService.client.changeRevision.findUnique({
      where: {
        changeSetId_baseSha_headSha_analysisVersion: {
          changeSetId: changeSet.id,
          baseSha: pullRequest.baseSha,
          headSha: pullRequest.headSha,
          analysisVersion: 'change-analysis-v1',
        },
      },
    });

    if (!revision) {
      try {
        revision = await this.databaseService.client.changeRevision.create({
          data: {
            changeSetId: changeSet.id,
            organizationId,
            repositoryConnectionId: repository.id,
            baseSha: pullRequest.baseSha,
            headSha: pullRequest.headSha,
            analysisVersion: 'change-analysis-v1',
            status: 'QUEUED',
            stage: 'QUEUED',
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          revision = await this.databaseService.client.changeRevision.findUnique({
            where: {
              changeSetId_baseSha_headSha_analysisVersion: {
                changeSetId: changeSet.id,
                baseSha: pullRequest.baseSha,
                headSha: pullRequest.headSha,
                analysisVersion: 'change-analysis-v1',
              },
            },
          });
        } else {
          throw err;
        }
      }
    }

    if (revision) {
      await this.queueService.enqueue(revision.id);
    }

    return this.mapChangeSetDto(changeSet, revision);
  }

  /**
   * Main background analysis execution pipeline for an immutable ChangeRevision.
   */
  async processChangeRevision(changeRevisionId: string): Promise<void> {
    const revision = await this.databaseService.client.changeRevision.findUnique({
      where: { id: changeRevisionId },
      include: {
        changeSet: {
          include: {
            repositoryConnection: {
              include: {
                installation: true,
              },
            },
          },
        },
      },
    });

    if (!revision) {
      this.logger.error(`ChangeRevision '${changeRevisionId}' not found.`);
      return;
    }

    if (revision.status === 'SUCCEEDED') {
      this.logger.log(`ChangeRevision '${changeRevisionId}' is already SUCCEEDED. Skipping.`);
      return;
    }

    const { changeSet } = revision;
    const repo = changeSet.repositoryConnection;

    if (!repo.connected || !repo.installation || repo.installation.status !== 'ACTIVE') {
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'FAILED',
          stage: 'FAILED',
          failureCode: 'REPOSITORY_NOT_AVAILABLE',
          failureMessage: `Repository connection or GitHub App installation is not active.`,
          completedAt: new Date(),
        },
      });
      return;
    }

    try {
      // 1. Stage: FETCHING
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'FETCHING',
          stage: 'FETCHING',
          startedAt: revision.startedAt || new Date(),
        },
      });

      const { files } = await this.githubPullRequestService.fetchPullRequestAndFiles({
        githubInstallationId: repo.installation.githubInstallationId,
        owner: repo.ownerLogin,
        repo: repo.name,
        pullNumber: changeSet.pullRequestNumber,
      });

      const processedFiles = this.changedFileService.processFiles(files);

      const filesAdded = processedFiles.filter((f) => f.status === ChangedFileStatus.ADDED).length;
      const filesModified = processedFiles.filter((f) => f.status === ChangedFileStatus.MODIFIED).length;
      const filesDeleted = processedFiles.filter((f) => f.status === ChangedFileStatus.DELETED).length;
      const filesRenamed = processedFiles.filter((f) => f.status === ChangedFileStatus.RENAMED).length;

      await this.databaseService.client.$transaction(async (tx) => {
        await tx.changedFile.deleteMany({ where: { changeRevisionId } });
        if (processedFiles.length > 0) {
          await tx.changedFile.createMany({
            data: processedFiles.map((f) => ({
              changeRevisionId,
              oldPath: f.oldPath,
              newPath: f.newPath,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              changes: f.changes,
              patchAvailable: f.patchAvailable,
              patchTruncated: f.patchTruncated,
              binary: f.binary,
            })),
          });
        }
        await tx.changeRevision.update({
          where: { id: changeRevisionId },
          data: {
            filesAdded,
            filesModified,
            filesDeleted,
            filesRenamed,
          },
        });
      });

      // 2. Stage: WAITING_FOR_SNAPSHOTS
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'WAITING_FOR_SNAPSHOTS',
          stage: 'WAITING_FOR_SNAPSHOTS',
        },
      });

      const alignment = await this.snapshotAlignmentService.alignSnapshots({
        organizationId: revision.organizationId,
        repositoryConnectionId: revision.repositoryConnectionId,
        baseSha: revision.baseSha,
        baseRef: changeSet.baseRef,
        headSha: revision.headSha,
        headRef: changeSet.headRef,
      });

      if (alignment.status === 'WAITING') {
        this.logger.log(
          `Revision ${changeRevisionId} waiting for snapshots: ${alignment.waitingReason}. Requeuing in 5s.`,
        );
        await this.queueService.enqueueWithDelay(changeRevisionId, 5000);
        return;
      }

      // Snapshots are available
      const baseSnapshotId = alignment.baseSnapshotId!;
      const headSnapshotId = alignment.headSnapshotId!;

      // 3. Stage: ANALYZING
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'ANALYZING',
          stage: 'ANALYZING',
          baseSnapshotId,
          headSnapshotId,
        },
      });

      const twinMappings = await this.twinChangeMapperService.mapTwinChanges({
        changeRevisionId,
        baseSnapshotId,
        headSnapshotId,
      });

      const dependencyDeltas = await this.dependencyDeltaService.computeDependencyDeltas({
        changeRevisionId,
        baseSnapshotId,
        headSnapshotId,
      });

      // 4. Stage: MAPPING_TWIN -> STORING -> SUCCEEDED
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'MAPPING_TWIN',
          stage: 'MAPPING_TWIN',
        },
      });

      // Compute summary counters
      const nodesAdded = twinMappings.filter(
        (m) => m.side === 'AFTER' && m.mappingType !== 'NOT_PRESENT' && processedFiles.some((f) => f.newPath === m.path && f.status === 'ADDED'),
      ).length;
      const nodesRemoved = twinMappings.filter(
        (m) => m.side === 'BEFORE' && m.mappingType !== 'NOT_PRESENT' && processedFiles.some((f) => f.oldPath === m.path && f.status === 'DELETED'),
      ).length;
      const nodesModified = twinMappings.filter(
        (m) => m.side === 'AFTER' && m.mappingType !== 'NOT_PRESENT' && processedFiles.some((f) => (f.oldPath === m.path || f.newPath === m.path) && (f.status === 'MODIFIED' || f.status === 'RENAMED')),
      ).length;

      const edgesAdded = dependencyDeltas.filter((d) => d.deltaType === 'EDGE_ADDED').length;
      const edgesRemoved = dependencyDeltas.filter((d) => d.deltaType === 'EDGE_REMOVED').length;

      await this.databaseService.client.$transaction(async (tx) => {
        await tx.changeRevision.update({
          where: { id: changeRevisionId },
          data: {
            status: 'STORING',
            stage: 'STORING',
          },
        });

        await tx.twinChangeMapping.deleteMany({ where: { changeRevisionId } });
        await tx.dependencyDelta.deleteMany({ where: { changeRevisionId } });

        if (twinMappings.length > 0) {
          await tx.twinChangeMapping.createMany({
            data: twinMappings.map((m) => ({
              changeRevisionId,
              changedFileId: m.changedFileId,
              side: m.side,
              mappingType: m.mappingType,
              repositorySnapshotId: m.repositorySnapshotId,
              digitalTwinNodeId: m.digitalTwinNodeId,
              nodeStableKey: m.nodeStableKey,
              path: m.path,
            })),
          });
        }

        if (dependencyDeltas.length > 0) {
          await tx.dependencyDelta.createMany({
            data: dependencyDeltas.map((d) => ({
              changeRevisionId,
              deltaType: d.deltaType,
              sourceStableKey: d.sourceStableKey,
              targetStableKey: d.targetStableKey,
              edgeType: d.edgeType,
              beforeEvidence: d.beforeEvidence || {},
              afterEvidence: d.afterEvidence || {},
            })),
          });
        }

        await tx.changeRevision.update({
          where: { id: changeRevisionId },
          data: {
            status: 'SUCCEEDED',
            stage: 'COMPLETED',
            nodesAdded,
            nodesRemoved,
            nodesModified,
            edgesAdded,
            edgesRemoved,
            completedAt: new Date(),
            failureCode: null,
            failureMessage: null,
          },
        });
      });

      this.logger.log(`ChangeRevision ${changeRevisionId} successfully completed analysis.`);
    } catch (error: any) {
      this.logger.error(
        `Error processing change revision ${changeRevisionId}: ${error.message}`,
        error.stack,
      );
      await this.databaseService.client.changeRevision.update({
        where: { id: changeRevisionId },
        data: {
          status: 'FAILED',
          stage: 'FAILED',
          failureCode: 'PROCESSING_ERROR',
          failureMessage: error.message,
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  /**
   * Lists change sets for an organization with pagination and filters.
   */
  async listChangeSets(
    organizationId: string,
    query: ListChangeSetsQueryDto,
  ): Promise<ChangeSetListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.repositoryId) {
      where.repositoryConnectionId = query.repositoryId;
    }

    if (query.status) {
      where.state = query.status.toLowerCase();
    }

    if (query.search) {
      where.title = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.databaseService.client.changeSet.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          repositoryConnection: true,
          revisions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.databaseService.client.changeSet.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapChangeSetDto(item, item.revisions[0])),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves a single change set by ID.
   */
  async getChangeSet(organizationId: string, changeSetId: string): Promise<ChangeSetDto> {
    const item = await this.databaseService.client.changeSet.findFirst({
      where: { id: changeSetId, organizationId },
      include: {
        repositoryConnection: true,
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`ChangeSet '${changeSetId}' not found.`);
    }

    return this.mapChangeSetDto(item, item.revisions[0]);
  }

  /**
   * Lists revisions for a change set.
   */
  async listChangeRevisions(
    organizationId: string,
    changeSetId: string,
    query: ListChangeRevisionsQueryDto,
  ): Promise<ChangeRevisionListResponse> {
    await this.getChangeSet(organizationId, changeSetId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where = { changeSetId, organizationId };

    const [items, total] = await Promise.all([
      this.databaseService.client.changeRevision.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.databaseService.client.changeRevision.count({ where }),
    ]);

    return {
      items: items.map((rev) => this.mapChangeRevisionDto(rev)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves a single revision by ID.
   */
  async getChangeRevision(
    organizationId: string,
    changeSetId: string,
    revisionId: string,
  ): Promise<ChangeRevisionDto> {
    const revision = await this.databaseService.client.changeRevision.findFirst({
      where: {
        id: revisionId,
        changeSetId,
        organizationId,
      },
    });

    if (!revision) {
      throw new NotFoundException(`ChangeRevision '${revisionId}' not found.`);
    }

    return this.mapChangeRevisionDto(revision);
  }

  /**
   * Lists changed files for a revision.
   */
  async listChangedFiles(
    organizationId: string,
    changeSetId: string,
    revisionId: string,
    query: ListChangedFilesQueryDto,
  ): Promise<ChangedFilesResponse> {
    await this.getChangeRevision(organizationId, changeSetId, revisionId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = { changeRevisionId: revisionId };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.databaseService.client.changedFile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.databaseService.client.changedFile.count({ where }),
    ]);

    return {
      items: items.map((f) => this.mapChangedFileDto(f)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Lists twin change mappings for a revision.
   */
  async listTwinChangeMappings(
    organizationId: string,
    changeSetId: string,
    revisionId: string,
    query: ListTwinChangeMappingsQueryDto,
  ): Promise<TwinChangeMappingsResponse> {
    await this.getChangeRevision(organizationId, changeSetId, revisionId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = { changeRevisionId: revisionId };
    if (query.mappingType) {
      where.mappingType = query.mappingType;
    }

    const [items, total] = await Promise.all([
      this.databaseService.client.twinChangeMapping.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.databaseService.client.twinChangeMapping.count({ where }),
    ]);

    return {
      items: items.map((m) => this.mapTwinChangeMappingDto(m)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Lists dependency deltas for a revision.
   */
  async listDependencyDeltas(
    organizationId: string,
    changeSetId: string,
    revisionId: string,
    query: ListDependencyDeltasQueryDto,
  ): Promise<DependencyDeltaResponse> {
    await this.getChangeRevision(organizationId, changeSetId, revisionId);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = { changeRevisionId: revisionId };
    if (query.deltaType) {
      where.deltaType = query.deltaType;
    }

    const [items, total] = await Promise.all([
      this.databaseService.client.dependencyDelta.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.databaseService.client.dependencyDelta.count({ where }),
    ]);

    return {
      items: items.map((d) => this.mapDependencyDeltaDto(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // --- Mappers ---

  mapChangeSetDto(item: any, latestRevision?: any): ChangeSetDto {
    return {
      id: item.id,
      organizationId: item.organizationId,
      repositoryConnectionId: item.repositoryConnectionId,
      provider: item.provider,
      providerPullRequestId: item.providerPullRequestId,
      pullRequestNumber: item.pullRequestNumber,
      title: item.title,
      authorLogin: item.authorLogin,
      baseRef: item.baseRef,
      headRef: item.headRef,
      currentBaseSha: item.currentBaseSha,
      currentHeadSha: item.currentHeadSha,
      state: item.state,
      isDraft: item.isDraft,
      isMerged: item.isMerged,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      latestRevision: latestRevision ? this.mapChangeRevisionDto(latestRevision) : null,
      repository: item.repositoryConnection
        ? {
            id: item.repositoryConnection.id,
            name: item.repositoryConnection.name,
            fullName: item.repositoryConnection.fullName,
          }
        : undefined,
    };
  }

  mapChangeRevisionDto(rev: any): ChangeRevisionDto {
    return {
      id: rev.id,
      changeSetId: rev.changeSetId,
      organizationId: rev.organizationId,
      repositoryConnectionId: rev.repositoryConnectionId,
      baseSha: rev.baseSha,
      headSha: rev.headSha,
      baseSnapshotId: rev.baseSnapshotId,
      headSnapshotId: rev.headSnapshotId,
      analysisVersion: rev.analysisVersion,
      status: rev.status as ChangeRevisionStatus,
      stage: rev.stage,
      filesAdded: rev.filesAdded,
      filesModified: rev.filesModified,
      filesDeleted: rev.filesDeleted,
      filesRenamed: rev.filesRenamed,
      nodesAdded: rev.nodesAdded,
      nodesRemoved: rev.nodesRemoved,
      nodesModified: rev.nodesModified,
      edgesAdded: rev.edgesAdded,
      edgesRemoved: rev.edgesRemoved,
      failureCode: rev.failureCode,
      failureMessage: rev.failureMessage,
      queuedAt: rev.queuedAt.toISOString(),
      startedAt: rev.startedAt ? rev.startedAt.toISOString() : null,
      completedAt: rev.completedAt ? rev.completedAt.toISOString() : null,
      createdAt: rev.createdAt.toISOString(),
      updatedAt: rev.updatedAt.toISOString(),
    };
  }

  mapChangedFileDto(f: any): ChangedFileDto {
    return {
      id: f.id,
      changeRevisionId: f.changeRevisionId,
      oldPath: f.oldPath,
      newPath: f.newPath,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patchAvailable: f.patchAvailable,
      patchTruncated: f.patchTruncated,
      binary: f.binary,
      createdAt: f.createdAt.toISOString(),
    };
  }

  mapTwinChangeMappingDto(m: any): TwinChangeMappingDto {
    return {
      id: m.id,
      changeRevisionId: m.changeRevisionId,
      changedFileId: m.changedFileId,
      side: m.side,
      mappingType: m.mappingType,
      repositorySnapshotId: m.repositorySnapshotId,
      digitalTwinSnapshotId: m.digitalTwinSnapshotId,
      digitalTwinNodeId: m.digitalTwinNodeId,
      nodeStableKey: m.nodeStableKey,
      path: m.path,
      createdAt: m.createdAt.toISOString(),
    };
  }

  mapDependencyDeltaDto(d: any): DependencyDeltaDto {
    return {
      id: d.id,
      changeRevisionId: d.changeRevisionId,
      deltaType: d.deltaType,
      sourceStableKey: d.sourceStableKey,
      targetStableKey: d.targetStableKey,
      edgeType: d.edgeType,
      beforeEvidence: d.beforeEvidence,
      afterEvidence: d.afterEvidence,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
