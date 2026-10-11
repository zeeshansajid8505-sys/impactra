import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import { GitHubInstallationStateService } from '../src/github/services/github-installation-state.service';
import { DatabaseService } from '../src/database/database.service';

describe('GitHubInstallationStateService', () => {
  let stateService: GitHubInstallationStateService;
  let mockDb: any;
  const mockStates = new Map<string, any>();

  beforeEach(() => {
    mockStates.clear();

    mockDb = {
      client: {
        gitHubInstallationState: {
          create: jest.fn().mockImplementation(async ({ data }) => {
            const record = {
              id: `state-${Date.now()}-${Math.random()}`,
              ...data,
              consumedAt: null,
              createdAt: new Date(),
            };
            mockStates.set(data.stateHash, record);
            return record;
          }),
          findUnique: jest.fn().mockImplementation(async ({ where }) => {
            return mockStates.get(where.stateHash) || null;
          }),
          update: jest.fn().mockImplementation(async ({ where, data }) => {
            const existing = Array.from(mockStates.values()).find((s) => s.id === where.id);
            if (!existing) throw new Error('Not found');
            Object.assign(existing, data);
            return existing;
          }),
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            let count = 0;
            for (const record of mockStates.values()) {
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
      },
    };

    stateService = new GitHubInstallationStateService(mockDb as unknown as DatabaseService);
  });

  it('should generate a 256-bit cryptographically secure state and store its SHA-256 hash', async () => {
    const orgId = 'org-123';
    const userId = 'user-456';

    const rawState = await stateService.generateState(orgId, userId);

    expect(rawState).toBeDefined();
    expect(typeof rawState).toBe('string');
    expect(rawState.length).toBe(64); // 32 bytes hex = 64 characters

    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');
    expect(mockStates.has(expectedHash)).toBe(true);

    const record = mockStates.get(expectedHash);
    expect(record.organizationId).toBe(orgId);
    expect(record.userId).toBe(userId);
    expect(record.consumedAt).toBeNull();
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should successfully consume a valid state via consumeState and return orgId and userId', async () => {
    const orgId = 'org-123';
    const userId = 'user-456';

    const rawState = await stateService.generateState(orgId, userId);
    const result = await stateService.consumeState(rawState);

    expect(result).toEqual({ organizationId: orgId, userId: userId });

    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');
    const record = mockStates.get(expectedHash);
    expect(record.consumedAt).toBeInstanceOf(Date);
  });

  it('should successfully consume a valid state via consumeStateForUser when user matches', async () => {
    const orgId = 'org-123';
    const userId = 'user-456';

    const rawState = await stateService.generateState(orgId, userId);
    const result = await stateService.consumeStateForUser(rawState, userId);

    expect(result).toEqual({ organizationId: orgId, userId: userId });

    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');
    const record = mockStates.get(expectedHash);
    expect(record.consumedAt).toBeInstanceOf(Date);
  });

  it('CRITICAL: should reject with ForbiddenException when user does not match and NOT burn state', async () => {
    const orgId = 'org-123';
    const legitimateUserId = 'user-initiator';
    const attackerUserId = 'user-attacker';

    const rawState = await stateService.generateState(orgId, legitimateUserId);
    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');

    // Attacker invokes callback with legitimate user's state
    await expect(
      stateService.consumeStateForUser(rawState, attackerUserId),
    ).rejects.toThrow(ForbiddenException);

    // Verify state record is UNCHANGED and UNCONSUMED in database
    const record = mockStates.get(expectedHash);
    expect(record.consumedAt).toBeNull();

    // Legitimate user subsequently consumes the unburned state successfully
    const legitResult = await stateService.consumeStateForUser(rawState, legitimateUserId);
    expect(legitResult).toEqual({ organizationId: orgId, userId: legitimateUserId });
    expect(record.consumedAt).toBeInstanceOf(Date);

    // Replay by legitimate user is now rejected
    await expect(
      stateService.consumeStateForUser(rawState, legitimateUserId),
    ).rejects.toThrow(BadRequestException);
    await expect(
      stateService.consumeStateForUser(rawState, legitimateUserId),
    ).rejects.toThrow('Installation state has already been consumed.');
  });

  it('should reject already consumed state tokens (single-use enforcement)', async () => {
    const orgId = 'org-123';
    const userId = 'user-456';

    const rawState = await stateService.generateState(orgId, userId);
    await stateService.consumeState(rawState);

    await expect(stateService.consumeState(rawState)).rejects.toThrow(BadRequestException);
    await expect(stateService.consumeState(rawState)).rejects.toThrow(
      'Installation state has already been consumed.',
    );
  });

  it('should reject non-existent state tokens', async () => {
    const bogusState = crypto.randomBytes(32).toString('hex');
    await expect(stateService.consumeState(bogusState)).rejects.toThrow(BadRequestException);
    await expect(stateService.consumeState(bogusState)).rejects.toThrow(
      'Invalid or non-existent installation state.',
    );
    await expect(stateService.consumeStateForUser(bogusState, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject expired state tokens', async () => {
    const orgId = 'org-123';
    const userId = 'user-456';

    const rawState = await stateService.generateState(orgId, userId);
    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');
    const record = mockStates.get(expectedHash);
    // Artificially expire the token
    record.expiresAt = new Date(Date.now() - 1000);

    await expect(stateService.consumeState(rawState)).rejects.toThrow(BadRequestException);
    await expect(stateService.consumeState(rawState)).rejects.toThrow(
      'Installation state has expired. Please initiate installation again.',
    );
    await expect(stateService.consumeStateForUser(rawState, userId)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject invalid or missing arguments for consumeStateForUser', async () => {
    await expect(stateService.consumeStateForUser('', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(stateService.consumeStateForUser('abc', '')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('CRITICAL: should handle concurrent consumption race condition atomically (exactly 1 winner, 1 rejected)', async () => {
    const orgId = 'org-123';
    const userId = 'user-concurrent';

    const rawState = await stateService.generateState(orgId, userId);

    const [firstResult, secondResult] = await Promise.allSettled([
      stateService.consumeStateForUser(rawState, userId),
      stateService.consumeStateForUser(rawState, userId),
    ]);

    const fulfilled = [firstResult, secondResult].filter((r) => r.status === 'fulfilled');
    const rejected = [firstResult, secondResult].filter((r) => r.status === 'rejected');

    // Invariant: Exactly one request succeeds, and exactly one request is rejected
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (fulfilled[0].status === 'fulfilled') {
      expect(fulfilled[0].value).toEqual({ organizationId: orgId, userId });
    }

    if (rejected[0].status === 'rejected') {
      const reason = rejected[0].reason;
      const isExpectedSecurityOutcome =
        reason instanceof BadRequestException || reason instanceof ConflictException;
      expect(isExpectedSecurityOutcome).toBe(true);
    }

    // Verify token is consumed exactly once in database
    const expectedHash = crypto.createHash('sha256').update(rawState).digest('hex');
    const record = mockStates.get(expectedHash);
    expect(record.consumedAt).toBeInstanceOf(Date);

    // Verify a subsequent third replay attempt fails
    await expect(
      stateService.consumeStateForUser(rawState, userId),
    ).rejects.toThrow(BadRequestException);
  });

  it('CRITICAL: should reject with ConflictException when concurrent callers both pass read check and race updateMany', async () => {
    const orgId = 'org-123';
    const userId = 'user-cas-loser';

    const rawState = await stateService.generateState(orgId, userId);

    // Simulate CAS collision where updateMany returns count === 0
    mockDb.client.gitHubInstallationState.updateMany = jest.fn().mockResolvedValue({ count: 0 });

    await expect(stateService.consumeStateForUser(rawState, userId)).rejects.toThrow(
      ConflictException,
    );
    await expect(stateService.consumeStateForUser(rawState, userId)).rejects.toThrow(
      'Installation state token was consumed concurrently or has expired.',
    );
  });
});
