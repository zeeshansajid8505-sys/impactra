import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GitHubClientService } from './github-client.service';
import { GitHubInstallationService } from './github-installation.service';
import { ListRepositoriesQueryDto } from '../dto/github.dto';
import {
  RepositoryConnectionDto,
  RepositoryListResponse,
  RepositorySyncResponse,
} from '@impactra/shared';

@Injectable()
export class GitHubRepositoryService {
  private readonly logger = new Logger(GitHubRepositoryService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly clientService: GitHubClientService,
    private readonly installationService: GitHubInstallationService,
  ) {}

  /**
   * Synchronizes repository metadata from GitHub for an organization's installation.
   * Handles pagination, creates new repositories, updates existing ones, and marks
   * unlisted repositories as unavailable without deleting historical records.
   */
  async syncRepositories(organizationId: string): Promise<RepositorySyncResponse> {
    const installation = await this.databaseService.client.gitHubInstallation.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
    });

    if (!installation) {
      throw new BadRequestException(
        'Cannot sync repositories: No active GitHub App installation found for this organization.',
      );
    }

    const token = await this.installationService.getInstallationToken(
      installation.githubInstallationId,
    );

    const remoteRepos = await this.clientService.listInstallationRepositories(token);
    const remoteRepoIds = new Set<string>();
    const now = new Date();

    let syncedCount = 0;

    for (const repo of remoteRepos) {
      const githubRepositoryId = String(repo.id);
      remoteRepoIds.add(githubRepositoryId);

      await this.databaseService.client.repositoryConnection.upsert({
        where: {
          organizationId_githubRepositoryId: {
            organizationId,
            githubRepositoryId,
          },
        },
        update: {
          ownerLogin: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch || 'main',
          isPrivate: Boolean(repo.private),
          visibility: repo.visibility || (repo.private ? 'private' : 'public'),
          archived: Boolean(repo.archived),
          disabled: Boolean(repo.disabled),
          fork: Boolean(repo.fork),
          htmlUrl: repo.html_url,
          available: true,
          lastSyncedAt: now,
          updatedAt: now,
        },
        create: {
          organizationId,
          githubInstallationId: installation.githubInstallationId,
          githubRepositoryId,
          ownerLogin: repo.owner.login,
          name: repo.name,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch || 'main',
          isPrivate: Boolean(repo.private),
          visibility: repo.visibility || (repo.private ? 'private' : 'public'),
          archived: Boolean(repo.archived),
          disabled: Boolean(repo.disabled),
          fork: Boolean(repo.fork),
          htmlUrl: repo.html_url,
          available: true,
          connected: false,
          lastSyncedAt: now,
        },
      });

      syncedCount++;
    }

    // Mark repositories not in current sync as unavailable
    const unavailableResult = await this.databaseService.client.repositoryConnection.updateMany({
      where: {
        organizationId,
        githubInstallationId: installation.githubInstallationId,
        available: true,
        githubRepositoryId: {
          notIn: Array.from(remoteRepoIds),
        },
      },
      data: {
        available: false,
        lastSyncedAt: now,
        updatedAt: now,
      },
    });

    // Update installation lastSyncedAt
    await this.databaseService.client.gitHubInstallation.update({
      where: { id: installation.id },
      data: { lastSyncedAt: now },
    });

    this.logger.log(
      `Synchronized ${syncedCount} repositories for org ${organizationId}. Marked ${unavailableResult.count} as unavailable.`,
    );

    return {
      syncedCount,
      availableCount: syncedCount,
      removedCount: unavailableResult.count,
    };
  }

  /**
   * Lists repositories for an organization with optional filtering and pagination.
   */
  async listRepositories(
    organizationId: string,
    query: ListRepositoriesQueryDto,
  ): Promise<RepositoryListResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (query.connected !== undefined) {
      where.connected = query.connected;
    }

    if (query.available !== undefined) {
      where.available = query.available;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { ownerLogin: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, repos] = await Promise.all([
      this.databaseService.client.repositoryConnection.count({ where }),
      this.databaseService.client.repositoryConnection.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ connected: 'desc' }, { fullName: 'asc' }],
      }),
    ]);

    return {
      repositories: repos.map((r) => this.mapToDto(r)),
      total,
    };
  }

  /**
   * Explicitly connects an onboarded repository for analysis.
   */
  async connectRepository(
    organizationId: string,
    repositoryId: string,
  ): Promise<RepositoryConnectionDto> {
    const repo = await this.findRepoByIdOrGithubId(organizationId, repositoryId);

    if (!repo) {
      throw new NotFoundException('Repository connection not found in this organization.');
    }

    if (!repo.available) {
      throw new BadRequestException(
        'Cannot connect repository: It is currently marked unavailable in GitHub. Run a repository sync first.',
      );
    }

    const updated = await this.databaseService.client.repositoryConnection.update({
      where: { id: repo.id },
      data: {
        connected: true,
        connectedAt: new Date(),
        disconnectedAt: null,
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Explicitly disconnects an onboarded repository.
   */
  async disconnectRepository(
    organizationId: string,
    repositoryId: string,
  ): Promise<RepositoryConnectionDto> {
    const repo = await this.findRepoByIdOrGithubId(organizationId, repositoryId);

    if (!repo) {
      throw new NotFoundException('Repository connection not found in this organization.');
    }

    const updated = await this.databaseService.client.repositoryConnection.update({
      where: { id: repo.id },
      data: {
        connected: false,
        disconnectedAt: new Date(),
      },
    });

    return this.mapToDto(updated);
  }

  private async findRepoByIdOrGithubId(organizationId: string, identifier: string) {
    return this.databaseService.client.repositoryConnection.findFirst({
      where: {
        organizationId,
        OR: [{ id: identifier }, { githubRepositoryId: identifier }],
      },
    });
  }

  private mapToDto(repo: any): RepositoryConnectionDto {
    return {
      id: repo.id,
      organizationId: repo.organizationId,
      githubInstallationId: repo.githubInstallationId,
      githubRepositoryId: repo.githubRepositoryId,
      nodeId: null,
      ownerLogin: repo.ownerLogin,
      name: repo.name,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      isPrivate: repo.isPrivate,
      visibility: repo.visibility,
      archived: repo.archived,
      disabled: repo.disabled,
      fork: repo.fork,
      htmlUrl: repo.htmlUrl || `https://github.com/${repo.fullName}`,
      available: repo.available,
      connected: repo.connected,
      connectedAt: repo.connectedAt ? new Date(repo.connectedAt).toISOString() : null,
      disconnectedAt: repo.disconnectedAt ? new Date(repo.disconnectedAt).toISOString() : null,
      githubUpdatedAt: null,
      lastSyncedAt: repo.lastSyncedAt ? new Date(repo.lastSyncedAt).toISOString() : null,
      createdAt: repo.createdAt instanceof Date ? repo.createdAt.toISOString() : repo.createdAt,
      updatedAt: repo.updatedAt instanceof Date ? repo.updatedAt.toISOString() : repo.updatedAt,
    };
  }
}
