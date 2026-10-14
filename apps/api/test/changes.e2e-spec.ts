import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import * as crypto from 'crypto';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';
import { GithubPullRequestService } from '../src/changes/services/github-pull-request.service';
import { ChangeQueueService } from '../src/changes/queue/change-queue.service';
import { BlastRadiusQueueService } from '../src/blast-radius/queue/blast-radius-queue.service';
import { BlastRadiusAnalysisService } from '../src/blast-radius/services/blast-radius-analysis.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { AppValidationPipe } from '../src/common/pipes/validation.pipe';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Pull Request Change Ingestion & Twin Mapping Foundation (E2E)', () => {
  let app: INestApplication;

  // In-memory data store for E2E tests
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const changeSets: any[] = [];
  const changeRevisions: any[] = [];
  const changedFiles: any[] = [];
  const twinChangeMappings: any[] = [];
  const dependencyDeltas: any[] = [];

  const orgId1 = 'org-changes-1';
  const orgId2 = 'org-changes-2';
  const repoId1 = 'repo-changes-1';
  const repoId2 = 'repo-changes-2';

  let ownerCookie = '';
  let viewerCookie = '';

  beforeAll(async () => {
    users.length = 0;
    sessions.length = 0;
    organizations.length = 0;
    memberships.length = 0;
    repositories.length = 0;
    changeSets.length = 0;
    changeRevisions.length = 0;
    changedFiles.length = 0;
    twinChangeMappings.length = 0;
    dependencyDeltas.length = 0;

    const owner = {
      id: 'user-owner-changes',
      email: 'owner@changes.test',
      name: 'Owner Changes',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewer = {
      id: 'user-viewer-changes',
      email: 'viewer@changes.test',
      name: 'Viewer Changes',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(owner, viewer);

    organizations.push(
      { id: orgId1, name: 'Changes Org 1', slug: 'changes-org-1', createdAt: new Date(), updatedAt: new Date() },
      { id: orgId2, name: 'Changes Org 2', slug: 'changes-org-2', createdAt: new Date(), updatedAt: new Date() },
    );

    memberships.push(
      { id: 'm-1', organizationId: orgId1, userId: owner.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-2', organizationId: orgId1, userId: viewer.id, role: 'VIEWER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-3', organizationId: orgId2, userId: viewer.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
    );

    const repo1 = {
      id: repoId1,
      organizationId: orgId1,
      githubInstallationId: 'inst-1',
      githubRepoId: BigInt(12345),
      githubRepositoryId: '12345',
      owner: 'impactra',
      ownerLogin: 'impactra',
      name: 'sample-app',
      fullName: 'impactra/sample-app',
      defaultBranch: 'main',
      connected: true,
      available: true,
      installation: { githubInstallationId: 'inst-1', status: 'ACTIVE' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const repo2 = {
      id: repoId2,
      organizationId: orgId2,
      githubInstallationId: 'inst-2',
      githubRepoId: BigInt(67890),
      githubRepositoryId: '67890',
      owner: 'impactra',
      ownerLogin: 'impactra',
      name: 'other-app',
      fullName: 'impactra/other-app',
      defaultBranch: 'main',
      connected: true,
      available: true,
      installation: { githubInstallationId: 'inst-2', status: 'ACTIVE' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositories.push(repo1, repo2);

    const ownerToken = 'owner-changes-token';
    const viewerToken = 'viewer-changes-token';
    sessions.push(
      {
        id: 's-1',
        userId: owner.id,
        sessionTokenHash: crypto.createHash('sha256').update(ownerToken).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: null,
      },
      {
        id: 's-2',
        userId: viewer.id,
        sessionTokenHash: crypto.createHash('sha256').update(viewerToken).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: null,
      },
    );

    ownerCookie = `impactra_session=${ownerToken}`;
    viewerCookie = `impactra_session=${viewerToken}`;

    // Seed a ChangeSet with a Revision, ChangedFiles, TwinMappings, and DependencyDeltas
    const cs1 = {
      id: 'cs-1',
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      provider: 'github',
      providerPullRequestId: '42',
      pullRequestNumber: 42,
      title: 'feat: add user authentication',
      authorLogin: 'octocat',
      baseRef: 'main',
      headRef: 'feature/auth',
      currentBaseSha: 'b111111111111111111111111111111111111111',
      currentHeadSha: 'h222222222222222222222222222222222222222',
      state: 'open',
      isDraft: false,
      isMerged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      repositoryConnection: repo1,
    };
    changeSets.push(cs1);

    const rev1 = {
      id: 'rev-1',
      changeSetId: cs1.id,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      baseSha: cs1.currentBaseSha,
      headSha: cs1.currentHeadSha,
      baseSnapshotId: 'snap-base',
      headSnapshotId: 'snap-head',
      analysisVersion: 'change-analysis-v1',
      status: 'SUCCEEDED',
      stage: 'COMPLETED',
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 0,
      filesRenamed: 0,
      nodesAdded: 1,
      nodesRemoved: 0,
      nodesModified: 1,
      edgesAdded: 1,
      edgesRemoved: 0,
      failureCode: null,
      failureMessage: null,
      queuedAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeRevisions.push(rev1);

    const file1 = {
      id: 'cf-1',
      changeRevisionId: rev1.id,
      oldPath: null,
      newPath: 'src/auth/jwt.service.ts',
      status: 'ADDED',
      additions: 50,
      deletions: 0,
      changes: 50,
      patchAvailable: true,
      patchTruncated: false,
      binary: false,
      createdAt: new Date(),
    };
    changedFiles.push(file1);

    const map1 = {
      id: 'tm-1',
      changeRevisionId: rev1.id,
      changedFileId: file1.id,
      side: 'AFTER',
      mappingType: 'EXACT_PATH',
      repositorySnapshotId: 'snap-head',
      digitalTwinSnapshotId: null,
      digitalTwinNodeId: 'node-head-jwt',
      nodeStableKey: 'file:src/auth/jwt.service.ts',
      path: 'src/auth/jwt.service.ts',
      createdAt: new Date(),
    };
    twinChangeMappings.push(map1);

    const delta1 = {
      id: 'dd-1',
      changeRevisionId: rev1.id,
      deltaType: 'EDGE_ADDED',
      sourceStableKey: 'file:src/auth/jwt.service.ts',
      targetStableKey: 'dep:jsonwebtoken',
      edgeType: 'DECLARES_DEPENDENCY',
      beforeEvidence: {},
      afterEvidence: { version: '^9.0.0' },
      createdAt: new Date(),
    };
    dependencyDeltas.push(delta1);

    const mockDbService = {
      client: {
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(users.find((u) => u.id === where.id || u.email === where.email) || null);
          }),
        },
        session: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const s = sessions.find(
              (item) =>
                (where.sessionTokenHash && item.sessionTokenHash === where.sessionTokenHash) ||
                (where.id && item.id === where.id),
            );
            if (!s) return Promise.resolve(null);
            const u = users.find((item) => item.id === s.userId);
            return Promise.resolve({ ...s, user: u });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const s = sessions.find(
              (item) =>
                (where.sessionTokenHash && item.sessionTokenHash === where.sessionTokenHash) ||
                (where.id && item.id === where.id),
            );
            if (!s) return Promise.resolve(null);
            const u = users.find((item) => item.id === s.userId);
            return Promise.resolve({ ...s, user: u });
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        organization: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(organizations.find((o) => o.id === where.id) || null);
          }),
        },
        organizationMembership: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const orgId = where.organizationId_userId?.organizationId || where.organizationId;
            const userId = where.organizationId_userId?.userId || where.userId;
            const m = memberships.find((item) => item.organizationId === orgId && item.userId === userId);
            if (!m) return Promise.resolve(null);
            const org = organizations.find((o) => o.id === m.organizationId);
            return Promise.resolve({ ...m, organization: org });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const orgId = where.organizationId_userId?.organizationId || where.organizationId;
            const userId = where.organizationId_userId?.userId || where.userId;
            const m = memberships.find(
              (item) => (!orgId || item.organizationId === orgId) && (!userId || item.userId === userId),
            );
            if (!m) return Promise.resolve(null);
            const org = organizations.find((o) => o.id === m.organizationId);
            return Promise.resolve({ ...m, organization: org });
          }),
        },
        repositoryConnection: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              repositories.find(
                (r) =>
                  (!where.id || r.id === where.id) &&
                  (!where.organizationId || r.organizationId === where.organizationId) &&
                  (!where.githubRepoId || r.githubRepoId === where.githubRepoId) &&
                  (!where.githubRepositoryId || r.githubRepositoryId === where.githubRepositoryId),
              ) || null,
            );
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              repositories.find(
                (r) =>
                  (!where.id || r.id === where.id) &&
                  (!where.organizationId || r.organizationId === where.organizationId),
              ) || null,
            );
          }),
          findMany: jest.fn().mockImplementation(() => Promise.resolve(repositories)),
        },
        changeSet: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              changeSets
                .filter((c) => !where.organizationId || c.organizationId === where.organizationId)
                .map((c) => ({
                  ...c,
                  revisions: changeRevisions.filter((r) => r.changeSetId === c.id),
                })),
            );
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              changeSets.filter((c) => !where.organizationId || c.organizationId === where.organizationId).length,
            );
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const found = changeSets.find((c) => c.id === where.id && (!where.organizationId || c.organizationId === where.organizationId));
            if (!found) return Promise.resolve(null);
            return Promise.resolve({
              ...found,
              revisions: changeRevisions.filter((r) => r.changeSetId === found.id),
            });
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id) return Promise.resolve(changeSets.find((c) => c.id === where.id) || null);
            if (where.repositoryConnectionId_pullRequestNumber) {
              const { repositoryConnectionId, pullRequestNumber } = where.repositoryConnectionId_pullRequestNumber;
              return Promise.resolve(
                changeSets.find(
                  (c) => c.repositoryConnectionId === repositoryConnectionId && c.pullRequestNumber === pullRequestNumber,
                ) || null,
              );
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = { id: `cs-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date(), repositoryConnection: repo1 };
            changeSets.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const idx = changeSets.findIndex((c) => c.id === where.id);
            if (idx >= 0) {
              changeSets[idx] = { ...changeSets[idx], ...data, updatedAt: new Date() };
              return Promise.resolve(changeSets[idx]);
            }
            return Promise.resolve(null);
          }),
          upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
            const existing = changeSets.find(
              (c) =>
                c.repositoryConnectionId === where.repositoryConnectionId_pullRequestNumber.repositoryConnectionId &&
                c.pullRequestNumber === where.repositoryConnectionId_pullRequestNumber.pullRequestNumber,
            );
            if (existing) {
              Object.assign(existing, update, { updatedAt: new Date() });
              return Promise.resolve(existing);
            }
            const created = { id: `cs-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date(), repositoryConnection: repo1 };
            changeSets.push(created);
            return Promise.resolve(created);
          }),
        },
        changeRevision: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changeRevisions.filter((r) => r.changeSetId === where.changeSetId));
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changeRevisions.filter((r) => r.changeSetId === where.changeSetId).length);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              changeRevisions.find((r) => r.id === where.id && r.changeSetId === where.changeSetId) || null,
            );
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id) return Promise.resolve(changeRevisions.find((r) => r.id === where.id) || null);
            if (where.changeSetId_baseSha_headSha_analysisVersion) {
              const { changeSetId, baseSha, headSha, analysisVersion } = where.changeSetId_baseSha_headSha_analysisVersion;
              return Promise.resolve(
                changeRevisions.find(
                  (r) =>
                    r.changeSetId === changeSetId &&
                    r.baseSha === baseSha &&
                    r.headSha === headSha &&
                    r.analysisVersion === analysisVersion,
                ) || null,
              );
            }
            return Promise.resolve(null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = { id: `rev-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date(), queuedAt: new Date() };
            changeRevisions.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const idx = changeRevisions.findIndex((r) => r.id === where.id);
            if (idx >= 0) {
              changeRevisions[idx] = { ...changeRevisions[idx], ...data, updatedAt: new Date() };
              return Promise.resolve(changeRevisions[idx]);
            }
            return Promise.resolve(null);
          }),
        },
        changedFile: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changedFiles.filter((f) => f.changeRevisionId === where.changeRevisionId));
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changedFiles.filter((f) => f.changeRevisionId === where.changeRevisionId).length);
          }),
        },
        twinChangeMapping: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(twinChangeMappings.filter((m) => m.changeRevisionId === where.changeRevisionId));
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(twinChangeMappings.filter((m) => m.changeRevisionId === where.changeRevisionId).length);
          }),
        },
        dependencyDelta: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(dependencyDeltas.filter((d) => d.changeRevisionId === where.changeRevisionId));
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(dependencyDeltas.filter((d) => d.changeRevisionId === where.changeRevisionId).length);
          }),
        },
      },
    };

    const mockPrService = {
      fetchPullRequestAndFiles: jest.fn().mockImplementation(({ pullNumber }: any) => {
        return Promise.resolve({
          pullRequest: {
            number: pullNumber,
            title: 'Sync test PR',
            body: 'Sync description',
            state: 'open',
            merged: false,
            mergedAt: null,
            baseRef: 'main',
            baseSha: 'base-99-sha',
            headRef: 'feat-99',
            headSha: 'head-99-sha',
            authorUsername: 'sync-user',
            authorAvatarUrl: null,
            sourceUrl: `https://github.com/impactra/sample-app/pull/${pullNumber}`,
            additions: 10,
            deletions: 2,
            changedFilesCount: 1,
          },
          files: [
            {
              sha: 'f-99',
              filename: 'src/sync.ts',
              status: 'added',
              additions: 10,
              deletions: 2,
              changes: 12,
              patch: '@@ +1 @@\n+sync code',
            },
          ],
        });
      }),
    };

    const mockCacheService = {
      redisClient: null,
      ping: jest.fn().mockResolvedValue({ status: 'healthy' }),
    };

    const mockStorageService = {
      putObject: jest.fn().mockResolvedValue({ key: 'k', sha256: 's', byteSize: 10 }),
      getObject: jest.fn().mockResolvedValue(null),
      ensureBucket: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue({ status: 'healthy' }),
    };

    const mockChangeQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      enqueueWithDelay: jest.fn().mockResolvedValue(undefined),
    };

    const mockBlastRadiusQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const mockBlastRadiusAnalysisService = {
      triggerAnalysis: jest.fn().mockResolvedValue({ id: 'mock-analysis-id' }),
      executeAnalysis: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDbService)
      .overrideProvider(CacheService)
      .useValue(mockCacheService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(GithubPullRequestService)
      .useValue(mockPrService)
      .overrideProvider(ChangeQueueService)
      .useValue(mockChangeQueueService)
      .overrideProvider(BlastRadiusQueueService)
      .useValue(mockBlastRadiusQueueService)
      .overrideProvider(BlastRadiusAnalysisService)
      .useValue(mockBlastRadiusAnalysisService)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.useGlobalPipes(new AppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /organizations/:orgId/changes', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes`)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(401);
    });

    it('returns 200 with list of change sets for authorized member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].pullRequestNumber).toBe(42);
      expect(res.body.items[0].latestRevision).toBeDefined();
    });

    it('enforces tenant isolation (viewer from org2 cannot access org1 changes)', async () => {
      // viewer only has membership in org1 as VIEWER, and org2 as OWNER.
      // Trying to access org1 with org2 header:
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes`)
        .set('Cookie', viewerCookie)
        .set('x-organization-id', orgId2); // mismatched header

      expect(res.status).toBe(403);
    });
  });

  describe('GET /organizations/:orgId/changes/:changeSetId', () => {
    it('returns 200 with change set details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/cs-1`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('cs-1');
      expect(res.body.title).toBe('feat: add user authentication');
      expect(res.body.latestRevision.id).toBe('rev-1');
    });

    it('returns 404 for nonexistent change set', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/nonexistent-id`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(404);
    });
  });

  describe('Revision details sub-endpoints', () => {
    it('GET /revisions returns list of revisions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/cs-1/revisions`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe('rev-1');
    });

    it('GET /files returns changed files', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/cs-1/revisions/rev-1/files`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].newPath).toBe('src/auth/jwt.service.ts');
    });

    it('GET /twin-mappings returns twin node mappings', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/cs-1/revisions/rev-1/twin-mappings`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].mappingType).toBe('EXACT_PATH');
      expect(res.body.items[0].side).toBe('AFTER');
    });

    it('GET /dependency-deltas returns graph deltas', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/changes/cs-1/revisions/rev-1/dependency-deltas`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].deltaType).toBe('EDGE_ADDED');
      expect(res.body.items[0].edgeType).toBe('DECLARES_DEPENDENCY');
    });
  });

  describe('POST /organizations/:orgId/repositories/:repoId/changes/sync', () => {
    it('denies VIEWER role with 403 Forbidden (RBAC CHANGE_SYNC policy)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/repositories/${repoId1}/changes/sync`)
        .set('Cookie', viewerCookie)
        .set('x-organization-id', orgId1)
        .send({ prNumber: 99 });

      expect(res.status).toBe(403);
    });

    it('allows OWNER role with 202 Accepted and creates change set / revision', async () => {
      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/repositories/${repoId1}/changes/sync`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1)
        .send({ prNumber: 99 });

      expect(res.status).toBe(202);
      expect(res.body.pullRequestNumber).toBe(99);
      expect(res.body.title).toBe('Sync test PR');
      expect(res.body.latestRevision).toBeDefined();
    });
  });
});
