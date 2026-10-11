import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';

const STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class GitHubInstallationStateService {
  private readonly logger = new Logger(GitHubInstallationStateService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generates a 256-bit cryptographically secure installation state token,
   * stores its SHA-256 hash in the database bound to org and user,
   * and returns the plaintext state string.
   */
  async generateState(organizationId: string, userId: string): Promise<string> {
    const rawState = crypto.randomBytes(32).toString('hex');
    const stateHash = crypto.createHash('sha256').update(rawState).digest('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);

    await this.databaseService.client.gitHubInstallationState.create({
      data: {
        organizationId,
        userId,
        stateHash,
        expiresAt,
      },
    });

    return rawState;
  }

  /**
   * Atomically validates and consumes the one-time state token for a specific user.
   * Ensures that if an unauthorized user attempts callback, the state is NOT consumed/burned.
   * Throws ForbiddenException if userId does not match, leaving state unconsumed.
   * Throws BadRequestException if state is invalid, already consumed, or expired.
   * Uses compare-and-set conditional updateMany to guarantee race-safe execution.
   * Throws ConflictException if a concurrent request consumes the state first.
   */
  async consumeStateForUser(
    rawState: string,
    currentUserId: string,
  ): Promise<{ organizationId: string; userId: string }> {
    if (!rawState || typeof rawState !== 'string') {
      throw new BadRequestException('State parameter is required.');
    }

    if (!currentUserId || typeof currentUserId !== 'string') {
      throw new BadRequestException('Authenticated user ID is required.');
    }

    const stateHash = crypto.createHash('sha256').update(rawState.trim()).digest('hex');

    const stateRecord = await this.databaseService.client.gitHubInstallationState.findUnique({
      where: { stateHash },
    });

    if (!stateRecord) {
      this.logger.warn('State consumption attempted with non-existent state hash.');
      throw new BadRequestException('Invalid or non-existent installation state.');
    }

    if (stateRecord.consumedAt) {
      this.logger.warn(`State consumption attempted on already-consumed state ${stateRecord.id}.`);
      throw new BadRequestException('Installation state has already been consumed.');
    }

    if (stateRecord.expiresAt < new Date()) {
      this.logger.warn(`State consumption attempted on expired state ${stateRecord.id}.`);
      throw new BadRequestException('Installation state has expired. Please initiate installation again.');
    }

    // CRITICAL OWNERSHIP CHECK: Ensure state was initiated by the current user.
    // If not, reject WITHOUT consuming/burning the state so the true initiator can still use it!
    if (stateRecord.userId !== currentUserId) {
      this.logger.warn(
        `Installation callback user mismatch: state initiated by user ${stateRecord.userId}, but callback invoked by user ${currentUserId}. State remains unconsumed.`,
      );
      throw new ForbiddenException('Installation state was initiated by a different user.');
    }

    // Race-safe Compare-and-Set (CAS): Atomically update only if consumedAt is still null,
    // the user still matches, and the token has not expired.
    const now = new Date();
    const updateResult = await this.databaseService.client.gitHubInstallationState.updateMany({
      where: {
        id: stateRecord.id,
        consumedAt: null,
        userId: currentUserId,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
      },
    });

    if (updateResult.count !== 1) {
      this.logger.warn(
        `Concurrent consumption or state invalidation detected for state ${stateRecord.id}.`,
      );
      throw new ConflictException(
        'Installation state token was consumed concurrently or has expired.',
      );
    }

    return {
      organizationId: stateRecord.organizationId,
      userId: stateRecord.userId,
    };
  }

  /**
   * Atomically validates and consumes the one-time state token without user ownership check.
   * Retained for backward compatibility. Uses compare-and-set conditional updateMany.
   */
  async consumeState(rawState: string): Promise<{ organizationId: string; userId: string }> {
    if (!rawState || typeof rawState !== 'string') {
      throw new BadRequestException('State parameter is required.');
    }

    const stateHash = crypto.createHash('sha256').update(rawState.trim()).digest('hex');

    const stateRecord = await this.databaseService.client.gitHubInstallationState.findUnique({
      where: { stateHash },
    });

    if (!stateRecord) {
      this.logger.warn('State consumption attempted with non-existent state hash.');
      throw new BadRequestException('Invalid or non-existent installation state.');
    }

    if (stateRecord.consumedAt) {
      this.logger.warn(`State consumption attempted on already-consumed state ${stateRecord.id}.`);
      throw new BadRequestException('Installation state has already been consumed.');
    }

    if (stateRecord.expiresAt < new Date()) {
      this.logger.warn(`State consumption attempted on expired state ${stateRecord.id}.`);
      throw new BadRequestException('Installation state has expired. Please initiate installation again.');
    }

    // Race-safe Compare-and-Set
    const now = new Date();
    const updateResult = await this.databaseService.client.gitHubInstallationState.updateMany({
      where: {
        id: stateRecord.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
      },
    });

    if (updateResult.count !== 1) {
      this.logger.warn(
        `Concurrent consumption or state invalidation detected for state ${stateRecord.id}.`,
      );
      throw new ConflictException(
        'Installation state token was consumed concurrently or has expired.',
      );
    }

    return {
      organizationId: stateRecord.organizationId,
      userId: stateRecord.userId,
    };
  }
}
