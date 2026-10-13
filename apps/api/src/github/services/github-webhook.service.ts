import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { GitHubConfigService } from '../config/github-config.service';
import { GitHubInstallationService } from './github-installation.service';
import { GitHubRepositoryService } from './github-repository.service';
import { ChangeOrchestratorService } from '../../changes/services/change-orchestrator.service';
import { WebhookProcessingResponse } from '@impactra/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidRepoId(value: unknown): value is string | number | bigint {
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && !Number.isNaN(value)) ||
    typeof value === 'bigint'
  );
}

function extractRepositoryIds(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const item of list) {
    if (isRecord(item) && isValidRepoId(item.id)) {
      ids.push(String(item.id));
    }
  }
  return ids;
}

function isUniqueConstraintError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const record = err as Record<string, unknown>;
    if (record.code === 'P2002') return true;
    if (
      typeof record.message === 'string' &&
      (record.message.includes('P2002') || record.message.includes('Unique constraint'))
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class GitHubWebhookService {
  private readonly logger = new Logger(GitHubWebhookService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: GitHubConfigService,
    private readonly installationService: GitHubInstallationService,
    private readonly repositoryService: GitHubRepositoryService,
    @Optional()
    @Inject(forwardRef(() => ChangeOrchestratorService))
    private readonly changeOrchestratorService?: ChangeOrchestratorService,
  ) {}

  /**
   * Verifies the HMAC-SHA256 signature from GitHub using timingSafeEqual.
   */
  verifySignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
    const secret = this.configService.webhookSecret?.trim();

    if (!secret) {
      this.logger.warn('Webhook received but GITHUB_WEBHOOK_SECRET is not configured.');
      return false;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const signature = signatureHeader.slice('sha256='.length);
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Processes an incoming GitHub webhook delivery idempotently.
   */
  async processWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string | undefined,
    payload: unknown,
  ): Promise<WebhookProcessingResponse> {
    const deliveryId = (headers['x-github-delivery'] as string) || '';
    const event = (headers['x-github-event'] as string) || '';
    const signature = (headers['x-hub-signature-256'] as string) || '';

    if (!deliveryId) {
      throw new BadRequestException('Missing X-GitHub-Delivery header');
    }

    if (!event) {
      throw new BadRequestException('Missing X-GitHub-Event header');
    }

    const bodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : typeof rawBody === 'string'
        ? Buffer.from(rawBody, 'utf8')
        : Buffer.from(JSON.stringify(payload || {}), 'utf8');

    // 1. Signature Verification
    // GITHUB_WEBHOOK_SECRET is strictly required to verify webhooks. Never trust unsigned payloads.
    const secretConfigured = Boolean(this.configService.webhookSecret?.trim());
    if (!secretConfigured) {
      this.logger.warn(`Rejecting webhook delivery ${deliveryId}: GITHUB_WEBHOOK_SECRET is not configured.`);
      throw new UnauthorizedException('GitHub webhook secret is not configured');
    }

    const isValid = this.verifySignature(bodyBuffer, signature);
    if (!isValid) {
      this.logger.warn(`Invalid HMAC-SHA256 webhook signature for delivery ${deliveryId}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Safe metadata computation
    const payloadSha256 = crypto.createHash('sha256').update(bodyBuffer).digest('hex');
    const payloadRecord = isRecord(payload) ? payload : null;
    const action = typeof payloadRecord?.action === 'string' ? payloadRecord.action : null;
    const rawInstallationId = isRecord(payloadRecord?.installation)
      ? payloadRecord.installation.id
      : null;
    const githubInstallationId = isValidRepoId(rawInstallationId)
      ? String(rawInstallationId)
      : null;

    let organizationId: string | null = null;
    if (githubInstallationId) {
      const boundInstallation = await this.databaseService.client.gitHubInstallation.findUnique({
        where: { githubInstallationId },
      });
      organizationId = boundInstallation?.organizationId || null;
    }

    // 3. Atomic Database Claim Before Side Effects (Concurrency Boundary via UNIQUE constraint)
    let deliveryRecord: { id: string };
    try {
      deliveryRecord = await this.databaseService.client.gitHubWebhookDelivery.create({
        data: {
          githubDeliveryId: deliveryId,
          event,
          action,
          githubInstallationId,
          organizationId,
          payloadSha256,
          status: 'received',
          attemptCount: 1,
        },
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        this.logger.log(`Webhook delivery ${deliveryId} already claimed or processed (idempotent duplicate).`);
        return {
          received: true,
          duplicate: true,
          handled: true,
          deliveryId,
        };
      }
      throw err;
    }

    // 4. Dispatch Event (Only single winner executes side effects)
    try {
      await this.handleEvent(event, action, githubInstallationId, payload);

      await this.databaseService.client.gitHubWebhookDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
          failureCode: null,
        },
      });

      return {
        received: true,
        handled: true,
        deliveryId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing webhook ${event}:${action} (${deliveryId}): ${msg}`);

      await this.databaseService.client.gitHubWebhookDelivery
        .update({
          where: { id: deliveryRecord.id },
          data: {
            status: 'failed',
            failureCode: msg.slice(0, 255),
          },
        })
        .catch((updateErr: unknown) => {
          this.logger.error(`Failed to record failure status for webhook ${deliveryId}: ${updateErr}`);
        });

      throw err;
    }
  }

  private async handleEvent(
    event: string,
    action: string | null,
    githubInstallationId: string | null,
    payload: unknown,
  ): Promise<void> {
    switch (event) {
      case 'ping':
        this.logger.log('GitHub webhook ping acknowledged.');
        break;

      case 'installation':
        await this.handleInstallationEvent(action, githubInstallationId, payload);
        break;

      case 'installation_repositories':
        await this.handleInstallationRepositoriesEvent(action, githubInstallationId, payload);
        break;

      case 'repository':
        await this.handleRepositoryEvent(action, githubInstallationId, payload);
        break;

      case 'pull_request':
        if (this.changeOrchestratorService) {
          await this.changeOrchestratorService.handlePullRequestWebhook(event, payload);
        } else {
          this.logger.warn('ChangeOrchestratorService not available to handle pull_request webhook');
        }
        break;

      default:
        this.logger.debug(`Unhandled GitHub webhook event: ${event}`);
        break;
    }
  }

  private async handleInstallationEvent(
    action: string | null,
    githubInstallationId: string | null,
    _payload: unknown,
  ): Promise<void> {
    if (!githubInstallationId) return;

    if (action === 'deleted') {
      const inst = await this.databaseService.client.gitHubInstallation.findUnique({
        where: { githubInstallationId },
      });
      if (inst) {
        const now = new Date();
        await this.databaseService.client.$transaction([
          this.databaseService.client.gitHubInstallation.update({
            where: { id: inst.id },
            data: { status: 'DELETED', updatedAt: now },
          }),
          this.databaseService.client.repositoryConnection.updateMany({
            where: { githubInstallationId },
            data: { available: false, updatedAt: now },
          }),
        ]);
        await this.installationService.evictInstallationToken(githubInstallationId);
        this.logger.log(`GitHub installation ${githubInstallationId} marked as DELETED.`);
      }
    } else if (action === 'suspend') {
      const inst = await this.databaseService.client.gitHubInstallation.findUnique({
        where: { githubInstallationId },
      });
      if (inst) {
        const now = new Date();
        await this.databaseService.client.$transaction([
          this.databaseService.client.gitHubInstallation.update({
            where: { id: inst.id },
            data: { status: 'SUSPENDED', suspendedAt: now, updatedAt: now },
          }),
          this.databaseService.client.repositoryConnection.updateMany({
            where: { githubInstallationId },
            data: { available: false, updatedAt: now },
          }),
        ]);
        await this.installationService.evictInstallationToken(githubInstallationId);
        this.logger.log(`GitHub installation ${githubInstallationId} marked as SUSPENDED.`);
      }
    } else if (action === 'unsuspend') {
      const inst = await this.databaseService.client.gitHubInstallation.findUnique({
        where: { githubInstallationId },
      });
      if (inst) {
        const now = new Date();
        // 1. Reactivate the installation in database
        await this.databaseService.client.gitHubInstallation.update({
          where: { id: inst.id },
          data: { status: 'ACTIVE', suspendedAt: null, updatedAt: now },
        });

        // 2. Perform authoritative repository synchronization using GitHubRepositoryService.
        // Do NOT blanket-update all repositories to available: true.
        try {
          await this.repositoryService.syncRepositories(inst.organizationId);
          this.logger.log(
            `GitHub installation ${githubInstallationId} reactivated and repositories authoritatively synchronized.`,
          );
        } catch (syncErr: unknown) {
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          this.logger.warn(
            `Installation ${githubInstallationId} reactivated, but authoritative repository synchronization failed: ${msg}. Repositories remain conservatively unavailable.`,
          );
        }
      }
    } else if (action === 'created') {
      // If already bound, ensure ACTIVE. If unknown, DO NOT auto-bind to any organization!
      const inst = await this.databaseService.client.gitHubInstallation.findUnique({
        where: { githubInstallationId },
      });
      if (inst) {
        await this.databaseService.client.gitHubInstallation.update({
          where: { id: inst.id },
          data: { status: 'ACTIVE', updatedAt: new Date() },
        });
      } else {
        this.logger.warn(
          `Installation ${githubInstallationId} created on GitHub without preceding user OAuth state. Awaiting explicit user callback connection.`,
        );
      }
    }
  }

  private async handleInstallationRepositoriesEvent(
    action: string | null,
    githubInstallationId: string | null,
    payload: unknown,
  ): Promise<void> {
    if (!githubInstallationId) return;

    const installation = await this.databaseService.client.gitHubInstallation.findUnique({
      where: { githubInstallationId },
    });

    if (!installation) return;

    const now = new Date();
    const payloadRecord = isRecord(payload) ? payload : null;

    if (action === 'added' && Array.isArray(payloadRecord?.repositories_added)) {
      for (const item of payloadRecord.repositories_added) {
        if (!isRecord(item) || !isValidRepoId(item.id)) continue;
        const githubRepositoryId = String(item.id);
        const name = typeof item.name === 'string' ? item.name : `repo-${githubRepositoryId}`;
        const fullName =
          typeof item.full_name === 'string'
            ? item.full_name
            : `${installation.accountLogin}/${name}`;
        const isPrivate = Boolean(item.private);
        const ownerLogin = fullName.includes('/')
          ? fullName.split('/')[0]
          : installation.accountLogin;

        await this.databaseService.client.repositoryConnection.upsert({
          where: {
            organizationId_githubRepositoryId: {
              organizationId: installation.organizationId,
              githubRepositoryId,
            },
          },
          update: {
            name,
            fullName,
            isPrivate,
            available: true,
            lastSyncedAt: now,
            updatedAt: now,
          },
          create: {
            organizationId: installation.organizationId,
            githubInstallationId,
            githubRepositoryId,
            ownerLogin,
            name,
            fullName,
            defaultBranch: 'main',
            isPrivate,
            available: true,
            connected: false,
            lastSyncedAt: now,
          },
        });
      }
    } else if (action === 'removed' && Array.isArray(payloadRecord?.repositories_removed)) {
      const removedIds = extractRepositoryIds(payloadRecord.repositories_removed);
      if (removedIds.length > 0) {
        await this.databaseService.client.repositoryConnection.updateMany({
          where: {
            organizationId: installation.organizationId,
            githubInstallationId,
            githubRepositoryId: { in: removedIds },
          },
          data: {
            available: false,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
      }
    }
  }

  private async handleRepositoryEvent(
    action: string | null,
    githubInstallationId: string | null,
    payload: unknown,
  ): Promise<void> {
    if (!githubInstallationId) {
      this.logger.debug('Repository webhook received without installation context; ignoring.');
      return;
    }

    const installation = await this.databaseService.client.gitHubInstallation.findUnique({
      where: { githubInstallationId },
    });

    if (!installation) {
      this.logger.warn(
        `Repository webhook received for unbound installation ${githubInstallationId}; ignoring.`,
      );
      return;
    }

    const repoObj = isRecord(payload) && isRecord(payload.repository) ? payload.repository : null;
    if (!repoObj || !isValidRepoId(repoObj.id)) {
      return;
    }

    const githubRepositoryId = String(repoObj.id);
    const now = new Date();

    const scopedWhere = {
      organizationId: installation.organizationId,
      githubInstallationId,
      githubRepositoryId,
    };

    if (action === 'deleted') {
      await this.databaseService.client.repositoryConnection.updateMany({
        where: scopedWhere,
        data: { available: false, updatedAt: now },
      });
      this.logger.log(
        `Repository ${githubRepositoryId} marked unavailable for org ${installation.organizationId} on installation ${githubInstallationId}.`,
      );
    } else if (
      action === 'renamed' &&
      typeof repoObj.name === 'string' &&
      typeof repoObj.full_name === 'string'
    ) {
      await this.databaseService.client.repositoryConnection.updateMany({
        where: scopedWhere,
        data: {
          name: repoObj.name,
          fullName: repoObj.full_name,
          updatedAt: now,
        },
      });
    } else if (action === 'archived') {
      await this.databaseService.client.repositoryConnection.updateMany({
        where: scopedWhere,
        data: { archived: true, updatedAt: now },
      });
    } else if (action === 'unarchived') {
      await this.databaseService.client.repositoryConnection.updateMany({
        where: scopedWhere,
        data: { archived: false, updatedAt: now },
      });
    }
  }
}
