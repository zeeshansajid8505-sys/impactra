import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubPullRequestService } from './github-pull-request.service';
import { GitHubClientService } from '../../github/services/github-client.service';

describe('GithubPullRequestService', () => {
  let service: GithubPullRequestService;
  let mockGithubClientService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockGithubClientService = {
      createInstallationToken: jest.fn().mockResolvedValue({ token: 'test-token' }),
      getInstallationOctokit: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue(100),
    };

    service = new GithubPullRequestService(
      mockGithubClientService as GitHubClientService,
      mockConfigService as ConfigService,
    );
  });

  it('regression: proves production service contains no fixture registry or backdoor', () => {
    expect((service as any).registerFixture).toBeUndefined();
    expect((service as any).clearFixtures).toBeUndefined();
    expect((service as any).fixtures).toBeUndefined();
  });

  it('fetches pull request metadata and changed files using authenticated Octokit', async () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              number: 42,
              title: 'Real PR title',
              body: 'Real PR body',
              state: 'open',
              merged_at: null,
              base: { ref: 'main', sha: 'b-sha-real' },
              head: { ref: 'feature', sha: 'h-sha-real' },
              user: { login: 'real-user', avatar_url: 'https://avatar.com/1' },
              html_url: 'https://github.com/org/repo/pull/42',
              additions: 15,
              deletions: 3,
              changed_files: 1,
            },
          }),
          listFiles: jest.fn().mockResolvedValue({
            data: [
              {
                sha: 'f1',
                filename: 'src/index.ts',
                status: 'modified',
                additions: 10,
                deletions: 2,
                changes: 12,
                patch: '@@ -1 +1 @@',
              },
            ],
          }),
        },
      },
    };

    mockGithubClientService.getInstallationOctokit.mockReturnValue(mockOctokit);

    const result = await service.fetchPullRequestAndFiles({
      githubInstallationId: '12345',
      owner: 'org',
      repo: 'repo',
      pullNumber: 42,
    });

    expect(mockGithubClientService.createInstallationToken).toHaveBeenCalledWith('12345');
    expect(mockGithubClientService.getInstallationOctokit).toHaveBeenCalledWith('test-token');
    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'repo',
      pull_number: 42,
    });
    expect(result.pullRequest.number).toBe(42);
    expect(result.pullRequest.baseSha).toBe('b-sha-real');
    expect(result.pullRequest.headSha).toBe('h-sha-real');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].filename).toBe('src/index.ts');
  });

  it('paginates files until all files fetched or maxFiles reached', async () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              number: 55,
              title: 'Big PR',
              body: null,
              state: 'open',
              base: { ref: 'main', sha: 'b1' },
              head: { ref: 'head', sha: 'h1' },
            },
          }),
          listFiles: jest
            .fn()
            // Page 1: 100 items
            .mockResolvedValueOnce({
              data: Array.from({ length: 100 }, (_, i) => ({
                sha: `sha-${i}`,
                filename: `file-${i}.ts`,
                status: 'added',
                additions: 1,
                deletions: 0,
                changes: 1,
              })),
            })
            // Page 2: 20 items (less than 100 -> end of pagination)
            .mockResolvedValueOnce({
              data: Array.from({ length: 20 }, (_, i) => ({
                sha: `sha-2-${i}`,
                filename: `file-2-${i}.ts`,
                status: 'added',
                additions: 1,
                deletions: 0,
                changes: 1,
              })),
            }),
        },
      },
    };

    mockConfigService.get = jest.fn().mockReturnValue(200); // allow 200 files
    service = new GithubPullRequestService(
      mockGithubClientService as GitHubClientService,
      mockConfigService as ConfigService,
    );
    mockGithubClientService.getInstallationOctokit.mockReturnValue(mockOctokit);

    const result = await service.fetchPullRequestAndFiles({
      githubInstallationId: '12345',
      owner: 'org',
      repo: 'repo',
      pullNumber: 55,
    });

    expect(result.files).toHaveLength(120);
    expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundException on 404 from GitHub', async () => {
    const notFoundError: any = new Error('Not Found');
    notFoundError.status = 404;

    const mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn().mockRejectedValue(notFoundError),
        },
      },
    };
    mockGithubClientService.getInstallationOctokit.mockReturnValue(mockOctokit);

    await expect(
      service.fetchPullRequestAndFiles({
        githubInstallationId: '12345',
        owner: 'org',
        repo: 'repo',
        pullNumber: 999,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
