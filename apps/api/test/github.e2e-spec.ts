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
import { GitHubClientService } from '../src/github/services/github-client.service';
import { GitHubConfigService } from '../src/github/config/github-config.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { AppValidationPipe } from '../src/common/pipes/validation.pipe';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('GitHub App & Repository Onboarding (E2E)', () => {
  let app: INestApplication;

  // In-memory data structures
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const installationStates: any[] = [];
  const installations: any[] = [];
  const repositories: any[] = [];
  const deliveries: any[] = [];

  const testWebhookSecret = 'test_webhook_secret_key_123';
  let activeStateToken = '';
  let ownerCookie = '';
  let viewerCookie = '';

  const testOrgId = 'org-e2e-test-1';
  let testRepoId = '';

  beforeAll(async () => {
    users.length = 0;
    sessions.length = 0;
    organizations.length = 0;
    memberships.length = 0;
    installationStates.length = 0;
    installations.length = 0;
    repositories.length = 0;
    deliveries.length = 0;

    // Seed users
    const ownerUser = {
      id: 'user-owner-1',
      email: 'owner@impactra.test',
      name: 'Owner User',
      passwordHash: 'dummy-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const viewerUser = {
      id: 'user-viewer-1',
      email: 'viewer@impactra.test',
      name: 'Viewer User',
      passwordHash: 'dummy-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.push(ownerUser, viewerUser);

    // Seed test org
    const org = {
      id: testOrgId,
      name: 'Impactra E2E Org',
      slug: 'impactra-e2e-org',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    organizations.push(org);

    // Seed memberships
    memberships.push(
      {
        id: 'mem-1',
        organizationId: testOrgId,
        userId: ownerUser.id,
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: org,
        user: ownerUser,
      },
      {
        id: 'mem-2',
        organizationId: testOrgId,
        userId: viewerUser.id,
        role: 'VIEWER',
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: org,
        user: viewerUser,
      },
    );

    // Seed sessions
    const rawOwnerToken = 'owner_session_token_xyz_1234567890';
    const rawViewerToken = 'viewer_session_token_xyz_1234567890';
    ownerCookie = `impactra_session=${rawOwnerToken}`;
    viewerCookie = `impactra_session=${rawViewerToken}`;

    sessions.push(
      {
        id: 'sess-owner',
        sessionTokenHash: crypto.createHash('sha256').update(rawOwnerToken).digest('hex'),
        userId: ownerUser.id,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        user: ownerUser,
      },
      {
        id: 'sess-viewer',
        sessionTokenHash: crypto.createHash('sha256').update(rawViewerToken).digest('hex'),
        userId: viewerUser.id,
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        user: viewerUser,
      },
    );

    const mockDbService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
      client: {
        $transaction: jest.fn(async (cbOrArray: any) => {
          if (typeof cbOrArray === 'function') {
            return cbOrArray(mockDbService.client);
          }
          return Promise.all(cbOrArray);
        }),
        user: {
          findUnique: jest.fn(async ({ where }: any) => {
            if (where.id) return users.find((u) => u.id === where.id) || null;
            return null;
          }),
        },
        session: {
          findUnique: jest.fn(async ({ where }: any) => {
            const sess = sessions.find((s) => s.sessionTokenHash === where.sessionTokenHash);
            if (!sess) return null;
            return {
              ...sess,
              user: users.find((u) => u.id === sess.userId),
            };
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const sess = sessions.find((s) => s.id === where.id);
            if (sess) Object.assign(sess, data);
            return sess;
          }),
        },
        organization: {
          findUnique: jest.fn(async ({ where }: any) => {
            return organizations.find((o) => o.id === where.id) || null;
          }),
        },
        organizationMembership: {
          findUnique: jest.fn(async ({ where }: any) => {
            const key = where.organizationId_userId;
            const mem = memberships.find(
              (m) => m.organizationId === key.organizationId && m.userId === key.userId,
            );
            if (!mem) return null;
            return {
              ...mem,
              organization: organizations.find((o) => o.id === mem.organizationId),
              user: users.find((u) => u.id === mem.userId),
            };
          }),
        },
        gitHubInstallationState: {
          create: jest.fn(async ({ data }: any) => {
            const record = {
              id: `state-${Date.now()}`,
              ...data,
              consumedAt: null,
              createdAt: new Date(),
            };
            installationStates.push(record);
            return record;
          }),
          findUnique: jest.fn(async ({ where }: any) => {
            return installationStates.find((s) => s.stateHash === where.stateHash) || null;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const record = installationStates.find((s) => s.id === where.id);
            if (record) Object.assign(record, data);
            return record;
          }),
          updateMany: jest.fn(async ({ where, data }: any) => {
            let count = 0;
            for (const record of installationStates) {
              if (where.id && record.id !== where.id) continue;
              if (where.consumedAt === null && record.consumedAt !== null) continue;
              if (where.userId && record.userId !== where.userId) continue;
              if (where.expiresAt?.gt && !(record.expiresAt > where.expiresAt.gt)) continue;

              Object.assign(record, data);
              count++;
            }
            return { count };
          }),
        },
        gitHubInstallation: {
          findUnique: jest.fn(async ({ where }: any) => {
            return installations.find((i) => i.githubInstallationId === where.githubInstallationId) || null;
          }),
          findFirst: jest.fn(async ({ where }: any) => {
            return (
              installations.find((i) => {
                if (where.organizationId && i.organizationId !== where.organizationId) return false;
                if (where.status?.in && !where.status.in.includes(i.status)) return false;
                if (where.status && typeof where.status === 'string' && i.status !== where.status) return false;
                return true;
              }) || null
            );
          }),
          upsert: jest.fn(async ({ where, update, create }: any) => {
            const idx = installations.findIndex(
              (i) => i.githubInstallationId === where.githubInstallationId,
            );
            if (idx !== -1) {
              Object.assign(installations[idx], update);
              return installations[idx];
            }
            const record = {
              id: `inst-${Date.now()}`,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
              installedAt: new Date(),
              suspendedAt: null,
              lastSyncedAt: null,
            };
            installations.push(record);
            return record;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const inst = installations.find((i) => i.id === where.id);
            if (inst) Object.assign(inst, data);
            return inst;
          }),
        },
        repositoryConnection: {
          upsert: jest.fn(async ({ where, update, create }: any) => {
            const orgId = where.organizationId_githubRepositoryId.organizationId;
            const repoId = where.organizationId_githubRepositoryId.githubRepositoryId;
            const idx = repositories.findIndex(
              (r) => r.organizationId === orgId && r.githubRepositoryId === repoId,
            );
            if (idx !== -1) {
              Object.assign(repositories[idx], update);
              return repositories[idx];
            }
            const record = {
              id: `repo-db-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              ...create,
              createdAt: new Date(),
              updatedAt: new Date(),
              connectedAt: null,
              disconnectedAt: null,
            };
            repositories.push(record);
            return record;
          }),
          findFirst: jest.fn(async ({ where }: any) => {
            return (
              repositories.find((r) => {
                if (where.organizationId && r.organizationId !== where.organizationId) return false;
                if (where.OR) {
                  return where.OR.some(
                    (cond: any) =>
                      (cond.id && r.id === cond.id) ||
                      (cond.githubRepositoryId && r.githubRepositoryId === cond.githubRepositoryId),
                  );
                }
                return true;
              }) || null
            );
          }),
          findMany: jest.fn(async ({ where, skip = 0, take = 20 }: any) => {
            const filtered = repositories.filter((r) => {
              if (where.organizationId && r.organizationId !== where.organizationId) return false;
              if (where.connected !== undefined && r.connected !== where.connected) return false;
              if (where.available !== undefined && r.available !== where.available) return false;
              return true;
            });
            return filtered.slice(skip, skip + take);
          }),
          count: jest.fn(async ({ where }: any) => {
            return repositories.filter((r) => {
              if (where.organizationId && r.organizationId !== where.organizationId) return false;
              return true;
            }).length;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const r = repositories.find((item) => item.id === where.id);
            if (r) Object.assign(r, data);
            return r;
          }),
          updateMany: jest.fn(async ({ where, data }: any) => {
            let count = 0;
            for (const r of repositories) {
              if (where.organizationId && r.organizationId !== where.organizationId) continue;
              if (where.githubInstallationId && r.githubInstallationId !== where.githubInstallationId)
                continue;
              if (where.githubRepositoryId) {
                if (typeof where.githubRepositoryId === 'object' && Array.isArray(where.githubRepositoryId.in)) {
                  if (!where.githubRepositoryId.in.includes(r.githubRepositoryId)) continue;
                } else if (r.githubRepositoryId !== where.githubRepositoryId) {
                  continue;
                }
              }
              Object.assign(r, data);
              count++;
            }
            return { count };
          }),
        },
        gitHubWebhookDelivery: {
          findUnique: jest.fn(async ({ where }: any) => {
            return deliveries.find((d) => d.githubDeliveryId === where.githubDeliveryId) || null;
          }),
          create: jest.fn(async ({ data }: any) => {
            const existing = deliveries.find((d) => d.githubDeliveryId === data.githubDeliveryId);
            if (existing) {
              const err: any = new Error(
                'Unique constraint failed on the fields: (`github_delivery_id`)',
              );
              err.code = 'P2002';
              throw err;
            }
            const record = { id: `deliv-${Date.now()}`, ...data };
            deliveries.push(record);
            return record;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const d = deliveries.find(
              (item) =>
                (where.id && item.id === where.id) ||
                (where.githubDeliveryId && item.githubDeliveryId === where.githubDeliveryId),
            );
            if (d) Object.assign(d, data);
            return d;
          }),
          upsert: jest.fn(async ({ where, create, update }: any) => {
            const idx = deliveries.findIndex((d) => d.githubDeliveryId === where.githubDeliveryId);
            if (idx !== -1) {
              Object.assign(deliveries[idx], update);
              return deliveries[idx];
            }
            const record = { id: `deliv-${Date.now()}`, ...create };
            deliveries.push(record);
            return record;
          }),
        },
      },
    };

    const mockCacheService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
      redisClient: null,
    };

    const mockStorageService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
    };

    const mockClientService = {
      getInstallation: jest.fn().mockResolvedValue({
        id: 998877,
        account: { id: 12345, login: 'acme-corp', type: 'Organization' },
        repository_selection: 'all',
        permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' },
        events: ['push', 'pull_request'],
      }),
      createInstallationToken: jest.fn().mockResolvedValue({
        token: 'ghs_mock_installation_token_abc',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
      listInstallationRepositories: jest.fn().mockResolvedValue([
        {
          id: 5001,
          name: 'service-auth',
          full_name: 'acme-corp/service-auth',
          private: true,
          default_branch: 'main',
          visibility: 'private',
          archived: false,
          disabled: false,
          fork: false,
          html_url: 'https://github.com/acme-corp/service-auth',
          owner: { login: 'acme-corp', id: 12345 },
        },
        {
          id: 5002,
          name: 'frontend-portal',
          full_name: 'acme-corp/frontend-portal',
          private: false,
          default_branch: 'main',
          visibility: 'public',
          archived: false,
          disabled: false,
          fork: false,
          html_url: 'https://github.com/acme-corp/frontend-portal',
          owner: { login: 'acme-corp', id: 12345 },
        },
      ]),
    };

    const mockConfigService = {
      appId: '123456',
      appSlug: 'impactra-app',
      privateKeyBase64: 'dummy-key',
      webhookSecret: testWebhookSecret,
      apiUrl: 'https://api.github.com',
      webUrl: 'https://github.com',
      isConfigured: jest.fn().mockReturnValue(true),
      getPrivateKey: jest.fn().mockReturnValue('-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----'),
      buildInstallUrl: jest.fn().mockImplementation((state: string) => `https://github.com/apps/impactra-app/installations/new?state=${state}`),
      getStatus: jest.fn().mockReturnValue({
        configured: true,
        appSlug: 'impactra-app',
        installationsEnabled: true,
        appIdConfigured: true,
        slugConfigured: true,
        privateKeyConfigured: true,
        webhookSecretConfigured: true,
        installUrl: 'https://github.com/apps/impactra-app/installations/new',
      }),
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
      .overrideProvider(GitHubClientService)
      .useValue(mockClientService)
      .overrideProvider(GitHubConfigService)
      .useValue(mockConfigService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.use(
      '/github/webhooks',
      json({
        limit: '5mb',
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(json({ limit: '1mb' }));
    app.use(urlencoded({ extended: true, limit: '1mb' }));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // Scenario 1: GET /github/config/status
  it('Scenario 1: GET /github/config/status should return safe configuration status without secrets', async () => {
    const res = await request(app.getHttpServer()).get('/github/config/status').expect(200);

    expect(res.body.configured).toBe(true);
    expect(res.body.appSlug).toBe('impactra-app');
    expect(res.body.installationsEnabled).toBe(true);
    expect(res.body.appIdConfigured).toBe(true);
    expect(res.body.privateKeyConfigured).toBe(true);
    expect(res.body.webhookSecretConfigured).toBe(true);
    expect(res.body.privateKey).toBeUndefined();
    expect(res.body.webhookSecret).toBeUndefined();
  });

  // Scenario 2: POST /organizations/:id/github/installations/start without auth -> 401
  it('Scenario 2: POST /organizations/:id/github/installations/start should return 401 when unauthenticated', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/github/installations/start`)
      .expect(401);
  });

  // Scenario 3: POST /organizations/:id/github/installations/start with VIEWER role -> 403 Forbidden
  it('Scenario 3: POST /organizations/:id/github/installations/start should return 403 for VIEWER role', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/github/installations/start`)
      .set('Cookie', viewerCookie)
      .set('x-organization-id', testOrgId)
      .expect(403);
  });

  // Scenario 4: POST /organizations/:id/github/installations/start with OWNER role -> 201 with installUrl & state
  it('Scenario 4: POST /organizations/:id/github/installations/start should return 201 and installation URL for OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/github/installations/start`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(201);

    expect(res.body.installUrl).toBeDefined();
    expect(res.body.installUrl).toContain('https://github.com/apps/impactra-app/installations/new?state=');

    // Extract state from installUrl
    const url = new URL(res.body.installUrl);
    activeStateToken = url.searchParams.get('state') || '';
    expect(activeStateToken.length).toBe(64);
  });

  // Scenario 5: GET /github/installations/callback without authentication -> 401 Unauthorized
  it('Scenario 5: GET /github/installations/callback without auth should return 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/github/installations/callback')
      .expect(401);
  });

  // Scenario 5b: GET /github/installations/callback with missing parameters -> redirects with error
  it('Scenario 5b: GET /github/installations/callback with missing params should redirect with error', async () => {
    const res = await request(app.getHttpServer())
      .get('/github/installations/callback')
      .set('Cookie', ownerCookie)
      .expect(302);

    expect(res.headers.location).toContain('installation=error');
  });

  // Scenario 5c: GET /github/installations/callback with state initiated by User A but invoked by User B -> error redirect
  it('Scenario 5c: GET /github/installations/callback with mismatched user should reject with error redirect', async () => {
    const res = await request(app.getHttpServer())
      .get(`/github/installations/callback?state=${activeStateToken}&installation_id=998877`)
      .set('Cookie', viewerCookie) // Viewer user attempting to consume Owner's state
      .expect(302);

    expect(res.headers.location).toContain('installation=error');
    expect(res.headers.location).toContain(encodeURIComponent('Installation state was initiated by a different user'));
  });

  // Scenario 6: GET /github/installations/callback with valid state and matching user -> binds installation and redirects to success
  it('Scenario 6: GET /github/installations/callback with matching authenticated user should bind installation and redirect to success', async () => {
    const res = await request(app.getHttpServer())
      .get(`/github/installations/callback?state=${activeStateToken}&installation_id=998877`)
      .set('Cookie', ownerCookie)
      .expect(302);

    expect(res.headers.location).toContain('installation=success');
    expect(res.headers.location).toContain('installed=true');

    // Confirm installation created in DB
    const bound = installations.find((i) => i.githubInstallationId === '998877');
    expect(bound).toBeDefined();
    expect(bound.organizationId).toBe(testOrgId);
    expect(bound.status).toBe('ACTIVE');
    expect(bound.accountLogin).toBe('acme-corp');
  });

  // Scenario 6b: GET /github/installations/callback with already-consumed state -> rejects replay
  it('Scenario 6b: GET /github/installations/callback state replay should be rejected', async () => {
    const res = await request(app.getHttpServer())
      .get(`/github/installations/callback?state=${activeStateToken}&installation_id=998877`)
      .set('Cookie', ownerCookie)
      .expect(302);

    expect(res.headers.location).toContain('installation=error');
    expect(res.headers.location).toContain(encodeURIComponent('Installation state has already been consumed'));
  });

  // Scenario 7: GET /organizations/:id/github/installation -> returns active installation
  it('Scenario 7: GET /organizations/:id/github/installation should return active installation metadata', async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${testOrgId}/github/installation`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.githubInstallationId).toBe('998877');
    expect(res.body.accountLogin).toBe('acme-corp');
    expect(res.body.status).toBe('ACTIVE');
  });

  // Scenario 8: POST /organizations/:id/github/sync -> synchronizes repositories
  it('Scenario 8: POST /organizations/:id/github/sync should synchronize repositories', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/github/sync`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body.syncedCount).toBe(2);
    expect(res.body.availableCount).toBe(2);
  });

  // Scenario 9: GET /organizations/:id/repositories -> lists synchronized repositories
  it('Scenario 9: GET /organizations/:id/repositories should list synchronized repositories', async () => {
    const res = await request(app.getHttpServer())
      .get(`/organizations/${testOrgId}/repositories`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.repositories).toHaveLength(2);

    const firstRepo = res.body.repositories[0];
    testRepoId = firstRepo.id;
    expect(firstRepo.connected).toBe(false);
    expect(firstRepo.available).toBe(true);
  });

  // Scenario 10: POST /organizations/:id/repositories/:id/connect -> connects repository (OWNER allowed)
  it('Scenario 10: POST /organizations/:id/repositories/:id/connect should connect a repository for OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/${testRepoId}/connect`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body.id).toBe(testRepoId);
    expect(res.body.connected).toBe(true);
    expect(res.body.connectedAt).toBeDefined();
  });

  // Scenario 10b: POST /organizations/:id/repositories/:id/connect with VIEWER role -> 403 Forbidden
  it('Scenario 10b: POST /organizations/:id/repositories/:id/connect should return 403 for VIEWER role', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/${testRepoId}/connect`)
      .set('Cookie', viewerCookie)
      .set('x-organization-id', testOrgId)
      .expect(403);
  });

  // Scenario 11: POST /organizations/:id/repositories/:id/disconnect -> disconnects repository (OWNER allowed)
  it('Scenario 11: POST /organizations/:id/repositories/:id/disconnect should disconnect a repository for OWNER', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/${testRepoId}/disconnect`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body.id).toBe(testRepoId);
    expect(res.body.connected).toBe(false);
    expect(res.body.disconnectedAt).toBeDefined();
  });

  // Scenario 11b: POST /organizations/:id/repositories/:id/disconnect with VIEWER role -> 403 Forbidden
  it('Scenario 11b: POST /organizations/:id/repositories/:id/disconnect should return 403 for VIEWER role', async () => {
    await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/${testRepoId}/disconnect`)
      .set('Cookie', viewerCookie)
      .set('x-organization-id', testOrgId)
      .expect(403);
  });

  // Scenario 12: POST /github/webhooks with valid HMAC signature -> processes delivery
  it('Scenario 12: POST /github/webhooks with valid signature should process delivery', async () => {
    const payload = {
      action: 'ping',
      hook_id: 12345,
    };
    const bodyStr = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', testWebhookSecret).update(Buffer.from(bodyStr)).digest('hex')}`;
    const deliveryId = 'deliv-e2e-001';

    const res = await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.handled).toBe(true);
    expect(res.body.deliveryId).toBe(deliveryId);
  });

  // Scenario 13: POST /github/webhooks with duplicate delivery -> returns duplicate: true (idempotent)
  it('Scenario 13: POST /github/webhooks duplicate delivery ID should be idempotent', async () => {
    const payload = { action: 'ping' };
    const bodyStr = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', testWebhookSecret).update(Buffer.from(bodyStr)).digest('hex')}`;
    const deliveryId = 'deliv-e2e-001'; // Same as Scenario 12

    const res = await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.duplicate).toBe(true);
  });

  // Scenario 14: POST /github/webhooks with invalid HMAC signature -> 401
  it('Scenario 14: POST /github/webhooks with bad signature should return 401 Unauthorized', async () => {
    const payload = { action: 'ping' };

    await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', 'deliv-e2e-bad-sig')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', 'sha256=invalid000000000000000000000000000000000000000000000000000000000000')
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(401);
  });

  // Scenario 15: DELETE /organizations/:id/github/installation -> disconnects installation
  it('Scenario 15: DELETE /organizations/:id/github/installation should disconnect installation and repos', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/organizations/${testOrgId}/github/installation`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .expect(200);

    expect(res.body.disconnected).toBe(true);

    const bound = installations.find((i) => i.organizationId === testOrgId);
    expect(bound.status).toBe('DISCONNECTED');
  });

  // Scenario 16: Standard JSON request >1MB should return 413 Payload Too Large
  it('Scenario 16: Standard JSON request >1MB should return 413 Payload Too Large', async () => {
    const largePayload = {
      padding: 'x'.repeat(1024 * 1024 + 100),
    };

    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/repo-dummy/connect`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .set('Content-Type', 'application/json')
      .send(largePayload)
      .expect(413);

    expect(res.body.statusCode).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(res.body.message).toBe('Request body too large');
  });

  // Scenario 17: Standard JSON request just below 1MB limit reaches controller rather than 413
  it('Scenario 17: Standard JSON request just below 1MB limit should reach controller rather than 413', async () => {
    const moderatePayload = {
      padding: 'x'.repeat(100 * 1024),
    };

    const res = await request(app.getHttpServer())
      .post(`/organizations/${testOrgId}/repositories/non-existent-repo-id/connect`)
      .set('Cookie', ownerCookie)
      .set('x-organization-id', testOrgId)
      .set('Content-Type', 'application/json')
      .send(moderatePayload);

    // Reaches repository controller logic and returns 404 (or validation error), NOT 413
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(404);
  });

  // Scenario 18: GitHub webhook request >5MB should return 413 Payload Too Large
  it('Scenario 18: GitHub webhook request >5MB should return 413 Payload Too Large', async () => {
    const oversizedPayload = {
      action: 'ping',
      padding: 'y'.repeat(5 * 1024 * 1024 + 500),
    };

    const res = await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', 'deliv-oversized')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', 'sha256=dummy')
      .set('Content-Type', 'application/json')
      .send(oversizedPayload)
      .expect(413);

    expect(res.body.statusCode).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(res.body.message).toBe('Request body too large');
  });

  // Scenario 19: Small valid signed webhook verifies exact HMAC and succeeds (200)
  it('Scenario 19: Small valid signed webhook verifies exact HMAC and succeeds', async () => {
    const payload = { action: 'ping', check: 'small-valid' };
    const bodyStr = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', testWebhookSecret).update(Buffer.from(bodyStr)).digest('hex')}`;
    const deliveryId = 'deliv-small-valid-001';

    const res = await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', deliveryId)
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(payload)
      .expect(200);

    expect(res.body.received).toBe(true);
    expect(res.body.handled).toBe(true);
    expect(res.body.deliveryId).toBe(deliveryId);
  });

  // Scenario 20: Webhook with one-byte altered body should reject HMAC with 401 Unauthorized
  it('Scenario 20: Webhook with one-byte altered body should reject HMAC with 401 Unauthorized', async () => {
    const originalPayload = { action: 'ping', hook_id: 11111 };
    const bodyStr = JSON.stringify(originalPayload);
    // Signature computed on original payload
    const signature = `sha256=${crypto.createHmac('sha256', testWebhookSecret).update(Buffer.from(bodyStr)).digest('hex')}`;

    // Payload altered by one character/byte
    const tamperedPayload = { action: 'ping', hook_id: 11112 };

    await request(app.getHttpServer())
      .post('/github/webhooks')
      .set('x-github-delivery', 'deliv-tampered-001')
      .set('x-github-event', 'ping')
      .set('x-hub-signature-256', signature)
      .set('Content-Type', 'application/json')
      .send(tamperedPayload)
      .expect(401);
  });
});
