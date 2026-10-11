import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GitHubClientService } from '../../github/services/github-client.service';
import { GitHubInstallationService } from '../../github/services/github-installation.service';
import { GitHubConfigService } from '../../github/config/github-config.service';
import { ArchiveSecurityValidator } from '../security/archive-security.validator';

export interface RepositorySourceArchive {
  archiveBuffer: Buffer;
  commitSha: string;
  ref: string;
  sourceProvider: 'github' | 'fixture';
}

@Injectable()
export class RepositorySourceProvider {
  private readonly logger = new Logger(RepositorySourceProvider.name);
  private readonly fixtureArchives = new Map<string, { buffer: Buffer; commitSha: string }>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly githubClientService: GitHubClientService,
    private readonly githubInstallationService: GitHubInstallationService,
    private readonly githubConfigService: GitHubConfigService,
    private readonly securityValidator: ArchiveSecurityValidator,
  ) {}

  /**
   * Registers a test fixture archive in memory (useful for testing and offline environments).
   */
  registerFixtureArchive(key: string, buffer: Buffer, commitSha: string): void {
    this.fixtureArchives.set(key, { buffer, commitSha });
  }

  /**
   * Clears registered fixture archives.
   */
  clearFixtureArchives(): void {
    this.fixtureArchives.clear();
  }

  /**
   * Fetches source archive for a repository connection using server-derived identity.
   */
  async fetchSourceArchive(params: {
    organizationId: string;
    repositoryConnectionId: string;
    ref?: string;
    commitSha?: string;
  }): Promise<RepositorySourceArchive> {
    const { organizationId, repositoryConnectionId, ref: requestedRef, commitSha: requestedSha } = params;

    // 1. Strictly look up repository connection within organization boundary
    const repository = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        id: repositoryConnectionId,
        organizationId,
      },
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository connection '${repositoryConnectionId}' not found in organization '${organizationId}'.`,
      );
    }

    if (!repository.connected) {
      throw new BadRequestException(
        `Repository '${repository.fullName}' is not connected. Connect the repository before triggering ingestion.`,
      );
    }

    const targetRef = (requestedRef || repository.defaultBranch || 'main').trim();

    // 2. Check for fixture archive first (in tests/mocks)
    const fixtureKey = `${repository.fullName}:${requestedSha || targetRef}`;
    const genericFixtureKey = `${repository.fullName}`;
    const fixture =
      this.fixtureArchives.get(fixtureKey) || this.fixtureArchives.get(genericFixtureKey);

    if (fixture) {
      this.logger.log(`Using registered fixture archive for ${repository.fullName}`);
      return {
        archiveBuffer: fixture.buffer,
        commitSha: requestedSha || fixture.commitSha,
        ref: targetRef,
        sourceProvider: 'fixture',
      };
    }

    // 3. GitHub live acquisition
    if (!this.githubConfigService.isConfigured()) {
      throw new BadRequestException(
        'GitHub App integration is not configured on this instance. Configure GITHUB_APP_ID, GITHUB_APP_SLUG, and GITHUB_APP_PRIVATE_KEY_BASE64 to download repository source.',
      );
    }

    try {
      const token = await this.githubInstallationService.getInstallationToken(
        repository.githubInstallationId,
      );
      const octokit = this.githubClientService.getInstallationOctokit(token);

      // Resolve exact commit SHA
      let resolvedSha = requestedSha;
      if (!resolvedSha) {
        try {
          const commitResponse = await octokit.rest.repos.getCommit({
            owner: repository.ownerLogin,
            repo: repository.name,
            ref: targetRef,
          });
          resolvedSha = commitResponse.data.sha;
        } catch (commitErr: unknown) {
          this.logger.warn(
            `Could not resolve commit for ref '${targetRef}' via getCommit: ${commitErr}. Attempting tarball download directly.`,
          );
        }
      }

      // Download tarball archive
      const archiveResponse = await octokit.rest.repos.downloadTarballArchive({
        owner: repository.ownerLogin,
        repo: repository.name,
        ref: resolvedSha || targetRef,
      });

      const rawData = archiveResponse.data;
      const maxArchiveBytes = this.securityValidator.getLimits().maxArchiveBytes;
      let archiveBuffer: Buffer;

      if (rawData && typeof (rawData as any)[Symbol.asyncIterator] === 'function') {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        for await (const chunk of rawData as any) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buf.length;
          if (totalBytes > maxArchiveBytes) {
            throw new BadRequestException(
              `Repository archive stream size (${totalBytes} bytes) exceeds maximum allowable limit of ${maxArchiveBytes} bytes.`,
            );
          }
          chunks.push(buf);
        }
        archiveBuffer = Buffer.concat(chunks);
      } else if (Buffer.isBuffer(rawData)) {
        archiveBuffer = rawData;
      } else if (rawData instanceof ArrayBuffer) {
        archiveBuffer = Buffer.from(rawData);
      } else if (typeof rawData === 'string') {
        archiveBuffer = Buffer.from(rawData, 'binary');
      } else {
        // Fallback for other iterables
        archiveBuffer = Buffer.from(rawData as any);
      }

      if (archiveBuffer.length > maxArchiveBytes) {
        throw new BadRequestException(
          `Repository archive size (${archiveBuffer.length} bytes) exceeds maximum allowable limit of ${maxArchiveBytes} bytes.`,
        );
      }

      if (!resolvedSha) {
        // Fallback to SHA-256 of archive if commit SHA could not be resolved from GitHub API
        const crypto = await import('crypto');
        resolvedSha = crypto.createHash('sha256').update(archiveBuffer).digest('hex').slice(0, 40);
      }

      return {
        archiveBuffer,
        commitSha: resolvedSha,
        ref: targetRef,
        sourceProvider: 'github',
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to download repository archive from GitHub: ${msg}`);
      throw new InternalServerErrorException(
        `Failed to acquire repository source archive from GitHub: ${msg}`,
      );
    }
  }
}
