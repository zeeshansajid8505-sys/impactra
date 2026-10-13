import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitHubClientService } from '../../github/services/github-client.service';
import { RawPullRequestFile } from '../types/change.types';

export interface GitHubPullRequestDetails {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  mergedAt: string | null;
  baseRef: string;
  baseSha: string;
  headRef: string;
  headSha: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  sourceUrl: string;
  additions: number;
  deletions: number;
  changedFilesCount: number;
}

@Injectable()
export class GithubPullRequestService {
  private readonly logger = new Logger(GithubPullRequestService.name);
  private readonly maxFiles: number;

  constructor(
    @Inject(forwardRef(() => GitHubClientService))
    private readonly githubClientService: GitHubClientService,
    private readonly configService: ConfigService,
  ) {
    this.maxFiles = this.configService.get<number>('app.changes.maxFiles', 1000);
  }

  /**
   * Fetches pull request metadata and changed files using GitHub App installation authentication.
   * Derives real pull request state strictly from authenticated GitHub API calls.
   */
  async fetchPullRequestAndFiles(params: {
    githubInstallationId: string;
    owner: string;
    repo: string;
    pullNumber: number;
  }): Promise<{ pullRequest: GitHubPullRequestDetails; files: RawPullRequestFile[] }> {
    const { githubInstallationId, owner, repo, pullNumber } = params;

    try {
      const { token } = await this.githubClientService.createInstallationToken(githubInstallationId);
      const octokit = this.githubClientService.getInstallationOctokit(token);

      // 1. Fetch Pull Request details
      const prResponse = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      const pr = prResponse.data;
      const pullRequest: GitHubPullRequestDetails = {
        number: pr.number,
        title: pr.title || `PR #${pr.number}`,
        body: pr.body || null,
        state: pr.state === 'closed' ? 'closed' : 'open',
        merged: Boolean(pr.merged_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at).toISOString() : null,
        baseRef: pr.base.ref,
        baseSha: pr.base.sha,
        headRef: pr.head.ref,
        headSha: pr.head.sha,
        authorUsername: pr.user?.login || 'unknown',
        authorAvatarUrl: pr.user?.avatar_url || null,
        sourceUrl: pr.html_url || `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFilesCount: pr.changed_files || 0,
      };

      // 2. Fetch Changed Files with pagination
      const files: RawPullRequestFile[] = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;

      while (hasMore && files.length < this.maxFiles) {
        const filesResponse = await octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber,
          per_page: perPage,
          page,
        });

        const batch = filesResponse.data as RawPullRequestFile[];
        if (batch.length === 0) {
          hasMore = false;
        } else {
          for (const item of batch) {
            if (files.length >= this.maxFiles) {
              this.logger.warn(
                `PR ${owner}/${repo}#${pullNumber} exceeds max file limit (${this.maxFiles}). Remaining files truncated.`,
              );
              hasMore = false;
              break;
            }
            files.push(item);
          }
          if (batch.length < perPage) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      return { pullRequest, files };
    } catch (error: any) {
      if (error?.status === 404) {
        throw new NotFoundException(
          `Pull request #${pullNumber} not found on repository '${owner}/${repo}'.`,
        );
      }
      this.logger.error(`Error fetching PR #${pullNumber} from GitHub: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to fetch PR #${pullNumber} from GitHub: ${error.message}`,
      );
    }
  }
}
