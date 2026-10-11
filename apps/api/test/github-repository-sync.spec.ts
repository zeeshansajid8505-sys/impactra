import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GitHubRepositoryService } from '../src/github/services/github-repository.service';
import { GitHubClientService } from '../src/github/services/github-client.service';
import { GitHubInstallationService } from '../src/github/services/github-installation.service';
import { DatabaseService } from '../src/database/database.service';

describe('GitHubRepositoryService', () => {
  let repoService: GitHubRepositoryService;
  let mockDb: any;
  let mockClient: any;
  let mockInstallationService: any;

  const orgId = 'org-tenant-1';
  const instId = 'inst-github-101';
  const storedRepos = new Map<string, any>();

  beforeEach(() => {
    storedRepos.clear();

    mockClient = {
      listInstallationRepositories: jest.fn().mockResolvedValue([
        {
          id: 101,
          name: 'backend-core',
          full_name: 'impactra/backend-core',
          private: true,
          default_branch: 'main',
          visibility: 'private',
          archived: false,
          disabled: false,
          fork: false,
          html_url: 'https://github.com/impactra/backend-core',
          owner: { login: 'impactra', id: 1 },
        },
        {
          id: 102,
          name: 'frontend-web',
          full_name: 'impactra/frontend-web',
          private: false,
          default_branch: 'main',
          visibility: 'public',
          archived: false,
          disabled: false,
          fork: false,
          html_url: 'https://github.com/impactra/frontend-web',
          owner: { login: 'impactra', id: 1 },
        },
      ]),
    };

    mockInstallationService = {
      getInstallationToken: jest.fn().mockResolvedValue('ghs_mock_token_12345'),
    };

    mockDb = {
      client: {
        gitHubInstallation: {
          findFirst: jest.fn().mockImplementation(async ({ where }) => {
            if (where.organizationId === orgId && where.status === 'ACTIVE') {
              return {
                id: 'inst-db-id',
                organizationId: orgId,
                githubInstallationId: instId,
                status: 'ACTIVE',
              };
            }
            return null;
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        repositoryConnection: {
          upsert: jest.fn().mockImplementation(async ({ where, update, create }) => {
            const key = `${where.organizationId_githubRepositoryId.organizationId}:${where.organizationId_githubRepositoryId.githubRepositoryId}`;
            const existing = storedRepos.get(key);
            if (existing) {
              Object.assign(existing, update);
              return existing;
            }
            const record = {
              id: `repo-${Date.now()}-${Math.random()}`,
              ...create,
              connectedAt: null,
              disconnectedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            storedRepos.set(key, record);
            return record;
          }),
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            let count = 0;
            for (const repo of storedRepos.values()) {
              if (
                repo.organizationId === where.organizationId &&
                where.githubRepositoryId?.notIn &&
                !where.githubRepositoryId.notIn.includes(repo.githubRepositoryId)
              ) {
                Object.assign(repo, data);
                count++;
              }
            }
            return { count };
          }),
          findFirst: jest.fn().mockImplementation(async ({ where }) => {
            for (const repo of storedRepos.values()) {
              if (repo.organizationId === where.organizationId) {
                if (where.OR) {
                  for (const condition of where.OR) {
                    if (condition.id && repo.id === condition.id) return repo;
                    if (condition.githubRepositoryId && repo.githubRepositoryId === condition.githubRepositoryId)
                      return repo;
                  }
                }
              }
            }
            return null;
          }),
          findMany: jest.fn().mockImplementation(async ({ where }) => {
            const list = [];
            for (const repo of storedRepos.values()) {
              if (repo.organizationId === where.organizationId) {
                if (where.connected !== undefined && repo.connected !== where.connected) continue;
                if (where.available !== undefined && repo.available !== where.available) continue;
                list.push(repo);
              }
            }
            return list;
          }),
          count: jest.fn().mockImplementation(async ({ where }) => {
            let count = 0;
            for (const repo of storedRepos.values()) {
              if (repo.organizationId === where.organizationId) count++;
            }
            return count;
          }),
          update: jest.fn().mockImplementation(async ({ where, data }) => {
            const repo = Array.from(storedRepos.values()).find((r) => r.id === where.id);
            if (!repo) throw new Error('Not found');
            Object.assign(repo, data);
            return repo;
          }),
        },
      },
    };

    repoService = new GitHubRepositoryService(
      mockDb as unknown as DatabaseService,
      mockClient as unknown as GitHubClientService,
      mockInstallationService as unknown as GitHubInstallationService,
    );
  });

  it('should synchronize repositories and mark new entries as available but not connected', async () => {
    const res = await repoService.syncRepositories(orgId);

    expect(res.syncedCount).toBe(2);
    expect(res.availableCount).toBe(2);
    expect(res.removedCount).toBe(0);

    const repo1 = storedRepos.get(`${orgId}:101`);
    expect(repo1).toBeDefined();
    expect(repo1.name).toBe('backend-core');
    expect(repo1.available).toBe(true);
    expect(repo1.connected).toBe(false);

    const repo2 = storedRepos.get(`${orgId}:102`);
    expect(repo2).toBeDefined();
    expect(repo2.name).toBe('frontend-web');
    expect(repo2.available).toBe(true);
  });

  it('should mark unlisted repositories as unavailable without deleting them', async () => {
    // Populate an existing repository that won't be returned by GitHub
    const legacyKey = `${orgId}:999`;
    storedRepos.set(legacyKey, {
      id: 'repo-legacy-999',
      organizationId: orgId,
      githubInstallationId: instId,
      githubRepositoryId: '999',
      name: 'deprecated-service',
      available: true,
      connected: true,
    });

    const res = await repoService.syncRepositories(orgId);

    expect(res.syncedCount).toBe(2);
    expect(res.removedCount).toBe(1);

    const legacy = storedRepos.get(legacyKey);
    expect(legacy).toBeDefined();
    expect(legacy.available).toBe(false); // marked unavailable!
    expect(legacy.connected).toBe(true); // connection state preserved
  });

  it('should connect an available repository', async () => {
    await repoService.syncRepositories(orgId);
    const repo1 = storedRepos.get(`${orgId}:101`);

    const connected = await repoService.connectRepository(orgId, repo1.id);

    expect(connected.connected).toBe(true);
    expect(connected.connectedAt).toBeDefined();
    expect(connected.disconnectedAt).toBeNull();
  });

  it('should reject connecting an unavailable repository', async () => {
    const key = `${orgId}:999`;
    storedRepos.set(key, {
      id: 'repo-unavail',
      organizationId: orgId,
      githubInstallationId: instId,
      githubRepositoryId: '999',
      name: 'removed-repo',
      available: false,
      connected: false,
    });

    await expect(repoService.connectRepository(orgId, 'repo-unavail')).rejects.toThrow(
      BadRequestException,
    );
    await expect(repoService.connectRepository(orgId, 'repo-unavail')).rejects.toThrow(
      'Cannot connect repository: It is currently marked unavailable in GitHub.',
    );
  });

  it('should disconnect a connected repository', async () => {
    await repoService.syncRepositories(orgId);
    const repo1 = storedRepos.get(`${orgId}:101`);

    await repoService.connectRepository(orgId, repo1.id);
    const disconnected = await repoService.disconnectRepository(orgId, repo1.id);

    expect(disconnected.connected).toBe(false);
    expect(disconnected.disconnectedAt).toBeDefined();
  });

  it('should throw NotFoundException for non-existent repository', async () => {
    await expect(repoService.connectRepository(orgId, 'non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
