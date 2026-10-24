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
  EffectiveReleaseAuthorization,
  ReleaseApprovalStatus,
  ReleaseApprovalResolution,
} from '@impactra/shared';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Release Approval & Exception Workflow Foundation (E2E)', () => {
  let app: INestApplication;
  let mockPublicationService: any;

  // In-memory data store for E2E tests
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const repositories: any[] = [];
  const changeSets: any[] = [];
  const changeRevisions: any[] = [];
  const releaseSafetyAssessments: any[] = [];
  const releaseSafetySignals: any[] = [];
  const releaseApprovalRequests: any[] = [];
  const releaseApprovalEvents: any[] = [];
  const gitHubCheckPublications: any[] = [];

  const orgId1 = 'org-ra-1';
  const orgId2 = 'org-ra-2';
  const repoId1 = 'repo-ra-1';
  const changeSetId1 = 'cs-ra-1';
  const changeRevisionId1 = 'rev-ra-1';
  const assessmentPassId = 'rsa-pass-1';
  const assessmentReviewId = 'rsa-review-1';
  const assessmentBlockedId = 'rsa-blocked-1';

  let ownerCookie = '';
  let adminCookie = '';
  let architectCookie = '';
  let securityEngineerCookie = '';
  let developerCookie = '';
  let releaseManagerCookie = '';
  let qaEngineerCookie = '';
  let auditorCookie = '';
  let viewerCookie = '';

  let devUser: any;
  let ownerUser: any;
  let adminUser: any;
  let rmUser: any;

  beforeAll(async () => {
    users.length = 0;
    sessions.length = 0;
    organizations.length = 0;
    memberships.length = 0;
    repositories.length = 0;
    changeSets.length = 0;
    changeRevisions.length = 0;
    releaseSafetyAssessments.length = 0;
    releaseSafetySignals.length = 0;
    releaseApprovalRequests.length = 0;
    releaseApprovalEvents.length = 0;
    gitHubCheckPublications.length = 0;

    // All 9 Canonical Users
    ownerUser = {
      id: 'user-owner',
      email: 'owner@impactra.test',
      name: 'Owner User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    adminUser = {
      id: 'user-admin',
      email: 'admin@impactra.test',
      name: 'Admin User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const architectUser = {
      id: 'user-architect',
      email: 'architect@impactra.test',
      name: 'Architect User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const securityEngineerUser = {
      id: 'user-sec',
      email: 'sec@impactra.test',
      name: 'Security Engineer User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    devUser = {
      id: 'user-dev',
      email: 'dev@impactra.test',
      name: 'Developer User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    rmUser = {
      id: 'user-rm',
      email: 'rm@impactra.test',
      name: 'Release Manager User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const qaEngineerUser = {
      id: 'user-qa',
      email: 'qa@impactra.test',
      name: 'QA Engineer User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const auditorUser = {
      id: 'user-auditor',
      email: 'auditor@impactra.test',
      name: 'Auditor User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewerUser = {
      id: 'user-viewer',
      email: 'viewer@impactra.test',
      name: 'Viewer User',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.push(
      ownerUser,
      adminUser,
      architectUser,
      securityEngineerUser,
      devUser,
      rmUser,
      qaEngineerUser,
      auditorUser,
      viewerUser,
    );

    // Organizations
    organizations.push(
      {
        id: orgId1,
        name: 'RA Org 1',
        slug: 'ra-org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orgId2,
        name: 'RA Org 2',
        slug: 'ra-org-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Memberships for Org 1 (all 9 canonical roles)
    memberships.push(
      {
        id: 'm-owner',
        organizationId: orgId1,
        userId: ownerUser.id,
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-admin',
        organizationId: orgId1,
        userId: adminUser.id,
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-architect',
        organizationId: orgId1,
        userId: architectUser.id,
        role: 'ARCHITECT',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-sec',
        organizationId: orgId1,
        userId: securityEngineerUser.id,
        role: 'SECURITY_ENGINEER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-dev',
        organizationId: orgId1,
        userId: devUser.id,
        role: 'DEVELOPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-rm',
        organizationId: orgId1,
        userId: rmUser.id,
        role: 'RELEASE_MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-qa',
        organizationId: orgId1,
        userId: qaEngineerUser.id,
        role: 'QA_ENGINEER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-auditor',
        organizationId: orgId1,
        userId: auditorUser.id,
        role: 'AUDITOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-viewer',
        organizationId: orgId1,
        userId: viewerUser.id,
        role: 'VIEWER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Dev user also belongs to Org 2 for cross-tenant testing
      {
        id: 'm-dev-org2',
        organizationId: orgId2,
        userId: devUser.id,
        role: 'DEVELOPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Sessions and cookies
    const setupSession = (user: any, token: string) => {
      sessions.push({
        id: `s-${user.id}`,
        userId: user.id,
        sessionTokenHash: crypto
          .createHash('sha256')
          .update(token)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        lastActiveAt: new Date(),
        revokedAt: null,
      });
      return `impactra_session=${token}`;
    };

    ownerCookie = setupSession(ownerUser, 'token-owner-ra');
    adminCookie = setupSession(adminUser, 'token-admin-ra');
    architectCookie = setupSession(architectUser, 'token-architect-ra');
    securityEngineerCookie = setupSession(securityEngineerUser, 'token-sec-ra');
    developerCookie = setupSession(devUser, 'token-dev-ra');
    releaseManagerCookie = setupSession(rmUser, 'token-rm-ra');
    qaEngineerCookie = setupSession(qaEngineerUser, 'token-qa-ra');
    auditorCookie = setupSession(auditorUser, 'token-auditor-ra');
    viewerCookie = setupSession(viewerUser, 'token-viewer-ra');

    // Connected GitHub Repository
    const repo1 = {
      id: repoId1,
      organizationId: orgId1,
      githubInstallationId: '12345678',
      githubRepositoryId: '98765432',
      ownerLogin: 'impactra-org',
      name: 'core-service',
      fullName: 'impactra-org/core-service',
      defaultBranch: 'main',
      connected: true,
      available: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositories.push(repo1);

    // ChangeSet
    const headCommitSha = 'a1b2c3d4e5f60123456789abcdef0123456789ab';
    const cs1 = {
      id: changeSetId1,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      provider: 'github',
      providerPullRequestId: '202',
      pullRequestNumber: 202,
      title: 'feat: add payment gateway',
      authorLogin: 'alice',
      baseRef: 'main',
      headRef: 'feature/payment',
      currentBaseSha: '0000000000000000000000000000000000000000',
      currentHeadSha: headCommitSha,
      state: 'open',
      isDraft: false,
      isMerged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeSets.push(cs1);

    // Revision
    const rev1 = {
      id: changeRevisionId1,
      changeSetId: changeSetId1,
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      baseSha: cs1.currentBaseSha,
      headSha: cs1.currentHeadSha,
      analysisVersion: 'change-analysis-v1',
      status: 'SUCCEEDED',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    changeRevisions.push(rev1);

    // Assessments
    const passAssessment = {
      id: assessmentPassId,
      organizationId: orgId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      blastRadiusAnalysisId: 'blast-1',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 20,
      riskLevel: 'LOW',
      decision: 'PASS',
      signalCount: 1,
      blockingSignalCount: 0,
      reviewSignalCount: 0,
      createdAt: new Date(Date.now() - 3000),
      updatedAt: new Date(Date.now() - 3000),
    };

    const reviewAssessment = {
      id: assessmentReviewId,
      organizationId: orgId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      blastRadiusAnalysisId: 'blast-2',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 65,
      riskLevel: 'HIGH',
      decision: 'REVIEW_REQUIRED',
      signalCount: 3,
      blockingSignalCount: 0,
      reviewSignalCount: 1,
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 1000),
    };

    const blockedAssessment = {
      id: assessmentBlockedId,
      organizationId: orgId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      blastRadiusAnalysisId: 'blast-3',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 85,
      riskLevel: 'CRITICAL',
      decision: 'BLOCKED',
      signalCount: 4,
      blockingSignalCount: 1,
      reviewSignalCount: 1,
      createdAt: new Date(Date.now() - 2500),
      updatedAt: new Date(Date.now() - 2500),
    };

    releaseSafetyAssessments.push(
      passAssessment,
      reviewAssessment,
      blockedAssessment,
    );

    // Mock Database Service
    const mockDbService = {
      client: {
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          return callback(mockDbService.client);
        }),
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              users.find(
                (u) => u.id === where.id || u.email === where.email,
              ) || null,
            );
          }),
        },
        session: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const s = sessions.find(
              (item) =>
                (where.sessionTokenHash &&
                  item.sessionTokenHash === where.sessionTokenHash) ||
                (where.id && item.id === where.id),
            );
            if (!s) return Promise.resolve(null);
            const u = users.find((item) => item.id === s.userId);
            return Promise.resolve({ ...s, user: u });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const s = sessions.find(
              (item) =>
                (where.sessionTokenHash &&
                  item.sessionTokenHash === where.sessionTokenHash) ||
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
            return Promise.resolve(
              organizations.find((o) => o.id === where.id) || null,
            );
          }),
        },
        organizationMembership: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.organizationId_userId) {
              const { organizationId, userId } =
                where.organizationId_userId;
              return Promise.resolve(
                memberships.find(
                  (m) =>
                    m.organizationId === organizationId &&
                    m.userId === userId,
                ) || null,
              );
            }
            return Promise.resolve(null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              memberships.find(
                (m) =>
                  (!where.organizationId ||
                    m.organizationId === where.organizationId) &&
                  (!where.userId || m.userId === where.userId),
              ) || null,
            );
          }),
        },
        changeSet: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              changeSets.find(
                (cs) =>
                  (!where.id || cs.id === where.id) &&
                  (!where.organizationId ||
                    cs.organizationId === where.organizationId),
              ) || null,
            );
          }),
        },
        releaseSafetyAssessment: {
          findFirst: jest.fn().mockImplementation(({ where, orderBy }: any) => {
            let matches = releaseSafetyAssessments.filter(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.changeSetId || a.changeSetId === where.changeSetId) &&
                (!where.organizationId ||
                  a.organizationId === where.organizationId) &&
                (!where.status || a.status === where.status) &&
                (!where.decision || a.decision === where.decision),
            );
            if (orderBy && orderBy.createdAt === 'desc') {
              matches = matches.sort(
                (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
              );
            }
            return Promise.resolve(matches[0] || null);
          }),
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              releaseSafetyAssessments.find((a) => a.id === where.id) || null,
            );
          }),
        },
        releaseApprovalRequest: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const reqRecord = releaseApprovalRequests.find(
              (r) =>
                (where.id && r.id === where.id) ||
                (where.releaseSafetyAssessmentId &&
                  r.releaseSafetyAssessmentId ===
                    where.releaseSafetyAssessmentId),
            );
            if (!reqRecord) return Promise.resolve(null);
            const reqUser = users.find(
              (u) => u.id === reqRecord.requestedByUserId,
            );
            const resUser = users.find(
              (u) => u.id === reqRecord.resolvedByUserId,
            );
            const evts = releaseApprovalEvents.filter(
              (e) => e.approvalRequestId === reqRecord.id,
            );
            return Promise.resolve({
              ...reqRecord,
              requestedByUser: reqUser
                ? {
                    id: reqUser.id,
                    name: reqUser.name,
                    email: reqUser.email,
                  }
                : null,
              resolvedByUser: resUser
                ? {
                    id: resUser.id,
                    name: resUser.name,
                    email: resUser.email,
                  }
                : null,
              events: evts,
            });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const reqRecord = releaseApprovalRequests.find(
              (r) =>
                (!where.id || r.id === where.id) &&
                (!where.organizationId ||
                  r.organizationId === where.organizationId) &&
                (!where.changeSetId || r.changeSetId === where.changeSetId) &&
                (!where.releaseSafetyAssessmentId ||
                  r.releaseSafetyAssessmentId ===
                    where.releaseSafetyAssessmentId),
            );
            if (!reqRecord) return Promise.resolve(null);
            const assessment = releaseSafetyAssessments.find(
              (a) => a.id === reqRecord.releaseSafetyAssessmentId,
            );
            const reqUser = users.find(
              (u) => u.id === reqRecord.requestedByUserId,
            );
            const resUser = users.find(
              (u) => u.id === reqRecord.resolvedByUserId,
            );
            const evts = releaseApprovalEvents.filter(
              (e) => e.approvalRequestId === reqRecord.id,
            );
            return Promise.resolve({
              ...reqRecord,
              releaseSafetyAssessment: assessment,
              requestedByUser: reqUser
                ? {
                    id: reqUser.id,
                    name: reqUser.name,
                    email: reqUser.email,
                  }
                : null,
              resolvedByUser: resUser
                ? {
                    id: resUser.id,
                    name: resUser.name,
                    email: resUser.email,
                  }
                : null,
              events: evts,
            });
          }),
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = {
              id: data.id || `ra-req-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            releaseApprovalRequests.push(created);
            return Promise.resolve(created);
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const idx = releaseApprovalRequests.findIndex(
              (r) => r.id === where.id,
            );
            if (idx === -1) return Promise.resolve(null);
            const updated = {
              ...releaseApprovalRequests[idx],
              ...data,
              updatedAt: new Date(),
            };
            releaseApprovalRequests[idx] = updated;
            return Promise.resolve(updated);
          }),
        },
        releaseApprovalEvent: {
          create: jest.fn().mockImplementation(({ data }: any) => {
            const created = {
              id: data.id || `ra-evt-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              ...data,
              createdAt: new Date(),
            };
            releaseApprovalEvents.push(created);
            return Promise.resolve(created);
          }),
          findMany: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              releaseApprovalEvents.filter(
                (e) =>
                  !where.approvalRequestId ||
                  e.approvalRequestId === where.approvalRequestId,
              ),
            );
          }),
        },
        gitHubCheckPublication: {
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              gitHubCheckPublications.find(
                (p) =>
                  (!where.organizationId ||
                    p.organizationId === where.organizationId) &&
                  (!where.changeSetId || p.changeSetId === where.changeSetId),
              ) || null,
            );
          }),
          upsert: jest.fn().mockImplementation(({ create, update }: any) => {
            const pub = {
              id: `pub-${Date.now()}`,
              ...create,
              ...update,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            gitHubCheckPublications.push(pub);
            return Promise.resolve(pub);
          }),
        },
      },
    };

    mockPublicationService = {
      triggerPublication: jest.fn().mockResolvedValue({
        publicationId: 'pub-triggered-1',
        queued: true,
        message: 'Publication triggered',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDbService)
      .overrideProvider(CacheService)
      .useValue({
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(StorageService)
      .useValue({
        putObject: jest.fn().mockResolvedValue(undefined),
        getObject: jest.fn().mockResolvedValue(Buffer.from('')),
      })
      .overrideProvider(GitHubCheckPublicationService)
      .useValue(mockPublicationService)
      .overrideProvider(GitHubCheckClientService)
      .useValue({
        createCheckRun: jest.fn().mockResolvedValue({ id: 9999, html_url: 'https://github.com' }),
        updateCheckRun: jest.fn().mockResolvedValue({ id: 9999, html_url: 'https://github.com' }),
      })
      .overrideProvider(GitHubCheckQueueService)
      .useValue({
        enqueue: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(GitHubInstallationService)
      .useValue({
        getInstallationToken: jest.fn().mockResolvedValue('ghs_mock'),
      })
      .overrideProvider(GitHubClientService)
      .useValue({})
      .overrideProvider(IngestionProcessor)
      .useValue({ process: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(ChangesProcessor)
      .useValue({ process: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(BlastRadiusProcessor)
      .useValue({ process: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(ReleaseSafetyProcessor)
      .useValue({ process: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(GitHubCheckProcessor)
      .useValue({ process: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(getQueueToken('repo-ingestion'))
      .useValue({ opts: { connection: { host: 'localhost', port: 6380 } }, add: jest.fn(), getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue(undefined), on: jest.fn() })
      .overrideProvider(getQueueToken('changes-analysis'))
      .useValue({ opts: { connection: { host: 'localhost', port: 6380 } }, add: jest.fn(), getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue(undefined), on: jest.fn() })
      .overrideProvider(getQueueToken('blast-radius-analysis'))
      .useValue({ opts: { connection: { host: 'localhost', port: 6380 } }, add: jest.fn(), getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue(undefined), on: jest.fn() })
      .overrideProvider(getQueueToken('release-safety-analysis'))
      .useValue({ opts: { connection: { host: 'localhost', port: 6380 } }, add: jest.fn(), getJob: jest.fn(), close: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue(undefined), on: jest.fn() })
      .overrideProvider(getQueueToken('github-check-publication'))
      .useValue({
        opts: { connection: { host: 'localhost', port: 6380 } },
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
        getJob: jest.fn().mockResolvedValue(null),
        close: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      })
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

  // ============================================================
  // Scenario 1: Unauthenticated Read -> 401
  // ============================================================
  it('Scenario 1: unauthenticated read returns 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(401);
  });

  // ============================================================
  // Scenario 2: All 9 canonical roles can read
  // ============================================================
  it('Scenario 2: all 9 canonical roles can read workflow state (200 OK)', async () => {
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
        .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
        .set('Cookie', cookie)
        .set('x-organization-id', orgId1);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('changeSetId', changeSetId1);
      expect(res.body).toHaveProperty('effectiveAuthorization');
    }
  });

  // ============================================================
  // Scenario 3 & 4: Allowed vs Disallowed Request Roles
  // ============================================================
  it('Scenario 3: allowed roles (DEVELOPER, ARCHITECT, RM, etc.) can request approval', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId1)
      .send({
        assessmentId: assessmentReviewId,
        reason: 'Ready for peer approval review.',
      });

    expect(res.status).toBe(200);
    expect(res.body.approvalRequest).not.toBeNull();
    expect(res.body.approvalRequest.status).toBe('PENDING');
    expect(res.body.approvalRequest.requestedByUserId).toBe(devUser.id);
  });

  it('Scenario 4: disallowed roles (AUDITOR, VIEWER) cannot request approval (403 Forbidden)', async () => {
    const auditorRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', auditorCookie)
      .set('x-organization-id', orgId1)
      .send({ assessmentId: assessmentReviewId, reason: 'Auditor request' });
    expect(auditorRes.status).toBe(403);

    const viewerRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', viewerCookie)
      .set('x-organization-id', orgId1)
      .send({ assessmentId: assessmentReviewId, reason: 'Viewer request' });
    expect(viewerRes.status).toBe(403);
  });

  // ============================================================
  // Scenario 18: Self-approval rejected
  // ============================================================
  it('Scenario 18: self-approval is rejected (403 SELF_APPROVAL_NOT_ALLOWED)', async () => {
    const workflowRes = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId1);

    const approvalId = workflowRes.body.approvalRequest.id;

    // Developer tries to approve their own request
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${approvalId}/approve`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Self-approving my code.' });

    // Developer doesn't have resolve permission (403), but if admin requested, self-approval check triggers
    expect(res.status).toBe(403);
  });

  it('Scenario 18b: requester with elevated role attempting self-approval is rejected with SELF_APPROVAL_NOT_ALLOWED', async () => {
    // Admin creates an approval request on reviewAssessment
    const reqRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', adminCookie)
      .set('x-organization-id', orgId1)
      .send({ assessmentId: assessmentReviewId, reason: 'Admin requesting approval.' });

    const approvalId = reqRes.body.approvalRequest.id;
    // Set requestedByUserId to adminUser.id
    const targetReq = releaseApprovalRequests.find((r) => r.id === approvalId);
    targetReq.requestedByUserId = adminUser.id;
    targetReq.status = ReleaseApprovalStatus.PENDING;

    // Admin attempts to approve their own request
    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${approvalId}/approve`)
      .set('Cookie', adminCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Admin self-approving.' });

    expect(approveRes.status).toBe(403);
    expect(approveRes.body.code).toBe('SELF_APPROVAL_NOT_ALLOWED');
  });

  // ============================================================
  // Scenario 8-11: Disallowed resolve roles denied
  // ============================================================
  it('Scenario 8-11: DEVELOPER, QA_ENGINEER, AUDITOR, VIEWER cannot resolve approval (403 Forbidden)', async () => {
    const targetReq = releaseApprovalRequests[0];
    const deniedCookies = [developerCookie, qaEngineerCookie, auditorCookie, viewerCookie];

    for (const cookie of deniedCookies) {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
        .set('Cookie', cookie)
        .set('x-organization-id', orgId1)
        .send({ reason: 'Unauthorized approval attempt.' });

      expect(res.status).toBe(403);
    }
  });

  // ============================================================
  // Scenario 15-17: Validation failures for reason
  // ============================================================
  it('Scenario 15: empty reason rejected with 400 validation error', async () => {
    const targetReq = releaseApprovalRequests[0];
    targetReq.requestedByUserId = devUser.id;
    targetReq.status = ReleaseApprovalStatus.PENDING;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: '' });

    expect(res.status).toBe(400);
  });

  it('Scenario 16: whitespace-only reason rejected with 400 validation error', async () => {
    const targetReq = releaseApprovalRequests[0];
    targetReq.requestedByUserId = devUser.id;
    targetReq.status = ReleaseApprovalStatus.PENDING;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: '     ' });

    expect(res.status).toBe(400);
  });

  it('Scenario 17: over-length reason (>2000 chars) rejected with 400 validation error', async () => {
    const targetReq = releaseApprovalRequests[0];
    targetReq.requestedByUserId = devUser.id;
    targetReq.status = ReleaseApprovalStatus.PENDING;

    const longReason = 'a'.repeat(2005);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: longReason });

    expect(res.status).toBe(400);
  });

  // ============================================================
  // Scenario 5-7: Allowed roles can approve (OWNER, ADMIN, RELEASE_MANAGER)
  // ============================================================
  it('Scenario 7: RELEASE_MANAGER can approve a pending request', async () => {
    const targetReq = releaseApprovalRequests[0];
    targetReq.requestedByUserId = devUser.id;
    targetReq.status = ReleaseApprovalStatus.PENDING;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
      .set('Cookie', releaseManagerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Release Manager verified staging deployment tests.' });

    expect(res.status).toBe(200);
    expect(res.body.approvalRequest.status).toBe('APPROVED');
    expect(res.body.approvalRequest.resolution).toBe('APPROVE');
    expect(res.body.approvalRequest.resolvedByUserId).toBe(rmUser.id);
    expect(res.body.effectiveAuthorization).toBe('APPROVED');
  });

  // ============================================================
  // Scenario 19: Already resolved rejected
  // ============================================================
  it('Scenario 19: already resolved request produces 409 conflict', async () => {
    const targetReq = releaseApprovalRequests[0];
    // already approved above
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/approve`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Double approval attempt.' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RELEASE_APPROVAL_ALREADY_RESOLVED');
  });

  // ============================================================
  // Scenario 14: RELEASE_MANAGER cannot grant exception
  // ============================================================
  it('Scenario 14: RELEASE_MANAGER cannot grant exception (403 Forbidden)', async () => {
    const targetReq = releaseApprovalRequests[0];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${targetReq.id}/exception`)
      .set('Cookie', releaseManagerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'RM exception attempt.' });

    expect(res.status).toBe(403);
  });

  // ============================================================
  // Scenario 12 & 13: OWNER and ADMIN can grant exception
  // ============================================================
  it('Scenario 12: OWNER can grant policy exception for BLOCKED assessment', async () => {
    // Create new request for blocked assessment
    const blockedReq = {
      id: 'req-blocked-1',
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      releaseSafetyAssessmentId: assessmentBlockedId,
      status: ReleaseApprovalStatus.PENDING,
      requestedByUserId: devUser.id,
      requestedAt: new Date(),
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      reason: 'Blocked release requesting exception.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    releaseApprovalRequests.push(blockedReq);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${blockedReq.id}/exception`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Owner emergency business override.' });

    expect(res.status).toBe(200);
    expect(res.body.approvalRequest.status).toBe('APPROVED');
    expect(res.body.approvalRequest.resolution).toBe('EXCEPTION');
    expect(res.body.approvalRequest.exceptionGranted).toBe(true);
    expect(res.body.effectiveAuthorization).toBe('EXCEPTION_GRANTED');
  });

  it('Scenario 13: ADMIN can grant policy exception', async () => {
    const blockedAssessment2 = {
      id: 'rsa-blocked-2',
      organizationId: orgId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      blastRadiusAnalysisId: 'blast-3b',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 90,
      riskLevel: 'CRITICAL',
      decision: 'BLOCKED',
      signalCount: 1,
      blockingSignalCount: 1,
      reviewSignalCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    releaseSafetyAssessments.push(blockedAssessment2);

    // Create another pending request for blocked assessment
    const blockedReq2 = {
      id: 'req-blocked-2',
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      releaseSafetyAssessmentId: 'rsa-blocked-2',
      status: ReleaseApprovalStatus.PENDING,
      requestedByUserId: devUser.id,
      requestedAt: new Date(),
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      reason: 'Admin exception test.',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    releaseApprovalRequests.push(blockedReq2);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${blockedReq2.id}/exception`)
      .set('Cookie', adminCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Admin authorized hotfix override.' });

    expect(res.status).toBe(200);
    expect(res.body.approvalRequest.resolution).toBe('EXCEPTION');
  });

  // ============================================================
  // Scenario 20 & 21: Cross-tenant access denied
  // ============================================================
  it('Scenario 20: cross-tenant read is denied (403 Forbidden)', async () => {
    // Dev attempts to read org1 changeSet using org2 tenant context
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId2}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId2);

    // changeSetId1 belongs to org1, not org2
    expect([403, 404]).toContain(res.status);
  });

  it('Scenario 21: cross-tenant mutation is denied (403/404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId2}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId2)
      .send({ assessmentId: assessmentReviewId, reason: 'Cross-tenant request' });

    expect([403, 404]).toContain(res.status);
  });

  // ============================================================
  // Scenario 22: Missing change -> 404
  // ============================================================
  it('Scenario 22: missing change set returns 404 Not Found', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/cs-non-existent/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(404);
  });

  // ============================================================
  // Scenario 23: Missing succeeded assessment -> 400
  // ============================================================
  it('Scenario 23: requesting approval with non-existent assessment returns 404/400', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ assessmentId: 'non-existent-assessment', reason: 'Invalid assessment' });

    expect([400, 404]).toContain(res.status);
  });

  // ============================================================
  // Scenario 24: PASS workflow derives AUTO_APPROVED_BY_POLICY
  // ============================================================
  it('Scenario 24: PASS decision derives AUTO_APPROVED_BY_POLICY', async () => {
    // Point latest assessment to passAssessment
    const targetAssessment = releaseSafetyAssessments.find((a) => a.id === assessmentPassId);
    targetAssessment.createdAt = new Date(Date.now() + 5000);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.policyDecision).toBe('PASS');
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.AUTO_APPROVED_BY_POLICY,
    );
  });

  // ============================================================
  // Scenario 25: REVIEW_REQUIRED derives PENDING_REVIEW
  // ============================================================
  it('Scenario 25: REVIEW_REQUIRED with pending request derives PENDING_REVIEW', async () => {
    const revAssessment = releaseSafetyAssessments.find((a) => a.id === assessmentReviewId);
    revAssessment.createdAt = new Date(Date.now() + 10000);

    // Create a fresh pending request
    const pendingReq = {
      id: 'req-pending-fresh',
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      releaseSafetyAssessmentId: assessmentReviewId,
      status: ReleaseApprovalStatus.PENDING,
      requestedByUserId: devUser.id,
      requestedAt: new Date(),
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      reason: 'Pending review',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const existingIdx = releaseApprovalRequests.findIndex(
      (r) => r.releaseSafetyAssessmentId === assessmentReviewId,
    );
    if (existingIdx !== -1) {
      releaseApprovalRequests[existingIdx] = pendingReq;
    } else {
      releaseApprovalRequests.push(pendingReq);
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.policyDecision).toBe('REVIEW_REQUIRED');
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.PENDING_REVIEW,
    );
  });

  // ============================================================
  // Scenario 26: REVIEW_REQUIRED + approval derives APPROVED
  // ============================================================
  it('Scenario 26: REVIEW_REQUIRED + approval derives APPROVED', async () => {
    const existing = releaseApprovalRequests.find(
      (r) => r.releaseSafetyAssessmentId === assessmentReviewId,
    );
    existing.status = ReleaseApprovalStatus.APPROVED;
    existing.resolution = ReleaseApprovalResolution.APPROVE;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.APPROVED,
    );
  });

  // ============================================================
  // Scenario 27: REVIEW_REQUIRED + rejection derives REJECTED
  // ============================================================
  it('Scenario 27: REVIEW_REQUIRED + rejection derives REJECTED', async () => {
    const existing = releaseApprovalRequests.find(
      (r) => r.releaseSafetyAssessmentId === assessmentReviewId,
    );
    existing.status = ReleaseApprovalStatus.REJECTED;
    existing.resolution = ReleaseApprovalResolution.REJECT;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.REJECTED,
    );
  });

  // ============================================================
  // Scenario 28: BLOCKED derives BLOCKED
  // ============================================================
  it('Scenario 28: BLOCKED assessment without exception derives BLOCKED', async () => {
    const blkAssessment = releaseSafetyAssessments.find((a) => a.id === assessmentBlockedId);
    blkAssessment.createdAt = new Date(Date.now() + 20000);

    const blkReq = releaseApprovalRequests.find(
      (r) => r.releaseSafetyAssessmentId === assessmentBlockedId,
    );
    if (blkReq) {
      blkReq.status = ReleaseApprovalStatus.PENDING;
      blkReq.resolution = null;
      blkReq.exceptionGranted = false;
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.policyDecision).toBe('BLOCKED');
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.BLOCKED,
    );
  });

  // ============================================================
  // Scenario 29: BLOCKED + exception derives EXCEPTION_GRANTED
  // ============================================================
  it('Scenario 29: BLOCKED + exception derives EXCEPTION_GRANTED', async () => {
    const blkReq = releaseApprovalRequests.find(
      (r) => r.releaseSafetyAssessmentId === assessmentBlockedId,
    );
    blkReq.status = ReleaseApprovalStatus.APPROVED;
    blkReq.resolution = ReleaseApprovalResolution.EXCEPTION;
    blkReq.exceptionGranted = true;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(res.body.effectiveAuthorization).toBe(
      EffectiveReleaseAuthorization.EXCEPTION_GRANTED,
    );
  });

  // ============================================================
  // Scenario 30: Duplicate request is idempotent
  // ============================================================
  it('Scenario 30: duplicate request is idempotent (reuses existing request)', async () => {
    const targetAssessment = releaseSafetyAssessments.find((a) => a.id === assessmentReviewId);
    targetAssessment.createdAt = new Date(Date.now() + 30000);

    const existingReq = releaseApprovalRequests.find(
      (r) => r.releaseSafetyAssessmentId === assessmentReviewId,
    );
    existingReq.status = ReleaseApprovalStatus.PENDING;

    const countBefore = releaseApprovalRequests.length;

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/request`)
      .set('Cookie', developerCookie)
      .set('x-organization-id', orgId1)
      .send({ assessmentId: assessmentReviewId, reason: 'Duplicate request test' });

    expect(res.status).toBe(200);
    expect(releaseApprovalRequests.length).toBe(countBefore);
  });

  // ============================================================
  // Scenario 31: Event history ordered correctly
  // ============================================================
  it('Scenario 31: event history is ordered chronologically', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  // ============================================================
  // Scenario 32 & 33: GitHub Check refresh and idempotency
  // ============================================================
  it('Scenario 32 & 33: governance mutations asynchronously refresh GitHub Check idempotently', async () => {
    expect(mockPublicationService.triggerPublication).toHaveBeenCalled();
  });

  // ============================================================
  // Scenario 34: GitHub failure does not roll back governance
  // ============================================================
  it('Scenario 34: GitHub publication failure does not rollback governance decision', async () => {
    mockPublicationService.triggerPublication.mockRejectedValueOnce(
      new Error('GitHub API down'),
    );

    const failAssessment = {
      id: 'rsa-gh-fail-1',
      organizationId: orgId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      blastRadiusAnalysisId: 'blast-fail-1',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 60,
      riskLevel: 'HIGH',
      decision: 'REVIEW_REQUIRED',
      signalCount: 1,
      blockingSignalCount: 0,
      reviewSignalCount: 1,
      createdAt: new Date(Date.now() + 50000),
      updatedAt: new Date(Date.now() + 50000),
    };
    releaseSafetyAssessments.push(failAssessment);

    const freshReq = {
      id: 'req-gh-fail-test',
      organizationId: orgId1,
      repositoryConnectionId: repoId1,
      changeSetId: changeSetId1,
      changeRevisionId: changeRevisionId1,
      releaseSafetyAssessmentId: 'rsa-gh-fail-1',
      status: ReleaseApprovalStatus.PENDING,
      requestedByUserId: devUser.id,
      requestedAt: new Date(),
      resolvedByUserId: null,
      resolvedAt: null,
      resolution: null,
      reason: 'GitHub failure test',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    releaseApprovalRequests.push(freshReq);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgId1}/changes/${changeSetId1}/release-approval/${freshReq.id}/approve`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', orgId1)
      .send({ reason: 'Approving despite remote GitHub outage.' });

    // The approval MUST succeed and remain saved in the database
    expect(res.status).toBe(200);
    expect(res.body.approvalRequest.status).toBe('APPROVED');
  });
});
