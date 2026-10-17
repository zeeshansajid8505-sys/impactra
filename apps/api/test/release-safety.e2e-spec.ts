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
import { ReleaseSafetyQueueService } from '../src/release-safety/queue/release-safety-queue.service';
import { ReleaseSafetyProcessor } from '../src/release-safety/release-safety.processor';
import { ReleaseSafetyAnalysisService } from '../src/release-safety/services/release-safety-analysis.service';
import { BlastRadiusQueueService } from '../src/blast-radius/queue/blast-radius-queue.service';
import { BlastRadiusProcessor } from '../src/blast-radius/blast-radius.processor';
import { ChangesProcessor } from '../src/changes/changes.processor';
import { IngestionProcessor } from '../src/ingestion/ingestion.processor';
import { getQueueToken } from '@nestjs/bullmq';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Deterministic Release Safety & Release Decision Foundation (E2E)', () => {
  let app: INestApplication;
  let analysisService: ReleaseSafetyAnalysisService;

  // In-memory data store for E2E tests
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const changeSets: any[] = [];
  const changeRevisions: any[] = [];
  const changedFiles: any[] = [];
  const dependencyDeltas: any[] = [];
  const blastAnalyses: any[] = [];
  const blastFindings: any[] = [];
  const releaseSafetyAssessments: any[] = [];
  const releaseSafetySignals: any[] = [];


  const orgId1 = 'org-rs-1';
  const orgId2 = 'org-rs-2';
  const repoId1 = 'repo-rs-1';
  const changeSetId = 'cs-rs-1';
  const changeRevisionId = 'rev-rs-1';
  const blastRadiusAnalysisId = 'bra-rs-1';
  const assessmentId = 'rsa-rs-1';

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
    dependencyDeltas.length = 0;
    blastAnalyses.length = 0;
    blastFindings.length = 0;
    releaseSafetyAssessments.length = 0;
    releaseSafetySignals.length = 0;

    const owner = {
      id: 'user-owner-rs',
      email: 'owner@releasesafety.test',
      name: 'Owner RS',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewer = {
      id: 'user-viewer-rs',
      email: 'viewer@releasesafety.test',
      name: 'Viewer RS',
      passwordHash: 'dummy',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(owner, viewer);

    organizations.push(
      { id: orgId1, name: 'RS Org 1', slug: 'rs-org-1', createdAt: new Date(), updatedAt: new Date() },
      { id: orgId2, name: 'RS Org 2', slug: 'rs-org-2', createdAt: new Date(), updatedAt: new Date() },
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
      githubRepoId: BigInt(23456),
      githubRepositoryId: '23456',
      ownerLogin: 'impactra',
      name: 'payment-service',
      fullName: 'impactra/payment-service',
      defaultBranch: 'main',
      connected: true,
      available: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositories.push(repo1);

    const ownerToken = 'owner-rs-token';
    const viewerToken = 'viewer-rs-token';
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
      providerPullRequestId: '202',
      pullRequestNumber: 202,
      title: 'feat: add stripe integration',
      authorLogin: 'bob',
      baseRef: 'main',
      headRef: 'feature/stripe',
      currentBaseSha: 'b22222222222222222222222222222222222222',
      currentHeadSha: 'h33333333333333333333333333333333333333',
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
      baseSnapshotId: 'snap-base-2',
      headSnapshotId: 'snap-head-2',
      analysisVersion: 'change-analysis-v1',
      status: 'SUCCEEDED',
      filesAdded: 2,
      filesModified: 5,
      filesDeleted: 1,
      filesRenamed: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeRevisions.push(rev1);

    changedFiles.push(
      {
        id: 'cf-1',
        changeRevisionId,
        newPath: 'src/stripe/client.ts',
        oldPath: null,
        status: 'ADDED',
        additions: 120,
        deletions: 0,
        changes: 120,
      },
      {
        id: 'cf-2',
        changeRevisionId,
        newPath: 'src/config/payments.json',
        oldPath: 'src/config/payments.json',
        status: 'MODIFIED',
        additions: 30,
        deletions: 10,
        changes: 40,
      },
    );

    dependencyDeltas.push({
      id: 'dd-1',
      changeRevisionId,
      deltaType: 'EDGE_ADDED',
      sourceStableKey: 'file:src/stripe/client.ts',
      targetStableKey: 'npm:stripe',
      edgeType: 'CONTAINS',
    });

    const blastAnalysis1 = {
      id: blastRadiusAnalysisId,
      organizationId: orgId1,
      changeSetId,
      changeRevisionId,
      analysisVersion: 'blast-radius-v1',
      status: 'SUCCEEDED',
      rootCount: 2,
      affectedNodeCount: 8,
      firstOrderCount: 4,
      transitiveCount: 4,
      maxDepth: 3,
      maxDepthReached: 3,
      evidencePathCount: 4,
      truncated: false,
      truncationReason: null,
      startedAt: new Date(),
      completedAt: new Date(),
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    blastAnalyses.push(blastAnalysis1);

    blastFindings.push(
      {
        id: 'find-1',
        analysisId: blastRadiusAnalysisId,
        blastRadiusAnalysisId,
        stableKey: 'file:src/config/payments.json',
        nodeName: 'payments.json',
        nodePath: 'src/config/payments.json',
        nodeType: 'CONFIG',
        category: 'CONFIG',
        impactClass: 'FIRST_ORDER',
        depth: 1,
      },
      {
        id: 'find-2',
        analysisId: blastRadiusAnalysisId,
        blastRadiusAnalysisId,
        stableKey: 'pkg:packages/shared',
        nodeName: '@impactra/shared',
        nodePath: 'packages/shared',
        nodeType: 'WORKSPACE_PACKAGE',
        category: 'WORKSPACE_PACKAGE',
        impactClass: 'TRANSITIVE',
        depth: 2,
      },
      {
        id: 'find-3',
        analysisId: blastRadiusAnalysisId,
        blastRadiusAnalysisId,
        stableKey: 'npm:stripe',
        nodeName: 'stripe',
        nodePath: null,
        nodeType: 'EXTERNAL_DEPENDENCY',
        category: 'EXTERNAL_DEPENDENCY',
        impactClass: 'FIRST_ORDER',
        depth: 1,
      },
    );

    const initialAssessment = {
      id: assessmentId,
      organizationId: orgId1,
      changeSetId,
      changeRevisionId,
      blastRadiusAnalysisId,
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 45,
      riskLevel: 'MEDIUM',
      decision: 'REVIEW_REQUIRED',
      signalCount: 3,
      blockingSignalCount: 0,
      reviewSignalCount: 2,
      startedAt: new Date(),
      completedAt: new Date(),
      failedAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    releaseSafetyAssessments.push(initialAssessment);

    const sig1 = {
      id: 'sig-1',
      organizationId: orgId1,
      assessmentId: initialAssessment.id,
      ruleId: 'RS-ARCH-001',
      ruleVersion: 'impactra-release-safety-v1',
      category: 'ARCHITECTURE',
      severity: 'HIGH',
      scoreDelta: 15,
      blocking: false,
      requiresReview: true,
      title: 'Configuration Mutation in Blast Radius',
      description: '1 configuration file(s) affected in blast radius.',
      evidenceType: 'BLAST_RADIUS_FINDING',
      evidenceReferenceId: 'find-1',
      evidenceStableKey: 'file:src/config/payments.json',
      evidenceJson: {},
      createdAt: new Date(),
    };
    const sig2 = {
      id: 'sig-2',
      organizationId: orgId1,
      assessmentId: initialAssessment.id,
      ruleId: 'RS-ARCH-002',
      ruleVersion: 'impactra-release-safety-v1',
      category: 'ARCHITECTURE',
      severity: 'HIGH',
      scoreDelta: 15,
      blocking: false,
      requiresReview: true,
      title: 'Cross-Package Architecture Boundary Traversed',
      description: '1 workspace package boundary traversed.',
      evidenceType: 'BLAST_RADIUS_FINDING',
      evidenceReferenceId: 'find-2',
      evidenceStableKey: 'pkg:packages/shared',
      evidenceJson: {},
      createdAt: new Date(),
    };
    const sig3 = {
      id: 'sig-3',
      organizationId: orgId1,
      assessmentId: initialAssessment.id,
      ruleId: 'RS-DEP-002',
      ruleVersion: 'impactra-release-safety-v1',
      category: 'DEPENDENCY',
      severity: 'LOW',
      scoreDelta: 10,
      blocking: false,
      requiresReview: false,
      title: 'New Dependency Edge Introduced',
      description: '1 new dependency edge added.',
      evidenceType: 'DEPENDENCY_DELTA',
      evidenceReferenceId: 'dd-1',
      evidenceStableKey: 'npm:stripe',
      evidenceJson: {},
      createdAt: new Date(),
    };
    releaseSafetySignals.push(sig1, sig2, sig3);

    const mockDbService = {
      client: {
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(mockDbService.client);
        }),
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
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changeSets.find((c) => c.id === where.id) || null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find((c) => c.id === where.id && c.organizationId === where.organizationId);
            if (!cs) return Promise.resolve(null);
            const revs = changeRevisions
              .filter((r) => r.changeSetId === cs.id)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return Promise.resolve({ ...cs, revisions: revs });
          }),
        },
        changeRevision: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changeRevisions.find((r) => r.id === where.id) || null);
          }),
        },
        changedFile: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changedFiles.filter((f) => f.changeRevisionId === where.changeRevisionId));
          }),
        },
        dependencyDelta: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(dependencyDeltas.filter((d) => d.changeRevisionId === where.changeRevisionId));
          }),
        },
        blastRadiusAnalysis: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(blastAnalyses.find((a) => a.id === where.id) || null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const matched = blastAnalyses.filter(
              (a) =>
                (!where.changeRevisionId || a.changeRevisionId === where.changeRevisionId) &&
                (!where.status || a.status === where.status),
            );
            return Promise.resolve(matched[0] || null);
          }),
        },
        blastRadiusFinding: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const targetId = where.analysisId || where.blastRadiusAnalysisId;
            return Promise.resolve(
              blastFindings.filter(
                (f) =>
                  f.analysisId === targetId ||
                  f.blastRadiusAnalysisId === targetId,
              ),
            );
          }),
        },
        releaseSafetyAssessment: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id) {
              const item = releaseSafetyAssessments.find((a) => a.id === where.id);
              if (!item) return Promise.resolve(null);
              const sigs = releaseSafetySignals.filter((s) => s.assessmentId === item.id);
              return Promise.resolve({ ...item, signals: sigs });
            }
            if (where.changeRevisionId_blastRadiusAnalysisId_policyVersion) {
              const { changeRevisionId, blastRadiusAnalysisId, policyVersion } =
                where.changeRevisionId_blastRadiusAnalysisId_policyVersion;
              const item = releaseSafetyAssessments.find(
                (a) =>
                  a.changeRevisionId === changeRevisionId &&
                  a.blastRadiusAnalysisId === blastRadiusAnalysisId &&
                  a.policyVersion === policyVersion,
              );
              if (!item) return Promise.resolve(null);
              const sigs = releaseSafetySignals.filter((s) => s.assessmentId === item.id);
              return Promise.resolve({ ...item, signals: sigs });
            }
            return Promise.resolve(null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetyAssessments.filter(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.changeSetId || a.changeSetId === where.changeSetId) &&
                (!where.status || a.status === where.status),
            );
            if (matched.length === 0) return Promise.resolve(null);
            const sorted = matched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            const item = sorted[0];
            const sigs = releaseSafetySignals.filter((s) => s.assessmentId === item.id);
            return Promise.resolve({ ...item, signals: sigs });
          }),
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetyAssessments.filter(
              (a) =>
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.status || a.status === where.status) &&
                (!where.decision || a.decision === where.decision) &&
                (!where.riskLevel || a.riskLevel === where.riskLevel),
            );
            return Promise.resolve(matched);
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetyAssessments.filter(
              (a) =>
                (!where.organizationId || a.organizationId === where.organizationId) &&
                (!where.status || a.status === where.status) &&
                (!where.decision || a.decision === where.decision) &&
                (!where.riskLevel || a.riskLevel === where.riskLevel),
            );
            return Promise.resolve(matched.length);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = {
              id: `rsa-new-${Date.now()}`,
              ...data,
              riskScore: data.riskScore || 0,
              riskLevel: data.riskLevel || 'LOW',
              decision: data.decision || 'PASS',
              signalCount: data.signalCount || 0,
              blockingSignalCount: data.blockingSignalCount || 0,
              reviewSignalCount: data.reviewSignalCount || 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            releaseSafetyAssessments.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const existing = releaseSafetyAssessments.find((a) => a.id === where.id);
            if (existing) Object.assign(existing, data);
            const sigs = releaseSafetySignals.filter((s) => s.assessmentId === where.id);
            return Promise.resolve({ ...(existing || data), signals: sigs });
          }),
        },
        releaseSafetySignal: {
          deleteMany: jest.fn().mockImplementation(({ where }: any) => {
            const before = releaseSafetySignals.length;
            const remaining = releaseSafetySignals.filter((s) => s.assessmentId !== where.assessmentId);
            releaseSafetySignals.length = 0;
            releaseSafetySignals.push(...remaining);
            return Promise.resolve({ count: before - remaining.length });
          }),
          createMany: jest.fn().mockImplementation(({ data }: any) => {
            for (const item of data) {
              releaseSafetySignals.push({
                id: `sig-new-${Date.now()}-${Math.random()}`,
                ...item,
                createdAt: new Date(),
              });
            }
            return Promise.resolve({ count: data.length });
          }),
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetySignals.filter(
              (s) =>
                (!where.assessmentId || s.assessmentId === where.assessmentId) &&
                (!where.organizationId || s.organizationId === where.organizationId) &&
                (!where.category || s.category === where.category) &&
                (!where.severity || s.severity === where.severity) &&
                (where.blocking === undefined || s.blocking === where.blocking) &&
                (where.requiresReview === undefined || s.requiresReview === where.requiresReview),
            );
            return Promise.resolve(matched);
          }),
          count: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetySignals.filter(
              (s) =>
                (!where.assessmentId || s.assessmentId === where.assessmentId) &&
                (!where.organizationId || s.organizationId === where.organizationId) &&
                (!where.category || s.category === where.category) &&
                (!where.severity || s.severity === where.severity) &&
                (where.blocking === undefined || s.blocking === where.blocking) &&
                (where.requiresReview === undefined || s.requiresReview === where.requiresReview),
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
      .overrideProvider(ReleaseSafetyQueueService)
      .useValue(mockQueueService)
      .overrideProvider(ReleaseSafetyProcessor)
      .useValue(mockProcessor)
      .overrideProvider(BlastRadiusQueueService)
      .useValue(mockQueueService)
      .overrideProvider(BlastRadiusProcessor)
      .useValue(mockProcessor)
      .overrideProvider(ChangesProcessor)
      .useValue(mockProcessor)
      .overrideProvider(IngestionProcessor)
      .useValue(mockProcessor)
      .overrideProvider(getQueueToken('release-safety-analysis'))
      .useValue(mockBullQueue)
      .overrideProvider(getQueueToken('blast-radius-analysis'))
      .useValue(mockBullQueue)
      .overrideProvider(getQueueToken('changes-analysis'))
      .useValue(mockBullQueue)
      .overrideProvider(getQueueToken('repo-ingestion'))
      .useValue(mockBullQueue)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.useGlobalPipes(new AppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    analysisService = moduleFixture.get<ReleaseSafetyAnalysisService>(ReleaseSafetyAnalysisService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('RBAC & Authentication Boundaries', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId}/release-safety/evaluate`)
        .expect(401);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId}/release-safety/latest`)
        .expect(401);
    });

    it('rejects evaluation requests from VIEWER role with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId}/release-safety/evaluate`)
        .set('Cookie', viewerCookie)
        .expect(403);

      expect(res.body.message || res.body.error).toBeDefined();
    });

    it('allows VIEWER role to read latest release safety assessment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId}/release-safety/latest`)
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(res.body.assessment).toBeDefined();
      expect(res.body.assessment.id).toBe(assessmentId);
    });

    it('allows OWNER role to trigger release safety evaluation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId}/release-safety/evaluate`)
        .set('Cookie', ownerCookie)
        .send({ force: false })
        .expect(200);

      expect(res.body.id).toBe(assessmentId);
      expect(res.body.decision).toBe('REVIEW_REQUIRED');
    });

    it('enforces multi-tenancy: org2 cannot access org1 changeSet release safety', async () => {
      // User is OWNER in org2, but changeSet is in org1
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId2}/changes/${changeSetId}/release-safety/latest`)
        .set('Cookie', viewerCookie)
        .expect(200)
        .expect((res) => {
          expect(res.body.assessment).toBeNull();
        });
    });
  });

  describe('Assessment Retrieval & Signal Inspection', () => {
    it('retrieves an assessment by ID with signals', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/release-safety/assessments/${assessmentId}`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.id).toBe(assessmentId);
      expect(res.body.policyVersion).toBe('impactra-release-safety-v1');
      expect(res.body.riskScore).toBe(45);
      expect(res.body.riskLevel).toBe('MEDIUM');
      expect(res.body.decision).toBe('REVIEW_REQUIRED');
      expect(Array.isArray(res.body.signals)).toBe(true);
    });

    it('lists paginated signals for an assessment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/release-safety/assessments/${assessmentId}/signals?page=1&limit=10`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBe(3);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
    });

    it('filters signals by category', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/release-safety/assessments/${assessmentId}/signals?category=ARCHITECTURE`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.items.length).toBe(2);
      expect(res.body.items.every((i: any) => i.category === 'ARCHITECTURE')).toBe(true);
    });

    it('lists assessments with pagination and filters', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/release-safety/assessments?decision=REVIEW_REQUIRED`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].decision).toBe('REVIEW_REQUIRED');
    });
  });

  describe('Deterministic Evaluation Execution', () => {
    it('executes full evaluation pipeline deterministically', async () => {
      await analysisService.executeEvaluation(assessmentId);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId1}/release-safety/assessments/${assessmentId}`)
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.status).toBe('SUCCEEDED');
      expect(res.body.riskScore).toBeGreaterThan(0);
      expect(res.body.decision).toBeDefined();
      expect(res.body.signals.length).toBeGreaterThan(0);
    });
  });
});
