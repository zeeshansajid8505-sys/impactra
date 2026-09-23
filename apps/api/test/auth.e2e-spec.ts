import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { AppValidationPipe } from '../src/common/pipes/validation.pipe';

const request: typeof supertest =
  typeof supertest === 'function'
    ? supertest
    : (supertest as unknown as { default: typeof supertest }).default;

describe('Authentication, Organizations & RBAC (E2E)', () => {
  let app: INestApplication;

  // In-memory persistent state for realistic E2E flow
  const users: any[] = [];
  const sessions: any[] = [];
  const organizations: any[] = [];
  const memberships: any[] = [];
  const resetTokens: any[] = [];

  let mockDbService: any;
  let mockCacheService: any;
  let mockStorageService: any;

  beforeAll(async () => {
    mockCacheService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 1 }),
      redisClient: null, // Fall back to in-memory guards
    };

    mockStorageService = {
      ping: jest.fn().mockResolvedValue({ status: 'healthy', latencyMs: 2 }),
    };

    mockDbService = {
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
            if (where.email) {
              return users.find((u) => u.email === where.email) || null;
            }
            if (where.id) {
              const u = users.find((u) => u.id === where.id);
              if (!u) return null;
              return {
                ...u,
                memberships: memberships
                  .filter((m) => m.userId === u.id)
                  .map((m) => ({
                    ...m,
                    organization: organizations.find((o) => o.id === m.organizationId),
                  })),
              };
            }
            return null;
          }),
          create: jest.fn(async ({ data }: any) => {
            const user = {
              id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              name: data.name,
              email: data.email,
              passwordHash: data.passwordHash,
              emailVerifiedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            users.push(user);
            return user;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const user = users.find((u) => u.id === where.id);
            if (!user) throw new Error('User not found');
            Object.assign(user, data, { updatedAt: new Date() });
            return user;
          }),
        },
        session: {
          findUnique: jest.fn(async ({ where }: any) => {
            const s = sessions.find((item) => item.sessionTokenHash === where.sessionTokenHash);
            if (!s) return null;
            const u = users.find((user) => user.id === s.userId);
            return { ...s, user: u };
          }),
          findFirst: jest.fn(async ({ where }: any) => {
            return (
              sessions.find((s) => {
                if (where.id && s.id !== where.id) return false;
                if (where.userId && s.userId !== where.userId) return false;
                if (where.revokedAt === null && s.revokedAt !== null) return false;
                return true;
              }) || null
            );
          }),
          findMany: jest.fn(async ({ where }: any) => {
            return sessions.filter((s) => {
              if (where.userId && s.userId !== where.userId) return false;
              if (where.revokedAt === null && s.revokedAt !== null) return false;
              return true;
            });
          }),
          create: jest.fn(async ({ data }: any) => {
            const s = {
              id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              sessionTokenHash: data.sessionTokenHash,
              userId: data.userId,
              expiresAt: data.expiresAt,
              revokedAt: null,
              userAgent: data.userAgent || null,
              ipAddress: data.ipAddress || null,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            };
            sessions.push(s);
            return s;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const s = sessions.find((item) => item.id === where.id);
            if (!s) throw new Error('Session not found');
            Object.assign(s, data);
            return s;
          }),
          updateMany: jest.fn(async ({ where, data }: any) => {
            let count = 0;
            for (const s of sessions) {
              if (where.userId && s.userId !== where.userId) continue;
              if (where.sessionTokenHash && s.sessionTokenHash !== where.sessionTokenHash) continue;
              if (where.revokedAt === null && s.revokedAt !== null) continue;
              if (where.id?.not && s.id === where.id.not) continue;
              Object.assign(s, data);
              count++;
            }
            return { count };
          }),
        },
        organization: {
          findUnique: jest.fn(async ({ where }: any) => {
            if (where.slug) return organizations.find((o) => o.slug === where.slug) || null;
            if (where.id) return organizations.find((o) => o.id === where.id) || null;
            return null;
          }),
          findFirst: jest.fn(async ({ where }: any) => {
            return (
              organizations.find((o) => {
                if (where.slug && o.slug !== where.slug) return false;
                if (where.id?.not && o.id === where.id.not) return false;
                return true;
              }) || null
            );
          }),
          create: jest.fn(async ({ data }: any) => {
            const org = {
              id: `org-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              name: data.name,
              slug: data.slug,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            organizations.push(org);
            return org;
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const org = organizations.find((o) => o.id === where.id);
            if (!org) throw new Error('Org not found');
            Object.assign(org, data, { updatedAt: new Date() });
            return org;
          }),
        },
        organizationMembership: {
          findUnique: jest.fn(async ({ where }: any) => {
            if (where.organizationId_userId) {
              const m = memberships.find(
                (item) =>
                  item.organizationId === where.organizationId_userId.organizationId &&
                  item.userId === where.organizationId_userId.userId,
              );
              if (!m) return null;
              return {
                ...m,
                organization: organizations.find((o) => o.id === m.organizationId),
                user: users.find((u) => u.id === m.userId),
              };
            }
            if (where.id) {
              const m = memberships.find((item) => item.id === where.id);
              if (!m) return null;
              return {
                ...m,
                organization: organizations.find((o) => o.id === m.organizationId),
                user: users.find((u) => u.id === m.userId),
              };
            }
            return null;
          }),
          findMany: jest.fn(async ({ where }: any) => {
            return memberships
              .filter((m) => {
                if (where.organizationId && m.organizationId !== where.organizationId) return false;
                if (where.userId && m.userId !== where.userId) return false;
                return true;
              })
              .map((m) => ({
                ...m,
                organization: organizations.find((o) => o.id === m.organizationId),
                user: users.find((u) => u.id === m.userId),
              }));
          }),
          create: jest.fn(async ({ data }: any) => {
            const m = {
              id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              organizationId: data.organizationId,
              userId: data.userId,
              role: data.role,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            memberships.push(m);
            return {
              ...m,
              organization: organizations.find((o) => o.id === m.organizationId),
              user: users.find((u) => u.id === m.userId),
            };
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const m = memberships.find((item) => item.id === where.id);
            if (!m) throw new Error('Membership not found');
            Object.assign(m, data, { updatedAt: new Date() });
            return {
              ...m,
              user: users.find((u) => u.id === m.userId),
            };
          }),
          delete: jest.fn(async ({ where }: any) => {
            const index = memberships.findIndex((item) => item.id === where.id);
            if (index !== -1) memberships.splice(index, 1);
            return {};
          }),
          count: jest.fn(async ({ where }: any) => {
            return memberships.filter((m) => {
              if (where.organizationId && m.organizationId !== where.organizationId) return false;
              if (where.role && m.role !== where.role) return false;
              return true;
            }).length;
          }),
        },
        organizationInvitation: {
          create: jest.fn(async ({ data }: any) => {
            return { id: 'inv-1', ...data };
          }),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        passwordResetToken: {
          create: jest.fn(async ({ data }: any) => {
            const r = { id: `reset-${Date.now()}`, ...data, usedAt: null };
            resetTokens.push(r);
            return r;
          }),
          findFirst: jest.fn(async ({ where }: any) => {
            return (
              resetTokens.find((r) => {
                if (where.tokenHash && r.tokenHash !== where.tokenHash) return false;
                if (where.usedAt === null && r.usedAt !== null) return false;
                return true;
              }) || null
            );
          }),
          update: jest.fn(async ({ where, data }: any) => {
            const r = resetTokens.find((item) => item.id === where.id);
            if (r) Object.assign(r, data);
            return r;
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
      .useValue(mockCacheService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  let userACookie: string;
  let userBCookie: string;
  let orgAId: string;
  let userBId: string;

  it('1. Registration succeeds and sets HttpOnly session cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Alice Owner',
        email: 'alice@impactra.internal',
        password: 'Password123!',
      })
      .expect(201);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('alice@impactra.internal');
    expect(res.body.session).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find((c: string) => c.startsWith('impactra_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');

    userACookie = sessionCookie.split(';')[0];
  });

  it('2. Duplicate registration fails fast with 409 Conflict', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Duplicate Alice',
        email: 'alice@impactra.internal',
        password: 'Password123!',
      })
      .expect(409);
  });

  it('3. Login fails with invalid password (generic 401)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@impactra.internal',
        password: 'WrongPassword123!',
      })
      .expect(401);
  });

  it('4. GET /auth/me returns identity when session cookie is provided', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', userACookie)
      .expect(200);

    expect(res.body.user.email).toBe('alice@impactra.internal');
    expect(res.body.session.isCurrent).toBe(true);
  });

  it('5. GET /auth/me rejects unauthenticated callers with 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);
  });

  it('6. CSRF: Authenticated mutation with untrusted origin is rejected with 403', async () => {
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Cookie', userACookie)
      .set('Origin', 'http://evil.example')
      .send({
        name: 'Evil Corp',
        slug: 'evil-corp',
      })
      .expect(403);
  });

  it('7. CSRF: Authenticated mutation with missing Origin/Referer is rejected with 403', async () => {
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Cookie', userACookie)
      .send({
        name: 'No Origin Corp',
        slug: 'no-origin-corp',
      })
      .expect(403);
  });

  it('8. Organization creation with allowed Origin transactionally assigns OWNER membership', async () => {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        name: 'Impactra Core Labs',
        slug: 'impactra-core',
      })
      .expect(201);

    expect(res.body.organization.name).toBe('Impactra Core Labs');
    expect(res.body.organization.slug).toBe('impactra-core');
    expect(res.body.membership.role).toBe('OWNER');

    orgAId = res.body.organization.id;
  });

  it('9. Register User B and verify multi-tenant isolation', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Bob Outsider',
        email: 'bob@competitor.internal',
        password: 'Password123!',
      })
      .expect(201);

    userBId = res.body.user.id;
    const sessionCookie = res.headers['set-cookie'].find((c: string) =>
      c.startsWith('impactra_session='),
    );
    userBCookie = sessionCookie.split(';')[0];

    // User B attempts to access Org A (Cross-Tenant check)
    await request(app.getHttpServer())
      .get(`/organizations/${orgAId}`)
      .set('Cookie', userBCookie)
      .expect(403);
  });

  it('10. User A invites User B as DEVELOPER to Org A', async () => {
    const res = await request(app.getHttpServer())
      .post(`/organizations/${orgAId}/members`)
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'bob@competitor.internal',
        role: 'DEVELOPER',
      })
      .expect(201);

    expect(res.body.status).toBe('added');
    expect(res.body.membership.role).toBe('DEVELOPER');
  });

  it('11. User B (DEVELOPER) cannot update Organization profile (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/organizations/${orgAId}`)
      .set('Cookie', userBCookie)
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'Hacked Name' })
      .expect(403);
  });

  it('12. User B cannot elevate themselves to OWNER (403)', async () => {
    const userBMembership = memberships.find(
      (m) => m.userId === userBId && m.organizationId === orgAId,
    );

    await request(app.getHttpServer())
      .patch(`/organizations/${orgAId}/members/${userBMembership.id}`)
      .set('Cookie', userBCookie)
      .set('Origin', 'http://localhost:3000')
      .send({ role: 'OWNER' })
      .expect(403);
  });

  it('13. Owner safeguards: User A cannot demote the last remaining OWNER (400)', async () => {
    const userAMembership = memberships.find(
      (m) => m.organizationId === orgAId && m.role === 'OWNER',
    );

    await request(app.getHttpServer())
      .patch(`/organizations/${orgAId}/members/${userAMembership.id}`)
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .send({ role: 'ADMIN' })
      .expect(400);
  });

  it('14. Active device sessions listing and targeted revocation', async () => {
    // 1. Establish a second independent session for User A
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@impactra.internal',
        password: 'Password123!',
      })
      .expect(200);

    const secondCookies = loginRes.headers['set-cookie'];
    expect(secondCookies).toBeDefined();
    const secondSessionCookie = secondCookies.find((c: string) =>
      c.startsWith('impactra_session='),
    );
    expect(secondSessionCookie).toBeDefined();
    const userASecondCookie = secondSessionCookie.split(';')[0];

    // 2. Deterministically resolve the second session ID via GET /auth/me
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', userASecondCookie)
      .expect(200);

    expect(meRes.body.session).toBeDefined();
    expect(meRes.body.session.id).toBeDefined();
    const secondSessionId = meRes.body.session.id;

    // 3. Verify session listing with original cookie sees multiple sessions
    const listRes = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Cookie', userACookie)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(2);
    const foundSecondSession = listRes.body.find((s: any) => s.id === secondSessionId);
    expect(foundSecondSession).toBeDefined();
    expect(foundSecondSession.isCurrent).toBe(false);

    // 4. Using original userACookie, revoke ONLY the second session
    await request(app.getHttpServer())
      .delete(`/auth/sessions/${secondSessionId}`)
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    // 5. Verify the second session is now revoked (GET /auth/me returns 401)
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', userASecondCookie)
      .expect(401);

    // 6. Verify original session remains valid (GET /auth/me returns 200)
    const originalMeRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', userACookie)
      .expect(200);

    expect(originalMeRes.body.user.email).toBe('alice@impactra.internal');
    expect(originalMeRes.body.session.isCurrent).toBe(true);
  });

  it('15. User A changes password and other sessions are invalidated', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .send({
        currentPassword: 'Password123!',
        newPassword: 'NewSecurePassword456!',
      })
      .expect(200);

    // Old password should fail login
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@impactra.internal',
        password: 'Password123!',
      })
      .expect(401);

    // New password should succeed
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'alice@impactra.internal',
        password: 'NewSecurePassword456!',
      })
      .expect(200);

    expect(loginRes.body.user.email).toBe('alice@impactra.internal');
  });

  it('16. Logout revokes session and clears cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', userACookie)
      .set('Origin', 'http://localhost:3000')
      .expect(200);

    const cookies = res.headers['set-cookie'];
    const sessionCookie = cookies?.find((c: string) => c.startsWith('impactra_session='));
    expect(sessionCookie).toBeDefined();

    // Subsequent call with revoked session fails
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', userACookie)
      .expect(401);
  });
});
