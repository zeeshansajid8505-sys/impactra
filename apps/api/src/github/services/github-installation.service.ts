import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { CacheService } from '../../cache/cache.service';
import { GitHubConfigService } from '../config/github-config.service';
import { GitHubClientService } from './github-client.service';
import { GitHubInstallationStateService } from './github-installation-state.service';
import {
  GitHubInstallationDto,
  GitHubInstallationStatus,
  GitHubInstallationStartResponse,
} from '@impactra/shared';

@Injectable()
export class GitHubInstallationService {
  private readonly logger = new Logger(GitHubInstallationService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly configService: GitHubConfigService,
    private readonly clientService: GitHubClientService,
    private readonly stateService: GitHubInstallationStateService,
  ) {}

  /**
   * Initiates the GitHub App installation flow for an organization.
   */
  async startInstallation(
    organizationId: string,
    userId: string,
  ): Promise<GitHubInstallationStartResponse & { state: string }> {
    if (!this.configService.isConfigured() || !this.configService.appSlug) {
      throw new BadRequestException(
        'GitHub App integration is not configured on this Impactra instance. Please provide GITHUB_APP_ID, GITHUB_APP_SLUG, and GITHUB_APP_PRIVATE_KEY_BASE64.',
      );
    }

    const state = await this.stateService.generateState(organizationId, userId);
    const installUrl = this.configService.buildInstallUrl(state);

    if (!installUrl) {
      throw new BadRequestException('Failed to generate GitHub App installation URL.');
    }

    return {
      installUrl,
      state,
    };
  }

