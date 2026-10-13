import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';
import { RepositorySourceProvider } from '../src/ingestion/services/repository-source-provider.service';
import { IngestionQueueService } from '../src/ingestion/queue/ingestion-queue.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { AppValidationPipe } from '../src/common/pipes/validation.pipe';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

function createTestTar(entries: { name: string; content: string }[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    const content = Buffer.from(entry.content, 'utf8');

    header.write(entry.name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'utf8');
    const octalSize = content.length.toString(8).padStart(11, '0') + '\0';
    header.write(octalSize, 124, 12, 'utf8');
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    header.write('00', 263, 2, 'utf8');

    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 32 : header[i];
    }
    const octalSum = sum.toString(8).padStart(6, '0') + '\0 ';
    header.write(octalSum, 148, 8, 'utf8');

    chunks.push(header);
    chunks.push(content);
    const padding = 512 - (content.length % 512);
    if (padding < 512) {
      chunks.push(Buffer.alloc(padding, 0));
    }
  }
  chunks.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(chunks));
}

describe('Repository Ingestion & Software Digital Twin Foundation (E2E)', () => {
  let app: INestApplication;
  let sourceProvider: RepositorySourceProvider;

  // In-memory data store
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const ingestions: any[] = [];
  const snapshots: any[] = [];
  const inventories: any[] = [];
  const digitalTwins: any[] = [];
  const twinNodes: any[] = [];
  const twinEdges: any[] = [];

  const orgId1 = 'org-ingest-1';
  const orgId2 = 'org-ingest-2';
  const repoId1 = 'repo-ingest-1';
  const repoIdFixture = 'repo-ingest-fixture';
  const repoId2 = 'repo-ingest-2';

  let ownerCookie = '';
  let viewerCookie = '';

  beforeAll(async () => {
    users.length = 0;
    sessions.length = 0;
    organizations.length = 0;
    memberships.length = 0;
    repositories.length = 0;
    ingestions.length = 0;
    snapshots.length = 0;
    inventories.length = 0;
    digitalTwins.length = 0;
    twinNodes.length = 0;
    twinEdges.length = 0;

    // Seed users
    const owner = {
      id: 'user-owner-ingest',
      email: 'owner@impactra.test',
      name: 'Owner User',
      passwordHash: 'dummy-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewer = {
      id: 'user-viewer-ingest',
      email: 'viewer@impactra.test',
      name: 'Viewer User',
      passwordHash: 'dummy-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(owner, viewer);

    // Seed organizations
    organizations.push(
      { id: orgId1, name: 'Impactra Test Org 1', slug: 'org-test-1', createdAt: new Date(), updatedAt: new Date() },
      { id: orgId2, name: 'Impactra Test Org 2', slug: 'org-test-2', createdAt: new Date(), updatedAt: new Date() },
    );

    // Seed memberships
    memberships.push(
      { id: 'm-1', organizationId: orgId1, userId: owner.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-2', organizationId: orgId1, userId: viewer.id, role: 'VIEWER', createdAt: new Date(), updatedAt: new Date() },
      { id: 'm-3', organizationId: orgId2, userId: viewer.id, role: 'OWNER', createdAt: new Date(), updatedAt: new Date() },
    );

    // Seed repositories
    repositories.push(
      {
        id: repoId1,
        organizationId: orgId1,
        githubInstallationId: 'inst-1',
        githubRepositoryId: 'gh-repo-1',
        ownerLogin: 'impactra',
        name: 'sample-project',
        fullName: 'impactra/sample-project',
        defaultBranch: 'main',
        isPrivate: false,
        visibility: 'public',
        archived: false,
        disabled: false,
        fork: false,
        htmlUrl: 'https://github.com/impactra/sample-project',
        available: true,
        connected: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: repoId2,
        organizationId: orgId2,
        githubInstallationId: 'inst-2',
        githubRepositoryId: 'gh-repo-2',
        ownerLogin: 'impactra',
        name: 'other-project',
        fullName: 'impactra/other-project',
        defaultBranch: 'main',
        isPrivate: true,
        visibility: 'private',
        archived: false,
        disabled: false,
        fork: false,
        htmlUrl: 'https://github.com/impactra/other-project',
        available: true,
        connected: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: repoIdFixture,
        organizationId: orgId1,
        githubInstallationId: 'inst-1',
        githubRepositoryId: 'gh-repo-fixture',
        ownerLogin: 'impactra',
        name: 'fixture-project',
        fullName: 'impactra/fixture-project',
        defaultBranch: 'main',
        isPrivate: false,
        visibility: 'public',
        archived: false,
        disabled: false,
        fork: false,
        htmlUrl: 'https://github.com/impactra/fixture-project',
        available: true,
        connected: true,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Create sessions
    const ownerToken = 'owner-session-token-12345';
    const viewerToken = 'viewer-session-token-12345';
    const ownerHash = crypto.createHash('sha256').update(ownerToken).digest('hex');
    const viewerHash = crypto.createHash('sha256').update(viewerToken).digest('hex');

    sessions.push(
      {
        id: 's-owner',
        userId: owner.id,
        sessionTokenHash: ownerHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: null,
      },
      {
        id: 's-viewer',
        userId: viewer.id,
        sessionTokenHash: viewerHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: null,
      },
    );

    // Pre-seed immutable SUCCEEDED ingestion, snapshot, inventories, and digital twin for repoIdFixture
    const ingFixture = {
      id: 'ing-fixture',
      organizationId: orgId1,
      repositoryConnectionId: repoIdFixture,
      requestedByUserId: owner.id,
      targetRef: 'main',
      commitSha: '97640defa1234567890abcdef1234567890abcde',
      status: 'SUCCEEDED',
      stage: 'COMPLETED',
      startedAt: new Date(),
      completedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ingestions.push(ingFixture);

    const snapFixture = {
      id: 'snap-fixture',
      organizationId: orgId1,
      repositoryConnectionId: repoIdFixture,
      ingestionId: ingFixture.id,
      commitSha: '97640defa1234567890abcdef1234567890abcde',
      ref: 'refs/heads/main',
      sourceProvider: 'github',
      parserVersion: '1.0.0',
      artifactKey: 'artifacts/repo-ingest-fixture/snap-fixture.tar.gz',
      artifactSha256: 'sha256-fixture-artifact',
      sourceBytes: 1000,
      fileCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    snapshots.push(snapFixture);

    const inv1 = {
      id: 'inv-fixture-1',
      repositorySnapshotId: snapFixture.id,
      path: 'package.json',
      contentSha256: 'sha-pkg-json',
      byteSize: 100,
      language: null,
      isBinary: false,
      category: 'SOURCE_CODE',
      createdAt: new Date(),
    };
    const inv2 = {
      id: 'inv-fixture-2',
      repositorySnapshotId: snapFixture.id,
      path: 'src/index.ts',
      contentSha256: 'sha-idx-ts',
      byteSize: 200,
      language: 'TypeScript',
      isBinary: false,
      category: 'SOURCE_CODE',
      createdAt: new Date(),
    };
    inventories.push(inv1, inv2);

    const twinFixture = {
      id: 'twin-fixture',
      organizationId: orgId1,
      repositoryConnectionId: repoIdFixture,
      repositorySnapshotId: snapFixture.id,
      twinVersion: '1.0.0',
      nodeCount: 2,
      edgeCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    digitalTwins.push(twinFixture);

    const tn1 = {
      id: 'tn-fixture-1',
      digitalTwinSnapshotId: twinFixture.id,
      stableKey: 'file:src/index.ts',
      type: 'FILE',
      name: 'index.ts',
      path: 'src/index.ts',
      metadata: {},
      createdAt: new Date(),
    };
    const tn2 = {
      id: 'tn-fixture-2',
      digitalTwinSnapshotId: twinFixture.id,
      stableKey: 'pkg:@impactra/sample',
      type: 'WORKSPACE_PACKAGE',
      name: '@impactra/sample',
      path: 'package.json',
      metadata: {},
      createdAt: new Date(),
    };
    twinNodes.push(tn1, tn2);

    const te1 = {
      id: 'te-fixture-1',
      digitalTwinSnapshotId: twinFixture.id,
      sourceNodeId: tn1.id,
      targetNodeId: tn2.id,
      type: 'IMPORTS',
      evidence: {},
      createdAt: new Date(),
    };
    twinEdges.push(te1);

    ownerCookie = `impactra_session=${ownerToken}`;
    viewerCookie = `impactra_session=${viewerToken}`;

    // Mock Database Service
    const mockDbService = {
      client: {
        user: {
          findUnique: jest.fn(async ({ where }) => users.find((u) => u.id === where.id || u.email === where.email) || null),
        },
        session: {
          findUnique: jest.fn(async ({ where }) => {
            const s = sessions.find((item) => item.sessionTokenHash === where.sessionTokenHash);
            if (!s) return null;
            const u = users.find((item) => item.id === s.userId);
            return { ...s, user: u };
          }),
          update: jest.fn(async ({ where, data }) => {
            const s = sessions.find((item) => item.id === where.id);
            if (s) Object.assign(s, data);
            return s;
          }),
        },
        organization: {
          findUnique: jest.fn(async ({ where }) => organizations.find((o) => o.id === where.id) || null),
        },
        organizationMembership: {
          findUnique: jest.fn(async ({ where }) => {
            const orgId = where.organizationId_userId?.organizationId || where.organizationId;
            const userId = where.organizationId_userId?.userId || where.userId;
            const m = memberships.find((item) => item.organizationId === orgId && item.userId === userId);
            if (!m) return null;
            const org = organizations.find((o) => o.id === m.organizationId);
            return { ...m, organization: org };
          }),
        },
        repositoryConnection: {
          findFirst: jest.fn(async ({ where }) => {
            return repositories.find((r) => {
              for (const [k, v] of Object.entries(where)) {
                if (r[k] !== v) return false;
              }
              return true;
            }) || null;
          }),
          findMany: jest.fn(async ({ where }) => {
            return repositories.filter((r) => !where.organizationId || r.organizationId === where.organizationId);
          }),
          count: jest.fn(async ({ where }) => {
            return repositories.filter((r) => !where.organizationId || r.organizationId === where.organizationId).length;
          }),
        },
        repositoryIngestion: {
          create: jest.fn(async ({ data }) => {
            const record = {
              id: `ing-${ingestions.length + 1}`,
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            ingestions.push(record);
            return record;
          }),
          findFirst: jest.fn(async ({ where }) => {
            return (
              ingestions.find((i) => {
                if (where.repositoryConnectionId && i.repositoryConnectionId !== where.repositoryConnectionId) return false;
                if (where.status?.in && !where.status.in.includes(i.status)) return false;
                return true;
              }) || null
            );
          }),
          findUnique: jest.fn(async ({ where }) => {
            const ing = ingestions.find((i) => i.id === where.id);
            if (!ing) return null;
            const repo = repositories.find((r) => r.id === ing.repositoryConnectionId);
            return { ...ing, repositoryConnection: repo };
          }),
          findMany: jest.fn(async ({ where }) => {
            return ingestions.filter((i) => i.organizationId === where.organizationId);
          }),
          count: jest.fn(async ({ where }) => {
            return ingestions.filter((i) => i.organizationId === where.organizationId).length;
          }),
          update: jest.fn(async ({ where, data }) => {
            const ing = ingestions.find((i) => i.id === where.id);
            if (ing) Object.assign(ing, data);
            return ing;
          }),
        },
        repositorySnapshot: {
          upsert: jest.fn(async ({ where, create, update }) => {
            let snap = snapshots.find(
              (s) =>
                s.repositoryConnectionId === where.repositoryConnectionId_commitSha_parserVersion.repositoryConnectionId &&
                s.commitSha === where.repositoryConnectionId_commitSha_parserVersion.commitSha,
            );
            if (snap) {
              Object.assign(snap, update);
            } else {
              snap = { id: `snap-${snapshots.length + 1}`, ...create, createdAt: new Date() };
              snapshots.push(snap);
            }
            return snap;
          }),
          findFirst: jest.fn(async ({ where }) => {
            const snap = snapshots.find((s) => s.repositoryConnectionId === where.repositoryConnectionId);
            if (!snap) return null;
            if (where.ingestion?.status) {
              const ing = ingestions.find((i) => i.id === snap.ingestionId);
              if (ing?.status !== where.ingestion.status) return null;
            }
            const fileInvs = inventories.filter((f) => f.repositorySnapshotId === snap.id);
            return { ...snap, fileInventories: fileInvs };
          }),
        },
        repositoryFileInventory: {
          deleteMany: jest.fn(async ({ where }) => {
            for (let i = inventories.length - 1; i >= 0; i--) {
              if (inventories[i].repositorySnapshotId === where.repositorySnapshotId) {
                inventories.splice(i, 1);
              }
            }
          }),
          createMany: jest.fn(async ({ data }) => {
            for (const item of data) {
              inventories.push({ id: `inv-${inventories.length + 1}`, ...item, createdAt: new Date() });
            }
          }),
        },
        digitalTwinSnapshot: {
          deleteMany: jest.fn(async ({ where }) => {
            for (let i = digitalTwins.length - 1; i >= 0; i--) {
              if (digitalTwins[i].repositorySnapshotId === where.repositorySnapshotId) {
                digitalTwins.splice(i, 1);
              }
            }
          }),
          create: jest.fn(async ({ data }) => {
            const record = { id: `twin-${digitalTwins.length + 1}`, ...data, createdAt: new Date() };
            digitalTwins.push(record);
            return record;
          }),
          findFirst: jest.fn(async ({ where }) => {
            const twin = digitalTwins.find((t) => t.repositoryConnectionId === where.repositoryConnectionId);
            if (!twin) return null;
            const snap = snapshots.find((s) => s.id === twin.repositorySnapshotId);
            if (where.repositorySnapshot?.ingestion?.status) {
              const ing = ingestions.find((i) => i.id === snap?.ingestionId);
              if (ing?.status !== where.repositorySnapshot.ingestion.status) return null;
            }
            const fileInvs = inventories.filter((f) => f.repositorySnapshotId === snap?.id);
            const nodes = twinNodes.filter((n) => n.digitalTwinSnapshotId === twin.id);
            const edges = twinEdges.filter((e) => e.digitalTwinSnapshotId === twin.id);
            return {
              ...twin,
              repositorySnapshot: { ...snap, fileInventories: fileInvs },
              nodes,
              edges,
            };
          }),
        },
        digitalTwinNode: {
          createMany: jest.fn(async ({ data }) => {
            for (const item of data) {
              twinNodes.push({ id: `tn-${twinNodes.length + 1}`, ...item, createdAt: new Date() });
            }
          }),
          findMany: jest.fn(async ({ where }) => {
            return twinNodes.filter((n) => n.digitalTwinSnapshotId === where.digitalTwinSnapshotId);
          }),
          count: jest.fn(async ({ where }) => {
            return twinNodes.filter((n) => n.digitalTwinSnapshotId === where.digitalTwinSnapshotId).length;
          }),
        },
        digitalTwinEdge: {
          createMany: jest.fn(async ({ data }) => {
            for (const item of data) {
              twinEdges.push({ id: `te-${twinEdges.length + 1}`, ...item, createdAt: new Date() });
            }
          }),
          findMany: jest.fn(async ({ where }) => {
            const edges = twinEdges.filter((e) => e.digitalTwinSnapshotId === where.digitalTwinSnapshotId);
            return edges.map((e) => ({
              ...e,
              sourceNode: twinNodes.find((n) => n.id === e.sourceNodeId),
              targetNode: twinNodes.find((n) => n.id === e.targetNodeId),
            }));
          }),
          count: jest.fn(async ({ where }) => {
            return twinEdges.filter((e) => e.digitalTwinSnapshotId === where.digitalTwinSnapshotId).length;
          }),
        },
        $transaction: jest.fn(async (callback) => callback(mockDbService.client)),
      },
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

    const mockQueueService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
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
      .overrideProvider(IngestionQueueService)
      .useValue(mockQueueService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.use(json({ limit: '10mb' }));
    app.use(urlencoded({ extended: true, limit: '10mb' }));
    app.useGlobalPipes(new AppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();

    sourceProvider = app.get(RepositorySourceProvider);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('RBAC & Multi-Tenancy Enforcement', () => {
    it('allows OWNER to trigger repository ingestion', async () => {
      // Register fixture archive
      const tar = createTestTar([
        { name: 'impactra-sample/package.json', content: '{"name": "@impactra/sample", "version": "1.0.0"}' },
        { name: 'impactra-sample/src/index.ts', content: 'export const hello = "world";' },
      ]);
      sourceProvider.registerFixtureArchive('impactra/sample-project', tar, '97640defa1234567890abcdef1234567890abcde');

      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/repositories/${repoId1}/ingestions`)
        .set('Cookie', ownerCookie)
        .send({});

      expect(res.status).toBe(202);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('QUEUED');
      expect(res.body.repositoryConnectionId).toBe(repoId1);
    });

    it('forbids VIEWER from triggering repository ingestion (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/repositories/${repoId1}/ingestions`)
        .set('Cookie', viewerCookie)
        .send({});

      expect(res.status).toBe(403);
    });

    it('allows VIEWER to read repository ingestions (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoId1}/ingestions`)
        .set('Cookie', viewerCookie);

      expect(res.status).toBe(200);
      expect(res.body.ingestions).toBeDefined();
    });

    it('strictly isolates organizations (cannot access repository in another tenant)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoId2}/ingestions`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('Ingestion Lifecycle & Digital Twin Endpoints', () => {
    it('returns latest repository snapshot with file inventory', async () => {
      // Invariant assertion: verify seeded fixture is present
      expect(repositories.some((r) => r.id === repoIdFixture)).toBe(true);
      expect(snapshots.some((s) => s.repositoryConnectionId === repoIdFixture)).toBe(true);

      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoIdFixture}/snapshots/latest`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.commitSha).toBe('97640defa1234567890abcdef1234567890abcde');
      expect(res.body.fileCount).toBeGreaterThanOrEqual(2);
      expect(res.body.fileInventories).toBeDefined();
      expect(res.body.fileInventories.some((f: any) => f.path === 'package.json')).toBe(true);
      expect(res.body.fileInventories.some((f: any) => f.path === 'src/index.ts')).toBe(true);
    });

    it('returns latest software digital twin summary and node distribution', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoIdFixture}/digital-twin/latest`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.snapshot).toBeDefined();
      expect(res.body.nodeCount).toBeGreaterThanOrEqual(2);
      expect(res.body.nodesByType).toBeDefined();
      expect(res.body.languageDistribution).toBeDefined();
      expect(res.body.languageDistribution['TypeScript']).toBeGreaterThanOrEqual(1);
    });

    it('returns paginated and filterable digital twin nodes', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoIdFixture}/digital-twin/latest/nodes`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.nodes).toBeDefined();
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('returns paginated and filterable digital twin edges', async () => {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/repositories/${repoIdFixture}/digital-twin/latest/edges`)
        .set('Cookie', ownerCookie);

      expect(res.status).toBe(200);
      expect(res.body.edges).toBeDefined();
    });
  });
});
