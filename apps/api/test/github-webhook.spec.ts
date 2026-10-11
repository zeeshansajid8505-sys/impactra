import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { GitHubWebhookService } from '../src/github/services/github-webhook.service';
import { GitHubConfigService } from '../src/github/config/github-config.service';
import { GitHubInstallationService } from '../src/github/services/github-installation.service';
import { GitHubRepositoryService } from '../src/github/services/github-repository.service';
import { DatabaseService } from '../src/database/database.service';

describe('GitHubWebhookService', () => {
  let webhookService: GitHubWebhookService;
  let mockDb: any;
  let mockConfig: any;
  let mockInstallationService: any;
  let mockRepositoryService: any;

  const testSecret = 'super_secret_webhook_key_12345';
  const deliveries = new Map<string, any>();
  const installations = new Map<string, any>();
  const repos = new Map<string, any>();

  beforeEach(() => {
    deliveries.clear();
    installations.clear();
    repos.clear();

    mockConfig = {
      webhookSecret: testSecret,
    };

    mockInstallationService = {
      evictInstallationToken: jest.fn().mockResolvedValue(undefined),
    };

    mockRepositoryService = {
      syncRepositories: jest.fn().mockResolvedValue({
        syncedCount: 1,
        availableCount: 1,
        removedCount: 0,
      }),
    };

    mockDb = {
      client: {
        gitHubWebhookDelivery: {
          findUnique: jest.fn().mockImplementation(async ({ where }) => {
            return deliveries.get(where.githubDeliveryId) || null;
          }),
          create: jest.fn().mockImplementation(async ({ data }) => {
            if (deliveries.has(data.githubDeliveryId)) {
              const err: any = new Error(
                'Unique constraint failed on the fields: (`github_delivery_id`)',
              );
              err.code = 'P2002';
              throw err;
            }
            const record = { id: `del-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, ...data };
            deliveries.set(data.githubDeliveryId, record);
            return record;
          }),
          update: jest.fn().mockImplementation(async ({ where, data }) => {
            let record: any = null;
            if (where.id) {
              record = Array.from(deliveries.values()).find((d: any) => d.id === where.id);
            } else if (where.githubDeliveryId) {
              record = deliveries.get(where.githubDeliveryId);
            }
            if (record) {
              Object.assign(record, data);
              return record;
            }
            return null;
          }),
          upsert: jest.fn().mockImplementation(async ({ where, create, update }) => {
            const existing = deliveries.get(where.githubDeliveryId);
            if (existing) {
              Object.assign(existing, update);
              return existing;
            }
            const record = { id: `del-${Date.now()}`, ...create };
            deliveries.set(where.githubDeliveryId, record);
            return record;
          }),
        },
        gitHubInstallation: {
          findUnique: jest.fn().mockImplementation(async ({ where }) => {
            return installations.get(where.githubInstallationId) || null;
          }),
          update: jest.fn().mockImplementation(async ({ where, data }) => {
            const existing = Array.from(installations.values()).find((i) => i.id === where.id);
            if (existing) Object.assign(existing, data);
            return existing;
          }),
        },
        repositoryConnection: {
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            let count = 0;
            for (const repo of repos.values()) {
              let match = true;
              if (where.githubInstallationId && repo.githubInstallationId !== where.githubInstallationId) {
                match = false;
              }
              if (where.organizationId && repo.organizationId !== where.organizationId) {
                match = false;
              }
              if (where.githubRepositoryId) {
                if (typeof where.githubRepositoryId === 'object' && Array.isArray(where.githubRepositoryId.in)) {
                  if (!where.githubRepositoryId.in.includes(repo.githubRepositoryId)) match = false;
                } else if (repo.githubRepositoryId !== where.githubRepositoryId) {
                  match = false;
                }
              }
              if (match) {
                Object.assign(repo, data);
                count++;
              }
            }
            return { count };
          }),
          upsert: jest.fn().mockImplementation(async ({ where, update, create }) => {
            const key = `${where.organizationId_githubRepositoryId.organizationId}:${where.organizationId_githubRepositoryId.githubRepositoryId}`;
            const existing = repos.get(key);
            if (existing) {
              Object.assign(existing, update);
              return existing;
            }
            const rec = { id: `repo-${Date.now()}`, ...create };
            repos.set(key, rec);
            return rec;
          }),
        },
        $transaction: jest.fn().mockImplementation(async (promises) => {
          return Promise.all(promises);
        }),
      },
    };

    webhookService = new GitHubWebhookService(
      mockDb as unknown as DatabaseService,
      mockConfig as unknown as GitHubConfigService,
      mockInstallationService as unknown as GitHubInstallationService,
      mockRepositoryService as unknown as GitHubRepositoryService,
    );
  });

  describe('HMAC-SHA256 Signature Verification', () => {
    it('should return true for a correctly signed payload', () => {
      const payload = JSON.stringify({ action: 'ping', test: true });
      const rawBody = Buffer.from(payload, 'utf8');

      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(rawBody)
        .digest('hex');

      const isValid = webhookService.verifySignature(rawBody, `sha256=${signature}`);
      expect(isValid).toBe(true);
    });

    it('should return false if payload content has been tampered with', () => {
      const originalPayload = JSON.stringify({ action: 'ping', test: true });
      const tamperedPayload = JSON.stringify({ action: 'ping', test: false });

      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(Buffer.from(originalPayload, 'utf8'))
        .digest('hex');

      const isValid = webhookService.verifySignature(
        Buffer.from(tamperedPayload, 'utf8'),
        `sha256=${signature}`,
      );
      expect(isValid).toBe(false);
    });

    it('should return false if signature format is invalid or missing sha256= prefix', () => {
      const rawBody = Buffer.from('hello', 'utf8');
      const signature = crypto.createHmac('sha256', testSecret).update(rawBody).digest('hex');

      expect(webhookService.verifySignature(rawBody, signature)).toBe(false);
      expect(webhookService.verifySignature(rawBody, undefined)).toBe(false);
    });

    it('should return false if webhook secret is not configured', () => {
      mockConfig.webhookSecret = undefined;
      const rawBody = Buffer.from('test', 'utf8');
      expect(webhookService.verifySignature(rawBody, 'sha256=abcdef')).toBe(false);
    });
  });

  describe('Idempotency & Event Processing', () => {
    it('should process ping webhook and record delivery', async () => {
      const rawBody = JSON.stringify({ zen: 'Keep it logically awesome.' });
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;
      const deliveryId = 'deliv-uuid-001';

      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'ping',
        'x-hub-signature-256': signature,
      };

      const res = await webhookService.processWebhook(headers, rawBody, JSON.parse(rawBody));

      expect(res.received).toBe(true);
      expect(res.handled).toBe(true);
      expect(res.deliveryId).toBe(deliveryId);

      const record = deliveries.get(deliveryId);
      expect(record).toBeDefined();
      expect(record.status).toBe('processed');
      expect(record.event).toBe('ping');
    });

    it('should detect duplicate delivery and return duplicate: true without re-executing', async () => {
      const deliveryId = 'deliv-uuid-dup';
      deliveries.set(deliveryId, {
        githubDeliveryId: deliveryId,
        status: 'processed',
        event: 'ping',
      });

      const rawBody = JSON.stringify({ action: 'ping' });
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'ping',
        'x-hub-signature-256': signature,
      };

      const res = await webhookService.processWebhook(headers, rawBody, { action: 'ping' });

      expect(res.received).toBe(true);
      expect(res.duplicate).toBe(true);
      expect(res.handled).toBe(true);
    });

    it('should reject duplicate delivery ID if HMAC signature is invalid', async () => {
      const deliveryId = 'deliv-uuid-dup-bad-sig';
      deliveries.set(deliveryId, {
        githubDeliveryId: deliveryId,
        status: 'processed',
        event: 'ping',
      });

      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'ping',
        'x-hub-signature-256': 'sha256=invalidhash0000000000000000000000000000000000000000000000000000',
      };

      await expect(webhookService.processWebhook(headers, 'body', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject webhook processing when webhook secret is not configured', async () => {
      mockConfig.webhookSecret = undefined;

      const headers = {
        'x-github-delivery': 'deliv-no-secret',
        'x-github-event': 'ping',
        'x-hub-signature-256': 'sha256=anyhash',
      };

      await expect(webhookService.processWebhook(headers, 'body', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject webhook with invalid signature when secret is configured', async () => {
      const headers = {
        'x-github-delivery': 'deliv-fail',
        'x-github-event': 'ping',
        'x-hub-signature-256': 'sha256=invalidhash0000000000000000000000000000000000000000000000000000',
      };

      await expect(webhookService.processWebhook(headers, 'badbody', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should create zero DB delivery rows when HMAC signature is invalid', async () => {
      const deliveryId = 'deliv-zero-row-test';
      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'ping',
        'x-hub-signature-256': 'sha256=invalidhex00000000000000000000000000000000000000000000000000000000',
      };

      await expect(webhookService.processWebhook(headers, 'body', {})).rejects.toThrow(
        UnauthorizedException,
      );

      expect(deliveries.has(deliveryId)).toBe(false);
      expect(deliveries.size).toBe(0);
    });

    it('should handle true concurrent deliveries via Promise.all with exactly one winner claiming delivery and zero duplicate side effects', async () => {
      const deliveryId = 'deliv-uuid-concurrent-race';
      const payload = {
        action: 'deleted',
        installation: { id: 777 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      installations.set('777', {
        id: 'db-inst-777',
        githubInstallationId: '777',
        status: 'ACTIVE',
        organizationId: 'org-race',
      });

      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      // Execute concurrent requests simultaneously
      const [res1, res2] = await Promise.all([
        webhookService.processWebhook(headers, rawBody, payload),
        webhookService.processWebhook(headers, rawBody, payload),
      ]);

      // Exactly one must be the primary handler and one must be marked duplicate
      const winners = [res1, res2].filter((r) => !r.duplicate && r.handled);
      const duplicates = [res1, res2].filter((r) => r.duplicate);

      expect(winners).toHaveLength(1);
      expect(duplicates).toHaveLength(1);

      // Verify token eviction / business side-effect was called exactly once
      expect(mockInstallationService.evictInstallationToken).toHaveBeenCalledTimes(1);
      expect(mockInstallationService.evictInstallationToken).toHaveBeenCalledWith('777');

      // Exactly one row exists in deliveries table
      expect(deliveries.size).toBe(1);
      const row = deliveries.get(deliveryId);
      expect(row).toBeDefined();
      expect(row.status).toBe('processed');
    });

    it('should record failed status and failureCode when event handler throws without deleting delivery row', async () => {
      const deliveryId = 'deliv-fail-handler';
      const payload = {
        action: 'deleted',
        installation: { id: 999 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      // Simulate a business handler failure by making mockDb throw during handleInstallationEvent
      mockDb.client.$transaction.mockRejectedValueOnce(new Error('Database lock acquisition timeout'));

      installations.set('999', {
        id: 'db-inst-999',
        githubInstallationId: '999',
        status: 'ACTIVE',
        organizationId: 'org-fail',
      });

      const headers = {
        'x-github-delivery': deliveryId,
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      await expect(webhookService.processWebhook(headers, rawBody, payload)).rejects.toThrow(
        'Database lock acquisition timeout',
      );

      const record = deliveries.get(deliveryId);
      expect(record).toBeDefined();
      expect(record.status).toBe('failed');
      expect(record.failureCode).toContain('Database lock acquisition timeout');
    });

    it('should handle installation deleted event by marking installation DELETED and repos unavailable while preserving connected', async () => {
      const instId = '888';
      installations.set(instId, {
        id: 'db-inst-1',
        githubInstallationId: instId,
        status: 'ACTIVE',
        organizationId: 'org-1',
      });

      repos.set('org-1:1001', {
        id: 'repo-1',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      const payload = {
        action: 'deleted',
        installation: { id: 888 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-delete-1',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      const updatedInst = installations.get(instId);
      expect(updatedInst.status).toBe('DELETED');
      expect(mockInstallationService.evictInstallationToken).toHaveBeenCalledWith(instId);

      const updatedRepo = repos.get('org-1:1001');
      expect(updatedRepo.available).toBe(false);
      expect(updatedRepo.connected).toBe(true);
    });

    it('should handle installation suspend event by marking installation SUSPENDED, repos unavailable while preserving connected, and evicting token', async () => {
      const instId = '888';
      installations.set(instId, {
        id: 'db-inst-1',
        githubInstallationId: instId,
        status: 'ACTIVE',
        organizationId: 'org-1',
      });

      repos.set('org-1:1001', {
        id: 'repo-1',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      const payload = {
        action: 'suspend',
        installation: { id: 888 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-suspend-1',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      const updatedInst = installations.get(instId);
      expect(updatedInst.status).toBe('SUSPENDED');
      expect(updatedInst.suspendedAt).toBeDefined();
      expect(mockInstallationService.evictInstallationToken).toHaveBeenCalledWith(instId);

      const updatedRepo = repos.get('org-1:1001');
      expect(updatedRepo.available).toBe(false);
      expect(updatedRepo.connected).toBe(true);
    });

    it('should handle installation unsuspend event by reactivating installation and authoritatively syncing repositories without blanket resurrection', async () => {
      const instId = '888';
      installations.set(instId, {
        id: 'db-inst-1',
        githubInstallationId: instId,
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        organizationId: 'org-1',
      });

      // Repository A: connected=true, available=false (accessible on GitHub)
      repos.set('org-1:1001', {
        id: 'repo-1',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1001',
        available: false,
        connected: true,
      });

      // Repository B: connected=true, available=false (removed/stale on GitHub)
      repos.set('org-1:1002', {
        id: 'repo-2',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1002',
        available: false,
        connected: true,
      });

      // Authoritative sync returns only Repository A
      mockRepositoryService.syncRepositories.mockImplementationOnce(async (orgId: string) => {
        expect(orgId).toBe('org-1');
        const repoA = repos.get('org-1:1001');
        if (repoA) repoA.available = true;
        return { syncedCount: 1, availableCount: 1, removedCount: 1 };
      });

      const payload = {
        action: 'unsuspend',
        installation: { id: 888 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-unsuspend-auth-1',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      const updatedInst = installations.get(instId);
      expect(updatedInst.status).toBe('ACTIVE');
      expect(updatedInst.suspendedAt).toBeNull();
      expect(mockRepositoryService.syncRepositories).toHaveBeenCalledWith('org-1');

      // Repository A is restored to available: true, connected: true
      const repoA = repos.get('org-1:1001');
      expect(repoA.available).toBe(true);
      expect(repoA.connected).toBe(true);

      // Repository B remains available: false, connected: true (no resurrection of stale repo!)
      const repoB = repos.get('org-1:1002');
      expect(repoB.available).toBe(false);
      expect(repoB.connected).toBe(true);
    });

    it('should keep repositories conservatively unavailable if authoritative sync fails after unsuspend', async () => {
      const instId = '888';
      installations.set(instId, {
        id: 'db-inst-1',
        githubInstallationId: instId,
        status: 'SUSPENDED',
        suspendedAt: new Date(),
        organizationId: 'org-1',
      });

      repos.set('org-1:1001', {
        id: 'repo-1',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1001',
        available: false,
        connected: true,
      });

      // Authoritative sync fails (e.g., GitHub rate limit or network error)
      mockRepositoryService.syncRepositories.mockRejectedValueOnce(
        new Error('GitHub API rate limit exceeded'),
      );

      const payload = {
        action: 'unsuspend',
        installation: { id: 888 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-unsuspend-err-1',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      const res = await webhookService.processWebhook(headers, rawBody, payload);
      expect(res.handled).toBe(true);

      const updatedInst = installations.get(instId);
      expect(updatedInst.status).toBe('ACTIVE');
      expect(updatedInst.suspendedAt).toBeNull();

      // Repository remains conservatively unavailable
      const repoA = repos.get('org-1:1001');
      expect(repoA.available).toBe(false);
      expect(repoA.connected).toBe(true);
    });

    it('should handle installation_repositories removed event safely with malformed entries', async () => {
      const instId = '888';
      installations.set(instId, {
        id: 'db-inst-1',
        githubInstallationId: instId,
        status: 'ACTIVE',
        organizationId: 'org-1',
      });

      repos.set('org-1:1001', {
        id: 'repo-1',
        organizationId: 'org-1',
        githubInstallationId: instId,
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      // Malformed array containing valid ID, empty object, null, bad string, empty id, NaN
      const payload = {
        action: 'removed',
        installation: { id: 888 },
        repositories_removed: [
          { id: 1001, full_name: 'test-org/repo-1' },
          {},
          null,
          'bad',
          { id: '' },
          { id: NaN },
        ],
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-repo-removed-malformed',
        'x-github-event': 'installation_repositories',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      const updatedRepo = repos.get('org-1:1001');
      expect(updatedRepo.available).toBe(false);
      expect(updatedRepo.connected).toBe(true);
      expect(mockDb.client.repositoryConnection.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          githubInstallationId: '888',
          githubRepositoryId: { in: ['1001'] },
        },
        data: expect.objectContaining({ available: false }),
      });
    });

    it('should handle repository deleted event with strict tenant and installation scoping', async () => {
      // Org A repository
      installations.set('inst-A', {
        id: 'db-inst-A',
        githubInstallationId: 'inst-A',
        status: 'ACTIVE',
        organizationId: 'org-A',
      });

      repos.set('org-A:1001', {
        id: 'repo-A',
        organizationId: 'org-A',
        githubInstallationId: 'inst-A',
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      // Org B repository with same GitHub repo ID
      installations.set('inst-B', {
        id: 'db-inst-B',
        githubInstallationId: 'inst-B',
        status: 'ACTIVE',
        organizationId: 'org-B',
      });

      repos.set('org-B:1001', {
        id: 'repo-B',
        organizationId: 'org-B',
        githubInstallationId: 'inst-B',
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      // Webhook payload belongs to Org A's installation
      const payload = {
        action: 'deleted',
        installation: { id: 'inst-A' },
        repository: { id: 1001, full_name: 'test-org/repo-1' },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-repo-deleted-scoped',
        'x-github-event': 'repository',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      // Org A's repo is marked unavailable
      const repoA = repos.get('org-A:1001');
      expect(repoA.available).toBe(false);
      expect(repoA.connected).toBe(true);

      // Org B's repo remains UNTOUCHED (cross-tenant safety proof)
      const repoB = repos.get('org-B:1001');
      expect(repoB.available).toBe(true);
      expect(repoB.connected).toBe(true);

      // Verify Prisma where clause explicitly scoped to tenant and installation
      expect(mockDb.client.repositoryConnection.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-A',
          githubInstallationId: 'inst-A',
          githubRepositoryId: '1001',
        },
        data: expect.objectContaining({ available: false }),
      });
    });

    it('should ignore repository event if installation is unbound or unknown', async () => {
      repos.set('org-A:1001', {
        id: 'repo-A',
        organizationId: 'org-A',
        githubInstallationId: 'inst-A',
        githubRepositoryId: '1001',
        available: true,
        connected: true,
      });

      const payload = {
        action: 'deleted',
        installation: { id: 'inst-unknown' },
        repository: { id: 1001, full_name: 'test-org/repo-1' },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-repo-deleted-unknown-inst',
        'x-github-event': 'repository',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      const repoA = repos.get('org-A:1001');
      expect(repoA.available).toBe(true);
      expect(mockDb.client.repositoryConnection.updateMany).not.toHaveBeenCalled();
    });

    it('should NOT auto-bind an unknown installation created event without preceding state', async () => {
      const unknownInstId = 'inst-999';
      const payload = {
        action: 'created',
        installation: { id: 999 },
      };
      const rawBody = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', testSecret).update(Buffer.from(rawBody)).digest('hex')}`;

      const headers = {
        'x-github-delivery': 'deliv-create-unbound',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      };

      await webhookService.processWebhook(headers, rawBody, payload);

      // Should not have created any bound installation record
      expect(installations.has(unknownInstId)).toBe(false);
    });
  });
});
