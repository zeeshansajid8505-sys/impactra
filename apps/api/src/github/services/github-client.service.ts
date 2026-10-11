import {
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { GitHubConfigService } from '../config/github-config.service';

export interface GitHubInstallationMetadata {
  id: number;
  account: {
    id: number;
    login: string;
    type: string;
  };
  repository_selection: string;
  permissions: Record<string, string>;
  events: string[];
}

export interface GitHubRepositoryRaw {
  id: number;
  node_id?: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
  };
  html_url: string;
  description?: string | null;
  fork: boolean;
  default_branch: string;
  visibility?: string;
  archived?: boolean;
  disabled?: boolean;
  updated_at?: string;
}

export interface InstallationTokenResponse {
  token: string;
  expires_at: string;
  permissions?: Record<string, string>;
  repository_selection?: string;
}

@Injectable()
export class GitHubClientService {
  private readonly logger = new Logger(GitHubClientService.name);

  constructor(private readonly configService: GitHubConfigService) {}

  /**
   * Lazily creates the official @octokit/auth-app authentication strategy instance.
   * Allows application startup when GitHub App credentials are not configured.
   */
  getAppAuth(): ReturnType<typeof createAppAuth> {
    const appId = this.configService.appId?.trim();
    const privateKey = this.configService.getPrivateKey();

    if (!appId || !privateKey) {
      throw new InternalServerErrorException(
        'GitHub App ID or private key is not configured. Cannot perform authenticated GitHub operations.',
      );
    }

    return createAppAuth({
      appId,
      privateKey,
      baseUrl: this.configService.apiUrl,
    });
  }

  /**
   * Lazily creates an official Octokit client authenticated as the GitHub App.
   * Allows application startup when credentials are absent.
   */
  getAppOctokit(): Octokit {
    const appId = this.configService.appId?.trim();
    const privateKey = this.configService.getPrivateKey();

    if (!appId || !privateKey) {
      throw new InternalServerErrorException(
        'GitHub App ID or private key is not configured. Cannot create GitHub App Octokit client.',
      );
    }

    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        baseUrl: this.configService.apiUrl,
      },
      baseUrl: this.configService.apiUrl,
    });
  }

  /**
   * Creates an official Octokit client authenticated with an installation access token.
   */
  getInstallationOctokit(installationToken: string): Octokit {
    return new Octokit({
      auth: installationToken,
      baseUrl: this.configService.apiUrl,
    });
  }

  /**
   * Fetches installation metadata from GitHub using official App authentication.
   */
  async getInstallation(githubInstallationId: string): Promise<GitHubInstallationMetadata> {
    const installationIdNum = parseInt(githubInstallationId, 10);
    if (isNaN(installationIdNum)) {
      throw new InternalServerErrorException(
        `Invalid GitHub installation ID: ${githubInstallationId}`,
      );
    }

    try {
      const octokit = this.getAppOctokit();
      const response = await octokit.rest.apps.getInstallation({
        installation_id: installationIdNum,
      });

      const data = response.data;
      return {
        id: data.id,
        account: {
          id: data.account?.id || 0,
          login: (data.account as any)?.login || 'unknown',
          type: (data.account as any)?.type || 'Organization',
        },
        repository_selection: data.repository_selection,
        permissions: (data.permissions as Record<string, string>) || {},
        events: data.events || [],
      };
    } catch (err: unknown) {
      this.handleOctokitError(err, `getInstallation(${githubInstallationId})`);
    }
  }

  /**
   * Exchanges App authentication for an installation access token using @octokit/auth-app.
   */
  async createInstallationToken(
    githubInstallationId: string,
  ): Promise<InstallationTokenResponse> {
    const installationIdNum = parseInt(githubInstallationId, 10);
    if (isNaN(installationIdNum)) {
      throw new InternalServerErrorException(
        `Invalid GitHub installation ID: ${githubInstallationId}`,
      );
    }

    try {
      const auth = this.getAppAuth();
      const authResult = await auth({
        type: 'installation',
        installationId: installationIdNum,
      });

      return {
        token: authResult.token,
        expires_at: authResult.expiresAt,
        permissions: authResult.permissions,
        repository_selection: authResult.repositorySelection,
      };
    } catch (err: unknown) {
      this.handleOctokitError(err, `createInstallationToken(${githubInstallationId})`);
    }
  }

  /**
   * Lists all repositories accessible to this installation using official Octokit pagination.
   */
  async listInstallationRepositories(
    installationToken: string,
  ): Promise<GitHubRepositoryRaw[]> {
    try {
      const octokit = this.getInstallationOctokit(installationToken);
      const repos = await octokit.paginate(
        octokit.rest.apps.listReposAccessibleToInstallation,
        {
          per_page: 100,
        },
      );

      return (repos as any[]).map((repo) => ({
        id: repo.id,
        node_id: repo.node_id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        owner: {
          login: repo.owner?.login || '',
          id: repo.owner?.id || 0,
        },
        html_url: repo.html_url,
        description: repo.description ?? null,
        fork: Boolean(repo.fork),
        default_branch: repo.default_branch || 'main',
        visibility: repo.visibility,
        archived: Boolean(repo.archived),
        disabled: Boolean(repo.disabled),
        updated_at: repo.updated_at,
      }));
    } catch (err: unknown) {
      this.handleOctokitError(err, 'listInstallationRepositories');
    }
  }

  /**
   * Sanitizes and maps Octokit/auth-app errors into safe application exceptions without leaking credentials.
   */
  private handleOctokitError(err: unknown, operation: string): never {
    const status = (err as any)?.status || (err as any)?.statusCode;
    const githubRequestId =
      (err as any)?.response?.headers?.['x-github-request-id'] || 'unknown';
    const message = (err as any)?.message || String(err);

    this.logger.error(
      `GitHub API error during ${operation} [status=${status ?? 'unknown'}, requestId=${githubRequestId}]: ${message}`,
    );

    if (status === 401 || status === 403) {
      throw new UnauthorizedException(
        `GitHub App authentication rejected during ${operation}`,
      );
    }

    throw new InternalServerErrorException(
      `GitHub API error during ${operation}${status ? ` (status ${status})` : ''}`,
    );
  }
}
