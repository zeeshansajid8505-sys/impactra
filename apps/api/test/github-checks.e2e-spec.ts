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

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('GitHub Checks & Release Gate Integration Foundation (E2E)', () => {
  let app: INestApplication;
  let publicationService: GitHubCheckPublicationService;
  let mockOctokit: any;

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
  const gitHubCheckPublications: any[] = [];

  const orgId1 = 'org-gc-1';
  const orgId2 = 'org-gc-2';
  const repoId1 = 'repo-gc-1';
  const repoIdDisconnected = 'repo-gc-disconnected';
  const changeSetId = 'cs-gc-1';
  const changeRevisionId = 'rev-gc-1';
  const assessmentId = 'rsa-gc-1';

  let ownerCookie = '';
  let adminCookie = '';
  let architectCookie = '';
  let securityEngineerCookie = '';
  let developerCookie = '';
  let releaseManagerCookie = '';
  let qaEngineerCookie = '';
  let auditorCookie = '';
  let viewerCookie = '';

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
    gitHubCheckPublications.length = 0;

    // All 9 Canonical Users
    const owner = {
      id: 'user-owner',
      email: 'owner@impactra.test',
      name: 'Owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const admin = {
      id: 'user-admin',
      email: 'admin@impactra.test',
      name: 'Admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const architect = {
      id: 'user-architect',
      email: 'architect@impactra.test',
      name: 'Architect',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const securityEngineer = {
      id: 'user-sec',
      email: 'sec@impactra.test',
      name: 'Security Engineer',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const developer = {
      id: 'user-dev',
      email: 'dev@impactra.test',
      name: 'Developer',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const releaseManager = {
      id: 'user-rm',
      email: 'rm@impactra.test',
      name: 'Release Manager',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const qaEngineer = {
      id: 'user-qa',
      email: 'qa@impactra.test',
      name: 'QA Engineer',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const auditor = {
      id: 'user-auditor',
      email: 'auditor@impactra.test',
      name: 'Auditor',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewer = {
      id: 'user-viewer',
      email: 'viewer@impactra.test',
      name: 'Viewer',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(
      owner,
      admin,
      architect,
      securityEngineer,
      developer,
      releaseManager,
      qaEngineer,
      auditor,
      viewer,
    );

    // Organizations
    organizations.push(
      {
        id: orgId1,
        name: 'GC Org 1',
        slug: 'gc-org-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orgId2,
        name: 'GC Org 2',
        slug: 'gc-org-2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    // Memberships for Org 1 (all 9 canonical roles)
    memberships.push(
      {
        id: 'm-owner',
        organizationId: orgId1,
        userId: owner.id,
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-admin',
        organizationId: orgId1,
        userId: admin.id,
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-architect',
        organizationId: orgId1,
        userId: architect.id,
        role: 'ARCHITECT',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-sec',
        organizationId: orgId1,
        userId: securityEngineer.id,
        role: 'SECURITY_ENGINEER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-dev',
        organizationId: orgId1,
        userId: developer.id,
        role: 'DEVELOPER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-rm',
        organizationId: orgId1,
        userId: releaseManager.id,
        role: 'RELEASE_MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-qa',
        organizationId: orgId1,
        userId: qaEngineer.id,
        role: 'QA_ENGINEER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-auditor',
        organizationId: orgId1,
        userId: auditor.id,
        role: 'AUDITOR',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'm-viewer',
        organizationId: orgId1,
        userId: viewer.id,
        role: 'VIEWER',
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

    ownerCookie = setupSession(owner, 'token-owner');
    adminCookie = setupSession(admin, 'token-admin');
    architectCookie = setupSession(architect, 'token-architect');
    securityEngineerCookie = setupSession(securityEngineer, 'token-sec');
    developerCookie = setupSession(developer, 'token-dev');
    releaseManagerCookie = setupSession(releaseManager, 'token-rm');
    qaEngineerCookie = setupSession(qaEngineer, 'token-qa');
    auditorCookie = setupSession(auditor, 'token-auditor');
    viewerCookie = setupSession(viewer, 'token-viewer');

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
    // Disconnected Repository
    const repoDisconnected = {
      id: repoIdDisconnected,
      organizationId: orgId1,
      githubInstallationId: '12345678',
      githubRepositoryId: '98765433',
      ownerLogin: 'impactra-org',
      name: 'disconnected-service',
      fullName: 'impactra-org/disconnected-service',
      defaultBranch: 'main',
      connected: false,
      available: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositories.push(repo1, repoDisconnected);

    // ChangeSet
    const headCommitSha = 'a1b2c3d4e5f60123456789abcdef0123456789ab';
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
      id: changeRevisionId,
      changeSetId,
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

    // Release Safety Assessment
    const initialAssessment = {
      id: assessmentId,
      organizationId: orgId1,
      changeSetId,
      changeRevisionId,
      blastRadiusAnalysisId: 'blast-1',
      status: 'SUCCEEDED',
      policyVersion: 'impactra-release-safety-v1',
      riskScore: 25,
      riskLevel: 'LOW',
      decision: 'PASS',
      signalCount: 1,
      blockingSignalCount: 0,
      reviewSignalCount: 0,
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
      id: 'sig-gc-1',
      organizationId: orgId1,
      assessmentId: initialAssessment.id,
      ruleId: 'RS_CHANGE_SMALL',
      ruleVersion: 'v1',
      category: 'CHANGE_SIZE',
      severity: 'LOW',
      scoreDelta: 5,
      blocking: false,
      requiresReview: false,
      title: 'Small change volume',
      description: 'Under 50 lines modified',
      evidenceType: 'DIFF',
      evidenceReferenceId: null,
      evidenceStableKey: null,
      evidenceJson: {},
      createdAt: new Date(),
    };
    releaseSafetySignals.push(sig1);

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
                  m.organizationId === where.organizationId &&
                  m.userId === where.userId,
              ) || null,
            );
          }),
        },
        repositoryConnection: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              repositories.find((r) => r.id === where.id) || null,
            );
          }),
        },
        changeSet: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find((c) => c.id === where.id);
            if (!cs) return Promise.resolve(null);
            const repo = repositories.find(
              (r) => r.id === cs.repositoryConnectionId,
            );
            return Promise.resolve({ ...cs, repositoryConnection: repo });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const cs = changeSets.find(
              (c) =>
                c.id === where.id &&
                (!where.organizationId ||
                  c.organizationId === where.organizationId),
            );
            if (!cs) return Promise.resolve(null);
            const repo = repositories.find(
              (r) => r.id === cs.repositoryConnectionId,
            );
            return Promise.resolve({ ...cs, repositoryConnection: repo });
          }),
        },
        changeRevision: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              changeRevisions.find((r) => r.id === where.id) || null,
            );
          }),
        },
        releaseSafetyAssessment: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            const item = releaseSafetyAssessments.find(
              (a) => a.id === where.id,
            );
            if (!item) return Promise.resolve(null);
            const sigs = releaseSafetySignals.filter(
              (s) => s.assessmentId === item.id,
            );
            const cs = changeSets.find((c) => c.id === item.changeSetId);
            const rev = changeRevisions.find(
              (r) => r.id === item.changeRevisionId,
            );
            const repo = cs
              ? repositories.find((r) => r.id === cs.repositoryConnectionId)
              : null;
            return Promise.resolve({
              ...item,
              signals: sigs,
              changeSet: cs ? { ...cs, repositoryConnection: repo } : null,
              changeRevision: rev,
            });
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const matched = releaseSafetyAssessments.filter(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.organizationId ||
                  a.organizationId === where.organizationId) &&
                (!where.changeSetId || a.changeSetId === where.changeSetId) &&
                (!where.status || a.status === where.status),
            );
            if (matched.length === 0) return Promise.resolve(null);
            const sorted = matched.sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            );
            const item = sorted[0];
            const sigs = releaseSafetySignals.filter(
              (s) => s.assessmentId === item.id,
            );
            const rev = changeRevisions.find(
              (r) => r.id === item.changeRevisionId,
            );
            return Promise.resolve({
              ...item,
              signals: sigs,
              changeRevision: rev,
            });
          }),
        },
        gitHubCheckPublication: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id) {
              const pub = gitHubCheckPublications.find(
                (p) => p.id === where.id,
              );
              if (!pub) return Promise.resolve(null);
              const ass = releaseSafetyAssessments.find(
                (a) => a.id === pub.releaseSafetyAssessmentId,
              );
              const sigs = releaseSafetySignals.filter(
                (s) => s.assessmentId === pub.releaseSafetyAssessmentId,
              );
              const repo = repositories.find(
                (r) => r.id === pub.repositoryConnectionId,
              );
              const cs = changeSets.find((c) => c.id === pub.changeSetId);
              const rev = changeRevisions.find(
                (r) => r.id === pub.changeRevisionId,
              );
              return Promise.resolve({
                ...pub,
                releaseSafetyAssessment: ass ? { ...ass, signals: sigs } : null,
                repositoryConnection: repo,
                changeSet: cs,
                changeRevision: rev,
              });
            }
            if (where.repositoryConnectionId_headSha_checkName) {
              const { repositoryConnectionId, headSha, checkName } =
                where.repositoryConnectionId_headSha_checkName;
              const pub = gitHubCheckPublications.find(
                (p) =>
                  p.repositoryConnectionId === repositoryConnectionId &&
                  p.headSha === headSha &&
                  p.checkName === checkName,
              );
              return Promise.resolve(pub || null);
            }
            return Promise.resolve(null);
          }),
          findFirst: jest.fn().mockImplementation(({ where }: any) => {
            const matched = gitHubCheckPublications.filter(
              (p) =>
                (!where.id || p.id === where.id) &&
                (!where.organizationId ||
                  p.organizationId === where.organizationId) &&
                (!where.changeSetId || p.changeSetId === where.changeSetId),
            );
            if (matched.length === 0) return Promise.resolve(null);
            const sorted = matched.sort(
              (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
            );
            const pub = sorted[0];
            const ass = releaseSafetyAssessments.find(
              (a) => a.id === pub.releaseSafetyAssessmentId,
            );
            return Promise.resolve({
              ...pub,
              releaseSafetyAssessment: ass || null,
            });
          }),
          upsert: jest.fn().mockImplementation(({ where, create, update }: any) => {
            const { repositoryConnectionId, headSha, checkName } =
              where.repositoryConnectionId_headSha_checkName;
            const index = gitHubCheckPublications.findIndex(
              (p) =>
                p.repositoryConnectionId === repositoryConnectionId &&
                p.headSha === headSha &&
                p.checkName === checkName,
            );
            const now = new Date();
            if (index >= 0) {
              const existing = gitHubCheckPublications[index];
              const updated = {
                ...existing,
                ...update,
                updatedAt: now,
              };
              gitHubCheckPublications[index] = updated;
              return Promise.resolve(updated);
            } else {
              const created = {
                id: `pub-${gitHubCheckPublications.length + 1}`,
                attemptCount: 0,
                githubCheckRunId: null,
                remoteCheckUrl: null,
                conclusion: null,
                detailsUrl: null,
                startedAt: null,
                completedAt: null,
                publishedAt: null,
                failedAt: null,
                createdAt: now,
                updatedAt: now,
                ...create,
              };
              gitHubCheckPublications.push(created);
              return Promise.resolve(created);
            }
          }),
          update: jest.fn().mockImplementation(({ where, data }: any) => {
            const index = gitHubCheckPublications.findIndex(
              (p) => p.id === where.id,
            );
            if (index < 0) {
              throw new Error(`Record ${where.id} not found`);
            }
            const existing = gitHubCheckPublications[index];
            const updated = {
              ...existing,
              ...data,
              attemptCount: data.attemptCount?.increment
                ? existing.attemptCount + 1
                : existing.attemptCount,
              updatedAt: new Date(),
            };
            gitHubCheckPublications[index] = updated;
            return Promise.resolve(updated);
          }),
        },
      },
    };

    mockOctokit = {
      rest: {
        checks: {
          create: jest.fn().mockResolvedValue({
            data: {
              id: 777001,
              html_url:
                'https://github.com/impactra-org/core-service/runs/777001',
            },
          }),
          update: jest.fn().mockResolvedValue({
            data: {
              id: 777001,
              html_url:
                'https://github.com/impactra-org/core-service/runs/777001',
            },
          }),
        },
      },
    };

    const mockInstallationService = {
      getInstallationToken: jest
        .fn()
        .mockResolvedValue('ghs_e2e_installation_token_xyz'),
    };
    const mockClientService = {
      getInstallationOctokit: jest.fn().mockReturnValue(mockOctokit),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDbService)
      .overrideProvider(GitHubInstallationService)
      .useValue(mockInstallationService)
      .overrideProvider(GitHubClientService)
      .useValue(mockClientService)
      .overrideProvider(getQueueToken('github-check-publication'))
      .useValue({
        add: jest.fn().mockResolvedValue({ id: 'mock-bull-job-id' }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.useGlobalPipes(new AppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.setGlobalPrefix('api/v1');

    await app.init();
    publicationService = moduleRef.get<GitHubCheckPublicationService>(
      GitHubCheckPublicationService,
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('RBAC Authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/latest`,
        )
        .expect(401);

      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
        )
        .expect(401);
    });

    it('allows all canonical nine roles to READ check status (200 OK)', async () => {
      const allCookies = [
        { role: 'OWNER', cookie: ownerCookie },
        { role: 'ADMIN', cookie: adminCookie },
        { role: 'ARCHITECT', cookie: architectCookie },
        { role: 'SECURITY_ENGINEER', cookie: securityEngineerCookie },
        { role: 'DEVELOPER', cookie: developerCookie },
        { role: 'RELEASE_MANAGER', cookie: releaseManagerCookie },
        { role: 'QA_ENGINEER', cookie: qaEngineerCookie },
        { role: 'AUDITOR', cookie: auditorCookie },
        { role: 'VIEWER', cookie: viewerCookie },
      ];

      for (const { cookie } of allCookies) {
        const res = await request(app.getHttpServer())
          .get(
            `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/latest`,
          )
          .set('Cookie', cookie)
          .expect(200);

        expect(res.body).toBeDefined();
      }
    });

    it('denies PUBLISH for non-release roles (403 Forbidden)', async () => {
      const nonPublishCookies = [
        architectCookie,
        securityEngineerCookie,
        developerCookie,
        qaEngineerCookie,
        auditorCookie,
        viewerCookie,
      ];

      for (const cookie of nonPublishCookies) {
        await request(app.getHttpServer())
          .post(
            `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
          )
          .set('Cookie', cookie)
          .expect(403);
      }
    });

    it('allows PUBLISH for RELEASE_MANAGER, ADMIN, and OWNER (200 OK)', async () => {
      for (const cookie of [releaseManagerCookie, adminCookie, ownerCookie]) {
        const res = await request(app.getHttpServer())
          .post(
            `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
          )
          .set('Cookie', cookie)
          .expect(200);

        expect(res.body.publicationId).toBeDefined();
        expect(res.body.status).toBe('QUEUED');
      }
    });

    it('returns 404 when changeSet is missing', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/non-existent-cs/github-check/publish`,
        )
        .set('Cookie', ownerCookie)
        .expect(404);
    });

    it('returns 404 when specified assessment is missing', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
        )
        .send({ assessmentId: 'non-existent-assessment' })
        .set('Cookie', ownerCookie)
        .expect(404);
    });

    it('returns 400 when Release Safety assessment is not SUCCEEDED', async () => {
      const runningAss = {
        id: 'rsa-running-test',
        organizationId: orgId1,
        changeSetId,
        changeRevisionId,
        blastRadiusAnalysisId: 'blast-1',
        status: 'RUNNING',
        policyVersion: 'impactra-release-safety-v1',
        riskScore: 0,
        riskLevel: 'LOW',
        decision: 'PASS',
        signalCount: 0,
        blockingSignalCount: 0,
        reviewSignalCount: 0,
        startedAt: new Date(),
        completedAt: null,
        failedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      releaseSafetyAssessments.push(runningAss);

      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
        )
        .send({ assessmentId: runningAss.id })
        .set('Cookie', ownerCookie)
        .expect(400);
    });
  });

  describe('Multi-Tenancy Isolation', () => {
    it('returns 403 or 404 when attempting to publish changeSet from another organization', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId2}/changes/${changeSetId}/github-check/publish`,
        )
        .set('Cookie', ownerCookie)
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });
    });

    it('returns 403 or 404 when reading check status from another organization', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgId2}/changes/${changeSetId}/github-check/latest`,
        )
        .set('Cookie', ownerCookie)
        .expect((res) => {
          expect([403, 404]).toContain(res.status);
        });
    });
  });

  describe('Execution & Idempotency', () => {
    it('executes publication worker and calls remote Octokit checks.create', async () => {
      const latest = await publicationService.triggerPublication(
        orgId1,
        changeSetId,
      );
      expect(latest.status).toBe('QUEUED');

      // Execute worker
      await publicationService.executePublication(latest.publicationId);

      expect(mockOctokit.rest.checks.create).toHaveBeenCalled();
      const callArgs = mockOctokit.rest.checks.create.mock.calls[0][0];
      expect(callArgs.name).toBe('Impactra / Release Safety');
      expect(callArgs.conclusion).toBe('success'); // PASS maps to success
      expect(callArgs.head_sha).toBe(
        'a1b2c3d4e5f60123456789abcdef0123456789ab',
      );
      expect(callArgs.output.title).toContain('PASS');
    });

    it('updates existing check run on re-publication for same HEAD commit', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/publish`,
        )
        .set('Cookie', ownerCookie)
        .expect(200);

      // Execute worker again
      await publicationService.executePublication(res.body.publicationId);

      expect(mockOctokit.rest.checks.update).toHaveBeenCalled();
      const updateArgs = mockOctokit.rest.checks.update.mock.calls[0][0];
      expect(updateArgs.check_run_id).toBe(777001);
      expect(updateArgs.name).toBe('Impactra / Release Safety');
    });

    it('retrieves the completed check publication via GET latest and by ID', async () => {
      const resLatest = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/latest`,
        )
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(resLatest.body.publication).toBeDefined();
      expect(resLatest.body.publication.status).toBe('SUCCEEDED');
      expect(resLatest.body.publication.conclusion).toBe('SUCCESS');
      expect(resLatest.body.publication.githubCheckRunId).toBe('777001');

      const pubId = resLatest.body.publication.id;
      const resById = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgId1}/changes/${changeSetId}/github-check/${pubId}`,
        )
        .set('Cookie', viewerCookie)
        .expect(200);

      expect(resById.body.id).toBe(pubId);
      expect(resById.body.headSha).toBe(
        'a1b2c3d4e5f60123456789abcdef0123456789ab',
      );
    });
  });

  describe('Repository Disconnection / Ineligibility Handling', () => {
    it('marks publication as SKIPPED when repository is disconnected', async () => {
      // Create disconnected changeSet
      const csDisconnected = {
        id: 'cs-disconnected-1',
        organizationId: orgId1,
        repositoryConnectionId: repoIdDisconnected,
        provider: 'github',
        providerPullRequestId: '999',
        pullRequestNumber: 999,
        title: 'disconnected PR',
        authorLogin: 'alice',
        baseRef: 'main',
        headRef: 'test',
        currentBaseSha: '0000000000000000000000000000000000000000',
        currentHeadSha: 'ffffffffffffffffffffffffffffffffffffffff',
        state: 'open',
        isDraft: false,
        isMerged: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      changeSets.push(csDisconnected);

      const revDisconnected = {
        id: 'rev-disc-1',
        changeSetId: csDisconnected.id,
        organizationId: orgId1,
        repositoryConnectionId: repoIdDisconnected,
        baseSha: csDisconnected.currentBaseSha,
        headSha: csDisconnected.currentHeadSha,
        analysisVersion: 'change-analysis-v1',
        status: 'SUCCEEDED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      changeRevisions.push(revDisconnected);

      const assDisconnected = {
        id: 'rsa-disc-1',
        organizationId: orgId1,
        changeSetId: csDisconnected.id,
        changeRevisionId: revDisconnected.id,
        blastRadiusAnalysisId: 'blast-disc-1',
        status: 'SUCCEEDED',
        policyVersion: 'impactra-release-safety-v1',
        riskScore: 10,
        riskLevel: 'LOW',
        decision: 'PASS',
        signalCount: 0,
        blockingSignalCount: 0,
        reviewSignalCount: 0,
        startedAt: new Date(),
        completedAt: new Date(),
        failedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      releaseSafetyAssessments.push(assDisconnected);

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgId1}/changes/${csDisconnected.id}/github-check/publish`,
        )
        .set('Cookie', ownerCookie)
        .expect(200);

      expect(res.body.status).toBe('SKIPPED');
      expect(res.body.queued).toBe(false);
      expect(res.body.message).toContain('Repository is not connected');
    });
  });
});
