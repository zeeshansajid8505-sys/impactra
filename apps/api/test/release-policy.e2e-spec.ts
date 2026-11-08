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
import { GitHubCheckPublicationService } from '../src/github-checks/services/github-check-publication.service';
import { GitHubCheckClientService } from '../src/github-checks/services/github-check-client.service';
import { GitHubCheckQueueService } from '../src/github-checks/queue/github-check-queue.service';
import { GitHubInstallationService } from '../src/github/services/github-installation.service';
import { GitHubClientService } from '../src/github/services/github-client.service';
import { getQueueToken } from '@nestjs/bullmq';
import { IngestionProcessor } from '../src/ingestion/ingestion.processor';
import { ChangesProcessor } from '../src/changes/changes.processor';
import { BlastRadiusProcessor } from '../src/blast-radius/blast-radius.processor';
import { ReleaseSafetyProcessor } from '../src/release-safety/release-safety.processor';
import { GitHubCheckProcessor } from '../src/github-checks/github-check.processor';
import {
  ReleasePolicyStatus,
  ReleasePolicyRuleType,
  ReleasePolicyAction,
  ReleasePolicyScope,
  ReleasePolicyEventType,
} from '@impactra/database';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Release Policy Configuration & Enforcement Foundation (E2E)', () => {
  let app: INestApplication;

  // In-memory data store for E2E tests
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const changeSets: any[] = [];
  const changeRevisions: any[] = [];
  const blastRadiusAnalyses: any[] = [];
  const changedFiles: any[] = [];
  const dependencyDeltas: any[] = [];
  const blastRadiusFindings: any[] = [];
  const releaseSafetyAssessments: any[] = [];
  const releaseSafetySignals: any[] = [];
  const releasePolicies: any[] = [];
  const releasePolicyRules: any[] = [];
  const releasePolicyEvents: any[] = [];
  const releaseApprovalRequests: any[] = [];

  const orgId1 = 'org-pol-1';
  const orgId2 = 'org-pol-2';
  const repoId1 = 'repo-pol-1';
  const repoId2 = 'repo-pol-2';
  const changeSetId1 = 'cs-pol-1';
  const changeRevisionId1 = 'rev-pol-1';
  const blastAnalysisId1 = 'blast-pol-1';

  let ownerCookie = '';
  let adminCookie = '';
  let architectCookie = '';
  let securityEngineerCookie = '';
  let developerCookie = '';
  let releaseManagerCookie = '';
  let qaEngineerCookie = '';
  let auditorCookie = '';
  let viewerCookie = '';

  let ownerUser: any;
  let adminUser: any;
  let architectUser: any;
  let securityEngineerUser: any;
  let developerUser: any;
  let releaseManagerUser: any;
  let qaEngineerUser: any;
  let auditorUser: any;
  let viewerUser: any;

  beforeAll(async () => {
    // Clear all in-memory collections
    users.length = 0;
    sessions.length = 0;
    organizations.length = 0;
    memberships.length = 0;
    repositories.length = 0;
    changeSets.length = 0;
    changeRevisions.length = 0;
    blastRadiusAnalyses.length = 0;
    changedFiles.length = 0;
    dependencyDeltas.length = 0;
    blastRadiusFindings.length = 0;
    releaseSafetyAssessments.length = 0;
    releaseSafetySignals.length = 0;
    releasePolicies.length = 0;
    releasePolicyRules.length = 0;
    releasePolicyEvents.length = 0;
    releaseApprovalRequests.length = 0;

    // Initialize 9 canonical role users
    ownerUser = { id: 'u-owner', email: 'owner@test.com', name: 'Owner' };
    adminUser = { id: 'u-admin', email: 'admin@test.com', name: 'Admin' };
    architectUser = { id: 'u-arch', email: 'arch@test.com', name: 'Architect' };
    securityEngineerUser = { id: 'u-sec', email: 'sec@test.com', name: 'Security' };
    developerUser = { id: 'u-dev', email: 'dev@test.com', name: 'Developer' };
    releaseManagerUser = { id: 'u-rm', email: 'rm@test.com', name: 'ReleaseManager' };
    qaEngineerUser = { id: 'u-qa', email: 'qa@test.com', name: 'QA' };
    auditorUser = { id: 'u-audit', email: 'audit@test.com', name: 'Auditor' };
    viewerUser = { id: 'u-view', email: 'view@test.com', name: 'Viewer' };

    users.push(
      ownerUser,
      adminUser,
      architectUser,
      securityEngineerUser,
      developerUser,
      releaseManagerUser,
      qaEngineerUser,
      auditorUser,
      viewerUser,
    );

    // Organizations
    organizations.push(
      { id: orgId1, name: 'Acme Corp', slug: 'acme-corp' },
      { id: orgId2, name: 'Stark Industries', slug: 'stark-ind' },
    );

    // Memberships for Org 1
    const createMembership = (id: string, user: any, role: string, orgId = orgId1) => ({
      id,
      organizationId: orgId,
      userId: user.id,
      role,
      user,
    });

    memberships.push(
      createMembership('m-owner', ownerUser, 'OWNER'),
      createMembership('m-admin', adminUser, 'ADMIN'),
      createMembership('m-arch', architectUser, 'ARCHITECT'),
      createMembership('m-sec', securityEngineerUser, 'SECURITY_ENGINEER'),
      createMembership('m-dev', developerUser, 'DEVELOPER'),
      createMembership('m-rm', releaseManagerUser, 'RELEASE_MANAGER'),
      createMembership('m-qa', qaEngineerUser, 'QA_ENGINEER'),
      createMembership('m-audit', auditorUser, 'AUDITOR'),
      createMembership('m-view', viewerUser, 'VIEWER'),
      // Dev user also in Org 2
      createMembership('m-dev-org2', developerUser, 'DEVELOPER', orgId2),
    );

    // Sessions & Cookies
    const setupSession = (user: any, token: string) => {
      sessions.push({
        id: `s-${user.id}`,
        userId: user.id,
        sessionTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
      });
      return `impactra_session=${token}`;
    };

    ownerCookie = setupSession(ownerUser, 'tok-owner');
    adminCookie = setupSession(adminUser, 'tok-admin');
    architectCookie = setupSession(architectUser, 'tok-arch');
    securityEngineerCookie = setupSession(securityEngineerUser, 'tok-sec');
    developerCookie = setupSession(developerUser, 'tok-dev');
    releaseManagerCookie = setupSession(releaseManagerUser, 'tok-rm');
    qaEngineerCookie = setupSession(qaEngineerUser, 'tok-qa');
    auditorCookie = setupSession(auditorUser, 'tok-audit');
    viewerCookie = setupSession(viewerUser, 'tok-view');

    // Repositories
    repositories.push(
      {
        id: repoId1,
        organizationId: orgId1,
        name: 'core-backend',
        defaultBranch: 'main',
      },
      {
        id: repoId2,
        organizationId: orgId2,
        name: 'other-repo',
        defaultBranch: 'main',
      },
    );

    // ChangeSet & Revision
    changeSets.push({
      id: changeSetId1,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      pullRequestNumber: 42,
      targetBranch: 'main',
      sourceBranch: 'feature/payment-v2',
      state: 'OPEN',
      revisions: [],
    });

    changeRevisions.push({
      id: changeRevisionId1,
      changeSetId: changeSetId1,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      baseSha: '000000',
      headSha: '111111',
      filesAdded: 1,
      filesModified: 1,
      filesDeleted: 0,
      filesRenamed: 0,
    });

    changeSets[0].revisions = [changeRevisions[0]];

    // Blast Radius Analysis
    blastRadiusAnalyses.push({
      id: blastAnalysisId1,
      changeRevisionId: changeRevisionId1,
      status: 'SUCCEEDED',
      maxDepth: 3,
      rootCount: 2,
      affectedNodeCount: 8,
      firstOrderCount: 4,
      transitiveCount: 4,
      truncated: false,
    });

    // Changed Files
    changedFiles.push(
      {
        id: 'cf-1',
        changeRevisionId: changeRevisionId1,
        newPath: 'packages/auth/src/token.ts',
        oldPath: null,
        status: 'ADDED',
        additions: 50,
        deletions: 0,
        changes: 50,
      },
      {
        id: 'cf-2',
        changeRevisionId: changeRevisionId1,
        newPath: 'apps/api/src/payment.ts',
        oldPath: 'apps/api/src/payment.ts',
        status: 'MODIFIED',
        additions: 20,
        deletions: 5,
        changes: 25,
      },
    );

    // Mock Database Service
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
            const s = sessions.find((item) => item.sessionTokenHash === where.sessionTokenHash || item.id === where.id);
            if (!s) return Promise.resolve(null);
            const u = users.find((item) => item.id === s.userId);
            return Promise.resolve({ ...s, user: u });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const s = sessions.find((item) => item.sessionTokenHash === where.sessionTokenHash || item.id === where.id);
            if (!s) return Promise.resolve(null);
            const u = users.find((item) => item.id === s.userId);
            return Promise.resolve({ ...s, user: u });
          }),
        },
        organization: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(organizations.find((o) => o.id === where.id) || null);
          }),
        },
        organizationMembership: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const m = memberships.find(
              (item) => item.organizationId === where.organizationId_userId?.organizationId &&
                        item.userId === where.organizationId_userId?.userId,
            );
            return Promise.resolve(m || null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const m = memberships.find(
              (item) => item.organizationId === where.organizationId && item.userId === where.userId,
            );
            return Promise.resolve(m || null);
          }),
        },
        repositoryConnection: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const r = repositories.find((item) => item.id === where.id && item.organizationId === where.organizationId);
            return Promise.resolve(r || null);
          }),
        },
        changeSet: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find((c) => c.id === where.id && c.organizationId === where.organizationId);
            if (!cs) return Promise.resolve(null);
            return Promise.resolve({ ...cs, revisions: changeRevisions.filter((r) => r.changeSetId === cs.id) });
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find((c) => c.id === where.id);
            return Promise.resolve(cs || null);
          }),
        },
        changeRevision: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(changeRevisions.find((r) => r.id === where.id) || null);
          }),
        },
        blastRadiusAnalysis: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              blastRadiusAnalyses.find((b) => b.changeRevisionId === where.changeRevisionId && b.status === where.status) || null,
            );
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(blastRadiusAnalyses.find((b) => b.id === where.id) || null);
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
        blastRadiusFinding: {
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(blastRadiusFindings.filter((bf) => bf.analysisId === where.analysisId));
          }),
        },
        releaseSafetyAssessment: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const a = releaseSafetyAssessments.find((item) => item.organizationId === where.organizationId && item.changeSetId === where.changeSetId);
            return Promise.resolve(a || null);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const a = releaseSafetyAssessments.find((item) => item.id === where.id);
            return Promise.resolve(a || null);
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = { id: `rsa-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
            releaseSafetyAssessments.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const idx = releaseSafetyAssessments.findIndex((item) => item.id === where.id);
            if (idx === -1) throw new Error('Not found');
            releaseSafetyAssessments[idx] = { ...releaseSafetyAssessments[idx], ...data, updatedAt: new Date() };
            return Promise.resolve(releaseSafetyAssessments[idx]);
          }),
        },
        releaseSafetySignal: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        releasePolicy: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            let matches = releasePolicies.filter((p) => {
              if (where.id && p.id !== where.id) return false;
              if (where.organizationId && p.organizationId !== where.organizationId) return false;
              if (where.name && p.name !== where.name) return false;
              if (where.repositoryConnectionId !== undefined && p.repositoryConnectionId !== where.repositoryConnectionId) return false;
              return true;
            });
            if (where.orderBy?.version === 'desc') {
              matches = matches.sort((a, b) => b.version - a.version);
            }
            const p = matches[0];
            if (!p) return Promise.resolve(null);
            const rules = releasePolicyRules.filter((r) => r.releasePolicyId === p.id);
            const events = releasePolicyEvents.filter((e) => e.releasePolicyId === p.id);
            return Promise.resolve({
              ...p,
              rules,
              events,
              createdByUser: users.find((u) => u.id === p.createdByUserId) || null,
              activatedByUser: users.find((u) => u.id === p.activatedByUserId) || null,
            });
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const p = releasePolicies.find((item) => item.id === where.id);
            if (!p) return Promise.resolve(null);
            const rules = releasePolicyRules.filter((r) => r.releasePolicyId === p.id);
            const events = releasePolicyEvents.filter((e) => e.releasePolicyId === p.id);
            return Promise.resolve({
              ...p,
              rules,
              events,
              createdByUser: users.find((u) => u.id === p.createdByUserId) || null,
              activatedByUser: users.find((u) => u.id === p.activatedByUserId) || null,
            });
          }),
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            let list = releasePolicies.filter((p) => {
              if (where.organizationId && p.organizationId !== where.organizationId) return false;
              if (where.status && p.status !== where.status) return false;
              if (where.isDefault !== undefined && p.isDefault !== where.isDefault) return false;
              if (where.repositoryConnectionId !== undefined && p.repositoryConnectionId !== where.repositoryConnectionId) return false;
              return true;
            });
            return Promise.resolve(
              list.map((p) => ({
                ...p,
                rules: releasePolicyRules.filter((r) => r.releasePolicyId === p.id),
                events: releasePolicyEvents.filter((e) => e.releasePolicyId === p.id),
                createdByUser: users.find((u) => u.id === p.createdByUserId) || null,
                activatedByUser: users.find((u) => u.id === p.activatedByUserId) || null,
              })),
            );
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const id = data.id || `pol-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const created = {
              id,
              organizationId: data.organization.connect.id,
              repositoryConnectionId: data.repositoryConnection?.connect?.id || null,
              name: data.name,
              description: data.description || null,
              status: data.status || ReleasePolicyStatus.DRAFT,
              version: data.version || 1,
              isDefault: data.isDefault || false,
              targetBranchPattern: data.targetBranchPattern || null,
              createdByUserId: data.createdByUser.connect.id,
              activatedByUserId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              activatedAt: null,
              supersededAt: null,
              archivedAt: null,
            };
            releasePolicies.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const idx = releasePolicies.findIndex((item) => item.id === where.id);
            if (idx === -1) throw new Error('Not found');
            releasePolicies[idx] = { ...releasePolicies[idx], ...data, updatedAt: new Date() };
            return Promise.resolve(releasePolicies[idx]);
          }),
        },
        releasePolicyRule: {
          createMany: jest.fn().mockImplementation(({ data }: any) => {
            const created = data.map((d: any) => ({
              id: `rule-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              ...d,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
            releasePolicyRules.push(...created);
            return Promise.resolve({ count: created.length });
          }),
          deleteMany: jest.fn().mockImplementation(({ where }: any) => {
            const initial = releasePolicyRules.length;
            for (let i = releasePolicyRules.length - 1; i >= 0; i--) {
              if (releasePolicyRules[i].releasePolicyId === where.releasePolicyId) {
                releasePolicyRules.splice(i, 1);
              }
            }
            return Promise.resolve({ count: initial - releasePolicyRules.length });
          }),
        },
        releasePolicyEvent: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            const event = {
              id: `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              ...data,
              createdAt: new Date(),
            };
            releasePolicyEvents.push(event);
            return Promise.resolve(event);
          }),
        },
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDbService)
      .overrideProvider(CacheService)
      .useValue({ get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(StorageService)
      .useValue({ upload: jest.fn().mockResolvedValue(undefined), download: jest.fn().mockResolvedValue(Buffer.from('')) })
      .overrideProvider(GitHubCheckPublicationService)
      .useValue({ autoTriggerForAssessment: jest.fn().mockResolvedValue({ id: 'pub-mock', status: 'SUCCEEDED' }) })
      .overrideProvider(GitHubCheckClientService)
      .useValue({ createCheckRun: jest.fn().mockResolvedValue({ id: 12345 }), updateCheckRun: jest.fn().mockResolvedValue({ id: 12345 }) })
      .overrideProvider(GitHubCheckQueueService)
      .useValue({ enqueue: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(GitHubInstallationService)
      .useValue({ getInstallationToken: jest.fn().mockResolvedValue('token') })
      .overrideProvider(GitHubClientService)
      .useValue({ getOctokitForInstallation: jest.fn().mockResolvedValue({}) })
      .overrideProvider(IngestionProcessor)
      .useValue({ process: jest.fn() })
      .overrideProvider(ChangesProcessor)
      .useValue({ process: jest.fn() })
      .overrideProvider(BlastRadiusProcessor)
      .useValue({ process: jest.fn() })
      .overrideProvider(ReleaseSafetyProcessor)
      .useValue({ process: jest.fn() })
      .overrideProvider(GitHubCheckProcessor)
      .useValue({ process: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.use(json({ limit: '1mb' }));
    app.use(urlencoded({ extended: true, limit: '1mb' }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ============================================================
  // Scenario 1: Unauthenticated Read -> 401
  // ============================================================
  it('Scenario 1: unauthenticated list returns 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${orgId1}/release-policies`)
      .set('x-organization-id', orgId1);
    expect(res.status).toBe(401);
  });

  // ============================================================
  // Scenario 2: All 9 Roles Can Read Policies
  // ============================================================
  it('Scenario 2: all 9 canonical roles can list release policies', async () => {
    const cookies = [
      ownerCookie,
      adminCookie,
      architectCookie,
      securityEngineerCookie,
      developerCookie,
      releaseManagerCookie,
      qaEngineerCookie,
      auditorCookie,
      viewerCookie,
    ];

    for (const cookie of cookies) {
      const res = await request(app.getHttpServer())
        .get(`/organizations/${orgId1}/release-policies`)
        .set('Cookie', cookie)
        .set('x-organization-id', orgId1);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  // ============================================================
  // Scenarios 3-11: Creation RBAC (OWNER, ADMIN, ARCHITECT, RM allowed; others 403)
  // ============================================================
  it('Scenarios 3-6: OWNER, ADMIN, ARCHITECT, RELEASE_MANAGER can create DRAFT policies', async () => {
    const allowed = [
      { cookie: ownerCookie, name: 'Owner Policy' },
      { cookie: adminCookie, name: 'Admin Policy' },
      { cookie: architectCookie, name: 'Architect Policy' },
      { cookie: releaseManagerCookie, name: 'RM Policy' },
    ];

    for (const item of allowed) {
      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/release-policies`)
        .set('Cookie', item.cookie)
        .set('x-organization-id', orgId1)
        .send({
          name: item.name,
          description: 'A test policy',
          rules: [
            {
              ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
              action: ReleasePolicyAction.REQUIRE_REVIEW,
              thresholdNumeric: 50,
            },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe(item.name);
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('Scenarios 7-11: DEVELOPER, SECURITY_ENGINEER, QA_ENGINEER, AUDITOR, VIEWER are denied creation (403)', async () => {
    const deniedCookies = [
      developerCookie,
      securityEngineerCookie,
      qaEngineerCookie,
      auditorCookie,
      viewerCookie,
    ];

    for (const cookie of deniedCookies) {
      const res = await request(app.getHttpServer())
        .post(`/organizations/${orgId1}/release-policies`)
        .set('Cookie', cookie)
        .set('x-organization-id', orgId1)
        .send({
          name: 'Unauthorized Policy',
          rules: [],
        });
      expect(res.status).toBe(403);
    }
  });

  // ============================================================
  // Scenario 12-14: Organization Default, Repo Default, Cross-Tenant Guard
  // ============================================================
  let orgDefaultDraftId: string;
  let repoDraftId: string;

  it('Scenario 12: creates organization default DRAFT policy', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Org Production Default Policy',
        description: 'Standard company wide policy',
        isDefault: true,
        rules: [
          {
            ruleKey: 'org_max_risk',
            ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
            action: ReleasePolicyAction.BLOCK,
            thresholdNumeric: 75,
            order: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.isDefault).toBe(true);
    orgDefaultDraftId = res.body.id;
  });

  it('Scenario 13: creates repository-specific DRAFT policy', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Repo Core Default Policy',
        repositoryConnectionId: repoId1,
        isDefault: true,
        rules: [
          {
            ruleKey: 'repo_max_risk',
            ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
            action: ReleasePolicyAction.BLOCK,
            thresholdNumeric: 70,
            order: 0,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.repositoryConnectionId).toBe(repoId1);
    repoDraftId = res.body.id;
  });

  it('Scenario 14: rejects repository belonging to another organization (404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Cross Tenant Policy',
        repositoryConnectionId: repoId2, // repo belongs to Org 2
        rules: [],
      });
    expect(res.status).toBe(404);
  });

  // ============================================================
  // Scenarios 15-16: Update DRAFT succeeds, update ACTIVE denied
  // ============================================================
  it('Scenario 15: update DRAFT policy succeeds', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        description: 'Updated description for draft',
        rules: [
          {
            ruleKey: 'org_max_risk',
            ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
            action: ReleasePolicyAction.BLOCK,
            thresholdNumeric: 80,
            order: 0,
          },
          {
            ruleKey: 'org_crit_signal',
            ruleType: ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT,
            action: ReleasePolicyAction.BLOCK,
            order: 1,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description for draft');
    expect(res.body.rules.length).toBe(2);
  });

  // ============================================================
  // Scenarios 17-22: Activation RBAC, Supersession, Conflict handling
  // ============================================================
  it('Scenario 17-20: Activation RBAC (ARCHITECT denied 403, OWNER/ADMIN/RM allowed)', async () => {
    // ARCHITECT activate denied
    const archRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}/activate`)
      .set('Cookie', architectCookie)
      .set('x-organization-id', orgId1);
    expect(archRes.status).toBe(403);

    // OWNER activate succeeds
    const ownerRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}/activate`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.status).toBe('ACTIVE');
    expect(ownerRes.body.activatedAt).toBeDefined();
  });

  it('Scenario 16: update ACTIVE policy is rejected (400)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ name: 'Mutated Active Policy' });
    expect(res.status).toBe(400);
  });

  it('Scenario 21: activating an already active policy is rejected (400)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}/activate`)
      .set('Cookie', adminCookie)
      .set('x-organization-id', orgId1);
    expect(res.status).toBe(400);
  });

  it('Scenario 22: activating new version supersedes prior active version atomically', async () => {
    // 1. Create DRAFT v2 with same name
    const createV2 = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Org Production Default Policy',
        isDefault: true,
        rules: [
          {
            ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
            action: ReleasePolicyAction.BLOCK,
            thresholdNumeric: 70,
          },
        ],
      });
    expect(createV2.status).toBe(201);
    expect(createV2.body.version).toBe(2);
    const v2Id = createV2.body.id;

    // 2. Activate v2
    const actRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${v2Id}/activate`)
      .set('Cookie', releaseManagerCookie)
      .set('x-organization-id', orgId1);
    expect(actRes.status).toBe(200);
    expect(actRes.body.status).toBe('ACTIVE');

    // 3. Verify prior v1 is now SUPERSEDED
    const v1Check = await request(app.getHttpServer())
      .get(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);
    expect(v1Check.status).toBe(200);
    expect(v1Check.body.status).toBe('SUPERSEDED');
    expect(v1Check.body.supersededAt).toBeDefined();
  });

  // ============================================================
  // Scenarios 23-25: Archival RBAC (OWNER/ADMIN allowed, RM denied)
  // ============================================================
  it('Scenarios 23-25: Archival RBAC (RM denied 403, ADMIN succeeds)', async () => {
    const rmRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}/archive`)
      .set('Cookie', releaseManagerCookie)
      .set('x-organization-id', orgId1);
    expect(rmRes.status).toBe(403);

    const adminRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${orgDefaultDraftId}/archive`)
      .set('Cookie', adminCookie)
      .set('x-organization-id', orgId1);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.status).toBe('ARCHIVED');
  });

  // ============================================================
  // Scenarios 26-30: Policy Resolver Precedence
  // ============================================================
  it('Scenarios 26-30: verifies resolution precedence across scopes', async () => {
    // Activate repository draft
    await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${repoDraftId}/activate`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    // Query effective policy for repo1
    const resRepo = await request(app.getHttpServer())
      .get(`/organizations/${orgId1}/repositories/${repoId1}/effective-release-policy`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);
    expect(resRepo.status).toBe(200);
    expect(resRepo.body.scope).toBe(ReleasePolicyScope.REPOSITORY_DEFAULT);
    expect(resRepo.body.policyId).toBe(repoDraftId);

    // Create & activate branch specific policy for 'release/*'
    const branchDraft = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Repo Release Branch Policy',
        repositoryConnectionId: repoId1,
        targetBranchPattern: 'release/*',
        rules: [],
      });
    await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${branchDraft.body.id}/activate`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    // Query with branch='release/2026-10' -> REPOSITORY_BRANCH
    const resBranch = await request(app.getHttpServer())
      .get(`/organizations/${orgId1}/repositories/${repoId1}/effective-release-policy?branch=release/2026-10`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);
    expect(resBranch.status).toBe(200);
    expect(resBranch.body.scope).toBe(ReleasePolicyScope.REPOSITORY_BRANCH);
    expect(resBranch.body.policyId).toBe(branchDraft.body.id);
  });

  // ============================================================
  // Scenarios 40-43: Policy Preview & Non-Mutation
  // ============================================================
  it('Scenarios 40-43: preview generates predicted decision with zero database mutation', async () => {
    const previewPolicy = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Preview Simulation Policy',
        rules: [
          {
            ruleKey: 'preview_blast',
            ruleType: ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD,
            action: ReleasePolicyAction.BLOCK,
            thresholdNumeric: 5, // actual is 8 -> matches!
          },
        ],
      });
    const polId = previewPolicy.body.id;

    const initialAssessmentsCount = releaseSafetyAssessments.length;
    const initialApprovalRequestsCount = releaseApprovalRequests.length;

    const previewRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies/${polId}/preview`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ changeSetId: changeSetId1 });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.previewOnly).toBe(true);
    expect(previewRes.body.predictedDecision).toBe('BLOCKED');
    expect(previewRes.body.finalAction).toBe('BLOCK');
    expect(previewRes.body.matchedRules.length).toBe(1);

    // Assert strictly zero DB mutations
    expect(releaseSafetyAssessments.length).toBe(initialAssessmentsCount);
    expect(releaseApprovalRequests.length).toBe(initialApprovalRequestsCount);
  });

  // ============================================================
  // Scenarios 51-52: Tenant Isolation
  // ============================================================
  it('Scenarios 51-52: enforces multi-tenant boundary for read and mutations', async () => {
    // Org 1 policy cannot be read by Org 2 context
    const readRes = await request(app.getHttpServer())
      .get(`/organizations/${orgId2}/release-policies/${repoDraftId}`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId2);
    expect(readRes.status).toBe(404);

    // Org 2 user cannot activate Org 1 policy
    const actRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId2}/release-policies/${repoDraftId}/activate`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId2);
    expect(actRes.status).toBe(403);
  });

  // ============================================================
  // Scenarios 55-58: Input Validation & Boundary Guards
  // ============================================================
  it('Scenarios 55-58: rejects invalid thresholds, empty names, and duplicate rule keys', async () => {
    // Empty name rejected
    const emptyNameRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ name: '   ', rules: [] });
    expect(emptyNameRes.status).toBe(400);

    // Invalid threshold (score > 100)
    const invalidThresholdRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Invalid Threshold Policy',
        rules: [
          {
            ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
            thresholdNumeric: 150,
          },
        ],
      });
    expect(invalidThresholdRes.status).toBe(400);

    // Duplicate rule keys
    const dupKeyRes = await request(app.getHttpServer())
      .post(`/organizations/${orgId1}/release-policies`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({
        name: 'Duplicate Key Policy',
        rules: [
          { ruleKey: 'dup_key', ruleType: ReleasePolicyRuleType.REQUIRE_APPROVAL },
          { ruleKey: 'dup_key', ruleType: ReleasePolicyRuleType.REQUIRE_APPROVAL },
        ],
      });
    expect(dupKeyRes.status).toBe(400);
  });
});
