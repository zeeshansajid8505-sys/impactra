import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CacheService } from '../cache/cache.service';
import { TokenService } from '../auth/services/token.service';
import { Session, User } from '@impactra/database';
import { SessionDto } from '@impactra/shared';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_TTL_SECONDS = 300; // 5 minutes fast cache

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Creates a new persistent session, returning both the created DB record
   * and the plaintext token to be set in the HttpOnly cookie.
   */
  async createSession(
    userId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ session: Session; rawToken: string }> {
    const rawToken = this.tokenService.generateSessionToken();
    const sessionTokenHash = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    // Sanitize user-agent & coarse IP metadata (truncate if needed)
    const cleanUserAgent = userAgent ? userAgent.substring(0, 255) : null;
    const cleanIp = ipAddress ? ipAddress.substring(0, 45) : null;

    const session = await this.databaseService.client.session.create({
      data: {
        sessionTokenHash,
        userId,
        expiresAt,
        userAgent: cleanUserAgent,
        ipAddress: cleanIp,
      },
    });

    // Populate Redis short-lived fast lookup cache
    await this.cacheSession(sessionTokenHash, session.id, userId, expiresAt);

    return { session, rawToken };
  }

  /**
   * Validates a session token from an incoming request cookie.
   * Returns the session and associated user if valid, or null if expired/revoked.
   */
  async validateSession(
    rawToken: string,
  ): Promise<{ session: Session; user: User } | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const sessionTokenHash = this.tokenService.hashToken(rawToken);

    // 1. Check Redis cache for fast validation
    const cached = await this.getCachedSession(sessionTokenHash);
    const now = new Date();

    // 2. Fetch authoritative session from PostgreSQL
    const session = await this.databaseService.client.session.findUnique({
      where: { sessionTokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= now) {
      if (cached) {
        await this.evictCachedSession(sessionTokenHash);
      }
      return null;
    }

    // 3. Throttle lastActiveAt updates (at most once every 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (session.lastActiveAt < fiveMinutesAgo) {
      this.databaseService.client.session
        .update({
          where: { id: session.id },
          data: { lastActiveAt: now },
        })
        .catch((err: unknown) => {
          this.logger.warn(`Failed to update session activity: ${err}`);
        });
    }

    // Refresh cache
    if (!cached) {
      await this.cacheSession(
        sessionTokenHash,
        session.id,
        session.userId,
        session.expiresAt,
      );
    }

    return { session, user: session.user };
  }

  /**
   * Revokes a single session by its raw token.
   */
  async revokeSessionByToken(rawToken: string): Promise<void> {
    const sessionTokenHash = this.tokenService.hashToken(rawToken);
    await this.databaseService.client.session.updateMany({
      where: { sessionTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.evictCachedSession(sessionTokenHash);
  }

  /**
   * Revokes a specific session by ID, ensuring it belongs to the authenticated user.
   */
  async revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.databaseService.client.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });

    if (!session) return false;

    await this.databaseService.client.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await this.evictCachedSession(session.sessionTokenHash);
    return true;
  }

  /**
   * Revokes all active sessions for a user (e.g. on password change or account compromise).
   */
  async revokeAllUserSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const whereClause: { userId: string; revokedAt: null; id?: { not: string } } = {
      userId,
      revokedAt: null,
    };
    if (exceptSessionId) {
      whereClause.id = { not: exceptSessionId };
    }

    const sessions = await this.databaseService.client.session.findMany({
      where: whereClause,
      select: { id: true, sessionTokenHash: true },
    });

    if (sessions.length === 0) return 0;

    const result = await this.databaseService.client.session.updateMany({
      where: whereClause,
      data: { revokedAt: new Date() },
    });

    // Clear caches
    for (const s of sessions) {
      await this.evictCachedSession(s.sessionTokenHash);
    }

    return result.count;
  }

  /**
   * Lists all active non-revoked sessions for a user.
   */
  async getUserActiveSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionDto[]> {
    const sessions = await this.databaseService.client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      createdAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      isCurrent: s.id === currentSessionId,
    }));
  }

  private async cacheSession(
    tokenHash: string,
    sessionId: string,
    userId: string,
    expiresAt: Date,
  ): Promise<void> {
    const redis = this.cacheService.redisClient;
    if (!redis || redis.status !== 'ready') return;
    try {
      const key = `impactra:session:${tokenHash}`;
      const payload = JSON.stringify({ sessionId, userId, expiresAt: expiresAt.toISOString() });
      await redis.setex(key, CACHE_TTL_SECONDS, payload);
    } catch (err: unknown) {
      this.logger.debug(`Redis session cache write skipped: ${err}`);
    }
  }

  private async getCachedSession(
    tokenHash: string,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const redis = this.cacheService.redisClient;
    if (!redis || redis.status !== 'ready') return null;
    try {
      const key = `impactra:session:${tokenHash}`;
      const data = await redis.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async evictCachedSession(tokenHash: string): Promise<void> {
    const redis = this.cacheService.redisClient;
    if (!redis || redis.status !== 'ready') return;
    try {
      await redis.del(`impactra:session:${tokenHash}`);
    } catch (err: unknown) {
      this.logger.debug(`Redis session cache eviction skipped: ${err}`);
    }
  }
}