  /**
   * Handles GitHub installation callback after user completes installation on GitHub.
   * Atomically validates ownership and consumes state token, ensuring state is not burned if user is mismatched.
   */
  async handleCallback(
    state: string,
    rawInstallationId: string,
    currentUserId: string,
  ): Promise<{ installation: GitHubInstallationDto; organizationId: string }> {
    if (!rawInstallationId) {
      throw new BadRequestException('Missing installation_id in GitHub callback.');
    }

    if (!currentUserId) {
      throw new BadRequestException('Authenticated user ID is required for installation callback.');
    }

    const githubInstallationId = String(rawInstallationId).trim();

    // 1. Consume state atomically with user ownership validation
    const { organizationId } = await this.stateService.consumeStateForUser(state, currentUserId);

    // 3. Conflict detection: Ensure installation is not already bound to another tenant
    const existing = await this.databaseService.client.gitHubInstallation.findUnique({
      where: { githubInstallationId },
    });

    if (existing && existing.organizationId !== organizationId) {
      this.logger.warn(
        `Installation conflict: GitHub installation ${githubInstallationId} is already linked to org ${existing.organizationId}, but org ${organizationId} attempted to bind it.`,
      );
      throw new ConflictException(
        'This GitHub installation is already linked to another organization.',
      );
    }

    // 3. Authoritative lookup from GitHub API if configured
    let accountId = githubInstallationId;
    let accountLogin = 'unknown';
    let accountType = 'Organization';
    let repositorySelection = 'all';
    let permissions: Record<string, string> = {};
    let events: string[] = [];

    if (this.configService.isConfigured()) {
      try {
        const metadata = await this.clientService.getInstallation(githubInstallationId);
        accountId = String(metadata.account?.id || githubInstallationId);
        accountLogin = metadata.account?.login || 'unknown';
        accountType = metadata.account?.type || 'Organization';
        repositorySelection = metadata.repository_selection || 'all';
        permissions = metadata.permissions || {};
        events = metadata.events || [];
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Could not fetch live metadata for installation ${githubInstallationId}: ${msg}. Proceeding with default values.`,
        );
      }
    }

    // 4. Upsert GitHubInstallation record
    const installation = await this.databaseService.client.gitHubInstallation.upsert({
      where: { githubInstallationId },
      update: {
        organizationId,
        accountId,
        accountLogin,
        accountType,
        repositorySelection,
        permissions,
        events,
        status: 'ACTIVE',
        suspendedAt: null,
        updatedAt: new Date(),
      },
      create: {
        organizationId,
        githubInstallationId,
        accountId,
        accountLogin,
        accountType,
        repositorySelection,
        permissions,
        events,
        status: 'ACTIVE',
      },
    });

    // Invalidate cached token
    await this.evictInstallationToken(githubInstallationId);

    return {
      installation: this.mapToDto(installation),
      organizationId,
    };
  }

  /**
   * Retrieves the current active/connected installation for an organization.
   */
  async getInstallationForOrganization(
    organizationId: string,
  ): Promise<GitHubInstallationDto | null> {
    const installation = await this.databaseService.client.gitHubInstallation.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    return installation ? this.mapToDto(installation) : null;
  }

  /**
   * Disconnects an organization's GitHub installation.
   * Evicts cached tokens and marks linked repositories as disconnected and unavailable.
   */
  async disconnectInstallation(organizationId: string): Promise<{ disconnected: boolean }> {
    const installation = await this.databaseService.client.gitHubInstallation.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
    });

    if (!installation) {
      throw new NotFoundException('No active GitHub installation found for this organization.');
    }

    const now = new Date();

    await this.databaseService.client.$transaction([
      this.databaseService.client.gitHubInstallation.update({
        where: { id: installation.id },
        data: {
          status: 'DISCONNECTED',
          updatedAt: now,
        },
      }),
      this.databaseService.client.repositoryConnection.updateMany({
        where: {
          organizationId,
          githubInstallationId: installation.githubInstallationId,
        },
        data: {
          connected: false,
          available: false,
          disconnectedAt: now,
          updatedAt: now,
        },
      }),
    ]);

    await this.evictInstallationToken(installation.githubInstallationId);

    return { disconnected: true };
  }

  /**
   * Retrieves an installation access token, with Redis caching and 90s safety buffer.
   */
  async getInstallationToken(githubInstallationId: string): Promise<string> {
    const cacheKey = `impactra:github:inst-token:${githubInstallationId}`;
    const redis = this.cacheService.redisClient;

    if (redis && redis.status === 'ready') {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return cached;
      } catch (err: unknown) {
        this.logger.debug(`Redis token lookup skipped: ${err}`);
      }
    }

    const tokenResponse = await this.clientService.createInstallationToken(githubInstallationId);
    const token = tokenResponse.token;

    // Cache with safety buffer (strictly below provider expiry with 90s safety margin)
    if (redis && redis.status === 'ready' && tokenResponse.expires_at) {
      try {
        const expiresAtMs = new Date(tokenResponse.expires_at).getTime();
        if (!isNaN(expiresAtMs) && expiresAtMs > Date.now() + 90000) {
          const providerTtl = Math.floor((expiresAtMs - Date.now()) / 1000);
          const ttlSeconds = providerTtl - 90;
          if (ttlSeconds >= 60) {
            await redis.setex(cacheKey, ttlSeconds, token);
          }
        }
      } catch (err: unknown) {
        this.logger.debug(`Redis token write skipped: ${err}`);
      }
    }

    return token;
  }

  /**
   * Evicts the cached installation token from Redis.
   */
  async evictInstallationToken(githubInstallationId: string): Promise<void> {
    const cacheKey = `impactra:github:inst-token:${githubInstallationId}`;
    const redis = this.cacheService.redisClient;
    if (redis && redis.status === 'ready') {
      try {
        await redis.del(cacheKey);
      } catch (err: unknown) {
        this.logger.debug(`Redis token eviction skipped: ${err}`);
      }
    }
  }

  private mapToDto(inst: any): GitHubInstallationDto {
    return {
      id: inst.id,
      organizationId: inst.organizationId,
      githubInstallationId: inst.githubInstallationId,
      accountId: inst.accountId,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
      status: inst.status as GitHubInstallationStatus,
      installedAt: inst.installedAt instanceof Date ? inst.installedAt.toISOString() : inst.installedAt,
      suspendedAt: inst.suspendedAt ? new Date(inst.suspendedAt).toISOString() : null,
      lastSyncedAt: inst.lastSyncedAt ? new Date(inst.lastSyncedAt).toISOString() : null,
      createdAt: inst.createdAt instanceof Date ? inst.createdAt.toISOString() : inst.createdAt,
      updatedAt: inst.updatedAt instanceof Date ? inst.updatedAt.toISOString() : inst.updatedAt,
    };
  }
}
