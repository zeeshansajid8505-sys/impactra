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
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { AppValidationPipe } from '../src/common/pipes/validation.pipe';
import { BlastRadiusQueueService } from '../src/blast-radius/queue/blast-radius-queue.service';
import { BlastRadiusProcessor } from '../src/blast-radius/blast-radius.processor';
import { ChangesProcessor } from '../src/changes/changes.processor';
import { IngestionProcessor } from '../src/ingestion/ingestion.processor';
import { getQueueToken } from '@nestjs/bullmq';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Deterministic Blast-Radius Analysis Foundation (E2E)', () => {
  let app: INestApplication;

  // In-memory data store for E2E tests
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const changeSets: any[] = [];
  const changeRevisions: any[] = [];
  const blastAnalyses: any[] = [];
  const blastRoots: any[] = [];
  const blastFindings: any[] = [];
  const blastPaths: any[] = [];

  const orgId1 = 'org-br-1';
  const orgId2 = 'org-br-2';
  const repoId1 = 'repo-br-1';
  const changeSetId = 'cs-br-1';
  const changeRevisionId = 'rev-br-1';
  const analysisId = 'analysis-br-1';

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
    blastAnalyses.length = 0;
    blastRoots.length = 0;
    blastFindings.length = 0;
    blastPaths.length = 0;

    const owner = {
      id: 'user-owner-br',
      email: 'owner@blastradius.test',
      name: 'Owner BR',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewer = {
      id: 'user-viewer-br',
      email: 'viewer@blastradius.test',
      name: 'Viewer BR',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(owner, viewer);

    organizations.push(
      { id: orgId1, name: 'BR Org 1', slug: 'br-org-1', createdAt: new Date(), updatedAt: new Date() },
      { id: orgId2, name: 'BR Org 2', slug: 'br-org-2', createdAt: new Date(), updatedAt: new Date() },
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
      ownerLogin: 'impactra',
      name: 'sample-app',
      fullName: 'impactra/sample-app',
      defaultBranch: 'main',
      connected: true,
      available: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositories.push(repo1);

    const ownerToken = 'owner-br-token';
    const viewerToken = 'viewer-br-token';
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

    const cs1 = {
      id: changeSetId,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      provider: 'github',
      providerPullRequestId: '101',
      pullRequestNumber: 101,
      title: 'feat: add payment gateway',
      authorLogin: 'alice',
      baseRef: 'main',
      headRef: 'feature/payment',
      currentBaseSha: 'b111111111111111111111111111111111111111',
      currentHeadSha: 'h222222222222222222222222222222222222222',
      state: 'open',
      isDraft: false,
      isMerged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeSets.push(cs1);

    const rev1 = {
      id: changeRevisionId,
      changeSetId,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      baseSha: cs1.currentBaseSha,
      headSha: cs1.currentHeadSha,
      baseSnapshotId: 'snap-base',
      headSnapshotId: 'snap-head',
      analysisVersion: 'change-analysis-v1',
      status: 'SUCCEEDED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeRevisions.push(rev1);

    const analysis1 = {
      id: analysisId,
      organizationId: orgId1,
      changeSetId,
      changeRevisionId,
      analysisVersion: 'blast-radius-v1',
      status: 'SUCCEEDED',
      rootCount: 1,
      affectedNodeCount: 2,
      firstOrderCount: 1,
      transitiveCount: 1,
      maxDepthReached: 2,
      evidencePathCount: 2,
      truncated: false,
      truncationReason: null,
      startedAt: new Date(),
      completedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    blastAnalyses.push(analysis1);

    const root1 = {
      id: 'root-1',
      analysisId: analysis1.id,
      stableKey: 'file:src/payment/gateway.ts',
      nodeType: 'FILE',
      changeKind: 'MODIFIED',
      snapshotSide: 'HEAD',
      createdAt: new Date(),
    };
    blastRoots.push(root1);

    const finding1 = {
      id: 'finding-1',
      analysisId: analysis1.id,
      rootId: root1.id,
      stableKey: 'file:src/payment/checkout.service.ts',
      nodeStableKey: 'file:src/payment/checkout.service.ts',
      nodeName: 'checkout.service.ts',
      nodeDisplayName: 'checkout.service.ts',
      nodePath: 'src/payment/checkout.service.ts',
      nodeType: 'SERVICE',
      category: 'SERVICE',
      nodeCategory: 'SERVICE',
      impactClass: 'FIRST_ORDER',
      depth: 1,
      minDepth: 1,
      directDependentCount: 3,
      affectedByRootsCount: 1,
      reasonCode: 'DIRECT_DEPENDENCY',
      reasonSummary: 'Directly imports file:src/payment/gateway.ts',
      snapshotSide: 'HEAD',
      createdAt: new Date(),
    };
    const finding2 = {
      id: 'finding-2',
      analysisId: analysis1.id,
      rootId: root1.id,
      stableKey: 'file:src/routes/checkout.controller.ts',
      nodeStableKey: 'file:src/routes/checkout.controller.ts',
      nodeName: 'checkout.controller.ts',
      nodeDisplayName: 'checkout.controller.ts',
      nodePath: 'src/routes/checkout.controller.ts',
      nodeType: 'ENDPOINT',
      category: 'ENTRYPOINT',
      nodeCategory: 'ENTRYPOINT',
      impactClass: 'TRANSITIVE',
      depth: 2,
      minDepth: 2,
      directDependentCount: 1,
      affectedByRootsCount: 1,
      reasonCode: 'TRANSITIVE_DEPENDENCY',
      reasonSummary: 'Transitively dependent via checkout.service.ts',
      snapshotSide: 'HEAD',
      createdAt: new Date(),
    };
    blastFindings.push(finding1, finding2);

    const path1 = {
      id: 'path-1',
      analysisId: analysis1.id,
      findingId: finding1.id,
      rootStableKey: root1.stableKey,
      affectedStableKey: finding1.nodeStableKey,
      snapshotSide: 'HEAD',
      side: 'AFTER',
      depth: 1,
      hopCount: 1,
      pathNodesJson: [{ stableKey: root1.stableKey, type: 'FILE' }, { stableKey: finding1.nodeStableKey, type: 'SERVICE' }],
      pathEdgesJson: [{ sourceStableKey: finding1.nodeStableKey, targetStableKey: root1.stableKey, edgeType: 'IMPORTS' }],
      pathNodes: [{ stableKey: root1.stableKey, type: 'FILE' }, { stableKey: finding1.nodeStableKey, type: 'SERVICE' }],
      pathEdges: [{ sourceStableKey: finding1.nodeStableKey, targetStableKey: root1.stableKey, edgeType: 'IMPORTS' }],
      createdAt: new Date(),
    };
    blastPaths.push(path1);

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
            if (where.organizationId_userId) {
              const { organizationId, userId } = where.organizationId_userId;
              return Promise.resolve(
                memberships.find((m) => m.organizationId === organizationId && m.userId === userId) || null,
              );
            }
            return Promise.resolve(null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              memberships.find((m) => m.organizationId === where.organizationId && m.userId === where.userId) || null,
            );
          }),
        },
        changeSet: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find((c) => c.id === where.id && c.organizationId === where.organizationId);
            if (!cs) return Promise.resolve(null);
            const revs = changeRevisions
              .filter((r) => r.changeSetId === cs.id)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return Promise.resolve({ ...cs, revisions: revs });
          }),
        },
        blastRadiusAnalysis: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id) {
              const item = blastAnalyses.find((a) => a.id === where.id);
              if (!item) return Promise.resolve(null);
              const roots = blastRoots.filter((r) => r.analysisId === item.id);
              return Promise.resolve({ ...item, roots });
            }
            if (where.changeRevisionId_analysisVersion) {
              const { changeRevisionId, analysisVersion } = where.changeRevisionId_analysisVersion;
              return Promise.resolve(
                blastAnalyses.find(
                  (a) => a.changeRevisionId === changeRevisionId && a.analysisVersion === analysisVersion,
                ) || null,
              );
            }
            return Promise.resolve(null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastAnalyses.filter(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.changeSetId || a.changeSetId === where.changeSetId) &&
                (!where.changeRevisionId || a.changeRevisionId === where.changeRevisionId) &&
                (!where.status || a.status === where.status),
            );
            if (matched.length === 0) return Promise.resolve(null);
            const sorted = matched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const item = sorted[0];
            const roots = blastRoots.filter((r) => r.analysisId === item.id);
            return Promise.resolve({ ...item, roots });
          }),
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastAnalyses.filter(
              (a) =>
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.status || a.status === where.status),
            );
            return Promise.resolve(matched);
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastAnalyses.filter(
              (a) =>
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.status || a.status === where.status),
            );
            return Promise.resolve(matched.length);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = { id: `analysis-new-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
            blastAnalyses.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const existing = blastAnalyses.find((a) => a.id === where.id);
            if (existing) Object.assign(existing, data);
            return Promise.resolve(existing || data);
          }),
        },
        blastRadiusFinding: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastFindings.filter(
              (f) =>
                (!where.analysisId || f.analysisId === where.analysisId) &&
                (!where.impactClass || f.impactClass === where.impactClass),
            );
            return Promise.resolve(matched);
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastFindings.filter(
              (f) =>
                (!where.analysisId || f.analysisId === where.analysisId) &&
                (!where.impactClass || f.impactClass === where.impactClass),
            );
            return Promise.resolve(matched.length);
          }),
        },
        blastRadiusEvidencePath: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastPaths.filter(
              (p) =>
                (!where.analysisId || p.analysisId === where.analysisId) &&
                (!where.findingId || p.findingId === where.findingId),
            );
            return Promise.resolve(matched);
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastPaths.filter(
              (p) =>
                (!where.analysisId || p.analysisId === where.analysisId) &&
                (!where.findingId || p.findingId === where.findingId),
            );
            return Promise.resolve(matched.length);
          }),
        },
      },
    };

    const mockQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const mockBullQueue = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
      getJob: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    const mockProcessor = {
      process: jest.fn().mockResolvedValue(undefined),
    };

    const mockCacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const mockStorageService = {
      get: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDbService)
      .overrideProvider(CacheService)
      .useValue(mockCacheService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideProvider(BlastRadiusQueueService)
      .useValue(mockQueueService)
      .overrideProvider(BlastRadiusProcessor)
      .useValue(mockProcessor)
      .overrideProvider(ChangesProcessor)
      .useValue(mockProcessor)
      .overrideProvider(IngestionProcessor)
      .useValue(mockProcessor)
      .overrideProvider(getQueueToken('blast-radius-analysis'))
      .useValue(mockBullQueue)
      .overrideProvider(getQueueToken('change-ingestion'))
      .useValue(mockBullQueue)
      .overrideProvider(getQueueToken('repository-ingestion'))
      .useValue(mockBullQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.use(json({ limit: '10mb' }));
    app.use(urlencoded({ extended: true, limit: '10mb' }));
    app.useGlobalPipes(new AppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    // Deterministically isolate readable fixture state so earlier tests do not contaminate later tests
    const existing = blastAnalyses.find((a) => a.id === analysisId);
    if (existing) {
      Object.assign(existing, {
        id: analysisId,
        organizationId: orgId1,
        changeSetId,
        changeRevisionId,
        analysisVersion: 'blast-radius-v1',
        status: 'SUCCEEDED',
        rootCount: 1,
        affectedNodeCount: 2,
        firstOrderCount: 1,
        transitiveCount: 1,
        maxDepth: 2,
        maxDepthReached: 2,
        evidencePathCount: 2,
        truncated: false,
        truncationReason: null,
        startedAt: new Date(),
        completedAt: new Date(),
        failureCode: null,
        failureMessage: null,
      });
    }
  });

  describe('RBAC & Permissions', () => {
    it('allows OWNER to trigger blast radius analysis', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1)
        .send({ force: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.analysisId).toBeDefined();
    });

    it('denies VIEWER from triggering blast radius analysis (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius`)
        .set('Cookie', viewerCookie)
        .set('x-organization-id', orgId1)
        .send({ force: true });

      expect(res.status).toBe(403);
    });

    it('allows VIEWER to read blast radius results', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius/latest`)
        .set('Cookie', viewerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.analysis).toBeDefined();
      expect(res.body.analysis.id).toBe('analysis-br-1');
      expect(res.body.analysis.status).toBe('SUCCEEDED');
    });
  });

  describe('Tenant Isolation', () => {
    it('denies access to blast radius analysis belonging to another organization (404/403)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId2}/changes/cs-br-1/blast-radius/latest`)
        .set('Cookie', viewerCookie)
        .set('x-organization-id', orgId2);

      // cs-br-1 belongs to orgId1, not orgId2
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Analysis Details, Findings, and Evidence Paths', () => {
    it('returns specific analysis details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius/analysis-br-1`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('analysis-br-1');
      expect(res.body.totalAffectedNodes).toBe(2);
      expect(res.body.firstOrderAffectedNodes).toBe(1);
      expect(res.body.transitiveAffectedNodes).toBe(1);
    });

    it('lists findings with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius/analysis-br-1/findings`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('filters findings by impact class', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius/analysis-br-1/findings?impactClass=FIRST_ORDER`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].impactClass).toBe('FIRST_ORDER');
    });

    it('lists evidence paths with pagination and node details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/cs-br-1/blast-radius/analysis-br-1/evidence-paths`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].hopCount).toBe(1);
      expect(res.body.items[0].rootStableKey).toBe('file:src/payment/gateway.ts');
    });

    it('lists organization-wide blast radius analyses', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/blast-radius`)
        .set('Cookie', ownerCookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });
  });
});
