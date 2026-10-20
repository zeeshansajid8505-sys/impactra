import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GitHubInstallationService } from '../../github/services/github-installation.service';
import { GitHubClientService } from '../../github/services/github-client.service';
import { GitHubCheckWirePayload } from './github-check-payload-builder.service';

export interface CheckRunResult {
  id: number;
  html_url?: string;
}

export class GitHubCheckError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'GitHubCheckError';
  }
}

@Injectable()
export class GitHubCheckClientService {
  private readonly logger = new Logger(GitHubCheckClientService.name);

  constructor(
    private readonly installationService: GitHubInstallationService,
    private readonly clientService: GitHubClientService,
  ) {}

  /**
   * Creates a new GitHub Check Run using installation-scoped Octokit client.
   */
  async createCheckRun(
    githubInstallationId: string,
    owner: string,
    repo: string,
    payload: GitHubCheckWirePayload,
  ): Promise<CheckRunResult> {
    try {
      const token = await this.installationService.getInstallationToken(
        githubInstallationId,
      );
      const octokit = this.clientService.getInstallationOctokit(token);

      const response = await octokit.rest.checks.create({
        owner,
        repo,
        name: payload.name,
        head_sha: payload.head_sha,
        status: payload.status,
        conclusion: payload.conclusion,
        completed_at: payload.completed_at,
        external_id: payload.external_id,
        details_url: payload.details_url,
        output: payload.output,
      });

      return {
        id: response.data.id,
        html_url:
          'html_url' in response.data && typeof response.data.html_url === 'string'
            ? response.data.html_url
            : undefined,
      };
    } catch (err: unknown) {
      throw this.sanitizeGitHubError(err, `createCheckRun(${owner}/${repo})`);
    }
  }

  /**
   * Updates an existing GitHub Check Run.
   */
  async updateCheckRun(
    githubInstallationId: string,
    owner: string,
    repo: string,
    checkRunId: number,
    payload: GitHubCheckWirePayload,
  ): Promise<CheckRunResult> {
    try {
      const token = await this.installationService.getInstallationToken(
        githubInstallationId,
      );
      const octokit = this.clientService.getInstallationOctokit(token);

      const response = await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        name: payload.name,
        status: payload.status,
        conclusion: payload.conclusion,
        completed_at: payload.completed_at,
        external_id: payload.external_id,
        details_url: payload.details_url,
        output: payload.output,
      });

      return {
        id: response.data.id,
        html_url:
          'html_url' in response.data && typeof response.data.html_url === 'string'
            ? response.data.html_url
            : undefined,
      };
    } catch (err: unknown) {
      throw this.sanitizeGitHubError(
        err,
        `updateCheckRun(${owner}/${repo}, ${checkRunId})`,
      );
    }
  }

  /**
   * Sanitizes Octokit errors so that no tokens, credentials, or private headers leak into logs or exceptions.
   */
  private sanitizeGitHubError(err: unknown, context: string): GitHubCheckError {
    const errorObj =
      typeof err === 'object' && err !== null
        ? (err as Record<string, unknown>)
        : null;
    const status =
      typeof errorObj?.status === 'number'
        ? errorObj.status
        : typeof errorObj?.statusCode === 'number'
          ? (errorObj.statusCode as number)
          : 500;
    const rawMessage =
      typeof errorObj?.message === 'string'
        ? errorObj.message
        : String(err);

    let code = 'GITHUB_CHECK_ERROR';
    let safeMessage = `GitHub Checks operation failed during ${context}.`;

    if (status === 401 || status === 403) {
      code = 'GITHUB_CHECK_PERMISSION_DENIED';
      safeMessage =
        'GitHub App lacks required permissions for Checks (Checks: Read & write required).';
    } else if (status === 404) {
      code = 'GITHUB_CHECK_NOT_FOUND';
      safeMessage = 'Target repository or Check Run was not found on GitHub.';
    } else if (status === 422) {
      code = 'GITHUB_CHECK_VALIDATION_FAILED';
      safeMessage = `GitHub rejected the Check payload: ${rawMessage.slice(0, 150)}`;
    } else if (status === 429) {
      code = 'GITHUB_RATE_LIMITED';
      safeMessage = 'GitHub API rate limit exceeded. Retry later.';
    } else if (status >= 500) {
      code = 'GITHUB_API_ERROR';
      safeMessage = 'GitHub service temporarily unavailable.';
    }

    this.logger.warn(`[${code}] ${safeMessage} (HTTP ${status})`);
    return new GitHubCheckError(code, safeMessage, status);
  }
}
