import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RepositorySourceProvider } from './repository-source-provider.service';
import { ArchiveSecurityValidator } from '../security/archive-security.validator';

describe('RepositorySourceProvider', () => {
  let provider: RepositorySourceProvider;
  let mockDb: any;
  let mockGithubClient: any;
  let mockGithubInstallation: any;
  let mockGithubConfig: any;
  let mockValidator: any;

  beforeEach(() => {
    mockDb = {
      client: {
        repositoryConnection: {
          findFirst: jest.fn(),
        },
      },
    };

    mockGithubClient = {
      getInstallationOctokit: jest.fn(),
    };

    mockGithubInstallation = {
      getInstallationToken: jest.fn().mockResolvedValue('ghs_testToken'),
    };

    mockGithubConfig = {
      isConfigured: jest.fn().mockReturnValue(true),
    };

    mockValidator = new ArchiveSecurityValidator({
      get: jest.fn((key: string) => {
        if (key === 'app.ingestion.maxArchiveBytes') return 1000; // 1 KB limit for testing
        return undefined;
      }),
    } as any);

    provider = new RepositorySourceProvider(
      mockDb,
      mockGithubClient,
      mockGithubInstallation,
      mockGithubConfig,
      mockValidator,
    );
  });

  it('rejects access when repository does not belong to organization (tenant isolation)', async () => {
    mockDb.client.repositoryConnection.findFirst.mockResolvedValue(null);

    await expect(
      provider.fetchSourceArchive({
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-alien',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects acquisition if repository is not connected', async () => {
    mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
      id: 'repo-1',
      organizationId: 'org-1',
      fullName: 'owner/repo',
      connected: false,
    });

    await expect(
      provider.fetchSourceArchive({
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('acquires registered fixture archives in test environments deterministically', async () => {
    mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
      id: 'repo-1',
      organizationId: 'org-1',
      fullName: 'impactra/fixture-repo',
      connected: true,
      defaultBranch: 'main',
    });

    const fixtureBuffer = Buffer.from('test-tar-content');
    provider.registerFixtureArchive('impactra/fixture-repo', fixtureBuffer, 'sha123456');

    const result = await provider.fetchSourceArchive({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
    });

    expect(result.sourceProvider).toBe('fixture');
    expect(result.archiveBuffer).toEqual(fixtureBuffer);
    expect(result.commitSha).toBe('sha123456');
    expect(result.ref).toBe('main');
  });

  it('aborts streaming download when chunk count exceeds maxArchiveBytes', async () => {
    mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
      id: 'repo-1',
      organizationId: 'org-1',
      fullName: 'owner/stream-repo',
      connected: true,
      defaultBranch: 'main',
      githubInstallationId: 'inst-1',
      ownerLogin: 'owner',
      name: 'stream-repo',
    });

    // Mock async iterator stream that yields chunks exceeding 1000 bytes
    async function* oversizedStream() {
      yield Buffer.alloc(600, 'A');
      yield Buffer.alloc(600, 'B'); // Total 1200 > 1000 maxArchiveBytes
    }

    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({ data: { sha: 'commit-sha-abc' } }),
          downloadTarballArchive: jest.fn().mockResolvedValue({
            data: oversizedStream(),
          }),
        },
      },
    };

    mockGithubClient.getInstallationOctokit.mockReturnValue(mockOctokit);

    await expect(
      provider.fetchSourceArchive({
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('successfully streams archive within size limit and resolves commit SHA', async () => {
    mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
      id: 'repo-1',
      organizationId: 'org-1',
      fullName: 'owner/stream-repo',
      connected: true,
      defaultBranch: 'main',
      githubInstallationId: 'inst-1',
      ownerLogin: 'owner',
      name: 'stream-repo',
    });

    async function* validStream() {
      yield Buffer.from('chunk1-data-');
      yield Buffer.from('chunk2-data');
    }

    const mockOctokit = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({ data: { sha: 'commit-sha-resolved' } }),
          downloadTarballArchive: jest.fn().mockResolvedValue({
            data: validStream(),
          }),
        },
      },
    };

    mockGithubClient.getInstallationOctokit.mockReturnValue(mockOctokit);

    const result = await provider.fetchSourceArchive({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
    });

    expect(result.sourceProvider).toBe('github');
    expect(result.commitSha).toBe('commit-sha-resolved');
    expect(result.archiveBuffer.toString()).toBe('chunk1-data-chunk2-data');
  });
});
