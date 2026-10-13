import { ChangeOrchestratorService } from './change-orchestrator.service';
import { DatabaseService } from '../../database/database.service';
import { ChangeQueueService } from '../queue/change-queue.service';
import { GithubPullRequestService } from './github-pull-request.service';
import { ChangedFileService } from './changed-file.service';
import { SnapshotAlignmentService } from './snapshot-alignment.service';
import { TwinChangeMapperService } from './twin-change-mapper.service';
import { DependencyDeltaService } from './dependency-delta.service';

describe('ChangeOrchestratorService', () => {
  let service: ChangeOrchestratorService;
  let mockDb: any;
  let mockQueue: any;
  let mockPrService: any;
  let mockFileService: any;
  let mockSnapshotService: any;
  let mockMapperService: any;
  let mockDeltaService: any;

  beforeEach(() => {
    mockDb = {
      client: {
        repositoryConnection: {
          findFirst: jest.fn(),
        },
        changeSet: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
          upsert: jest.fn(),
        },
        changeRevision: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      },
    };

    mockQueue = {
      enqueue: jest.fn(),
      enqueueWithDelay: jest.fn(),
    };

    mockPrService = {
      fetchPullRequestAndFiles: jest.fn(),
    };

    mockFileService = {
      processFiles: jest.fn(),
    };

    mockSnapshotService = {
      alignSnapshots: jest.fn(),
    };

    mockMapperService = {
      mapTwinChanges: jest.fn(),
    };

    mockDeltaService = {
      computeDependencyDeltas: jest.fn(),
    };

    service = new ChangeOrchestratorService(
      mockDb as DatabaseService,
      mockQueue as ChangeQueueService,
      mockPrService as GithubPullRequestService,
      mockFileService as ChangedFileService,
      mockSnapshotService as SnapshotAlignmentService,
      mockMapperService as TwinChangeMapperService,
      mockDeltaService as DependencyDeltaService,
    );
  });

  describe('handlePullRequestWebhook', () => {
    it('ignores non-pull_request events', async () => {
      const result = await service.handlePullRequestWebhook('push', {});
      expect(result.ignored).toBe(true);
    });

    it('ignores non-tracked actions like labeled', async () => {
      const result = await service.handlePullRequestWebhook('pull_request', { action: 'labeled' });
      expect(result.ignored).toBe(true);
    });

    it('handles closed action and marks change set closed', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValueOnce({
        id: 'repo-1',
        organizationId: 'org-1',
      });

      const payload = {
        action: 'closed',
        repository: { id: 12345 },
        pull_request: {
          number: 10,
          merged: true,
          base: { sha: 'b-sha' },
          head: { sha: 'h-sha' },
        },
      };

      const result = await service.handlePullRequestWebhook('pull_request', payload);
      expect(result.handled).toBe(true);
      expect(result.action).toBe('closed');
      expect(result.isMerged).toBe(true);
      expect(mockDb.client.changeSet.updateMany).toHaveBeenCalledWith({
        where: {
          repositoryConnectionId: 'repo-1',
          pullRequestNumber: 10,
        },
        data: {
          state: 'closed',
          isMerged: true,
          currentBaseSha: 'b-sha',
          currentHeadSha: 'h-sha',
        },
      });
    });

    it('handles concurrent webhook deliveries gracefully recovering from P2002 conflict', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
      });

      const p2002Error = new Error('Unique constraint failed');
      (p2002Error as any).code = 'P2002';

      // First findUnique returns null
      mockDb.client.changeSet.findUnique
        .mockResolvedValueOnce(null)
        // second findUnique after P2002 returns the existing changeSet created by competitor
        .mockResolvedValueOnce({
          id: 'cs-winner',
          organizationId: 'org-1',
          repositoryConnectionId: 'repo-1',
          pullRequestNumber: 15,
        });

      mockDb.client.changeSet.create.mockRejectedValueOnce(p2002Error);

      // revision creation
      mockDb.client.changeRevision.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'rev-winner',
          status: 'QUEUED',
        });
      mockDb.client.changeRevision.create.mockRejectedValueOnce(p2002Error);

      const payload = {
        action: 'opened',
        repository: { id: 99999 },
        pull_request: {
          number: 15,
          title: 'Test PR',
          user: { login: 'octocat' },
          base: { ref: 'main', sha: 'b-1' },
          head: { ref: 'feat', sha: 'h-1' },
        },
      };

      const result = await service.handlePullRequestWebhook('pull_request', payload);
      expect(result.handled).toBe(true);
      expect(result.changeSetId).toBe('cs-winner');
      expect(result.revisionId).toBe('rev-winner');
      expect(mockQueue.enqueue).toHaveBeenCalledWith('rev-winner');
    });

    it('handles two simultaneous webhook requests for the same PR with Promise.all', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
      });

      const p2002Error = new Error('Unique constraint failed');
      (p2002Error as any).code = 'P2002';

      mockDb.client.changeSet.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'cs-concurrent',
          organizationId: 'org-1',
          repositoryConnectionId: 'repo-1',
          pullRequestNumber: 20,
        });

      mockDb.client.changeSet.create
        .mockResolvedValueOnce({
          id: 'cs-concurrent',
          organizationId: 'org-1',
          repositoryConnectionId: 'repo-1',
          pullRequestNumber: 20,
        })
        .mockRejectedValueOnce(p2002Error);

      mockDb.client.changeRevision.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'rev-concurrent', status: 'QUEUED' });

      mockDb.client.changeRevision.create
        .mockResolvedValueOnce({ id: 'rev-concurrent', status: 'QUEUED' })
        .mockRejectedValueOnce(p2002Error);

      const payload = {
        action: 'opened',
        repository: { id: 99999 },
        pull_request: {
          number: 20,
          title: 'Concurrent PR',
          user: { login: 'octocat' },
          base: { ref: 'main', sha: 'b-base' },
          head: { ref: 'feat', sha: 'h-head' },
        },
      };

      const [res1, res2] = await Promise.all([
        service.handlePullRequestWebhook('pull_request', payload),
        service.handlePullRequestWebhook('pull_request', payload),
      ]);

      expect(res1.handled).toBe(true);
      expect(res2.handled).toBe(true);
      expect(res1.changeSetId).toBe('cs-concurrent');
      expect(res2.changeSetId).toBe('cs-concurrent');
      expect(mockQueue.enqueue).toHaveBeenCalledWith('rev-concurrent');
    });

    it('prevents stale out-of-order synchronize webhook from regressing ChangeSet.currentHeadSha', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
      });

      const existingChangeSet = {
        id: 'cs-stale-test',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        pullRequestNumber: 30,
        currentBaseSha: 'b-sha',
        currentHeadSha: 'head-sha-B',
        updatedAt: new Date('2026-10-11T12:00:00Z'),
      };

      mockDb.client.changeSet.findUnique.mockResolvedValue(existingChangeSet);

      const stalePayload = {
        action: 'synchronize',
        repository: { id: 99999 },
        pull_request: {
          number: 30,
          title: 'PR Title',
          user: { login: 'octocat' },
          base: { ref: 'main', sha: 'b-sha' },
          head: { ref: 'feat', sha: 'head-sha-A' },
          updated_at: '2026-10-11T11:00:00Z',
        },
      };

      mockDb.client.changeRevision.findUnique.mockResolvedValue({
        id: 'rev-sha-A',
        status: 'SUCCEEDED',
      });

      const result = await service.handlePullRequestWebhook('pull_request', stalePayload);
      expect(result.handled).toBe(true);

      expect(mockDb.client.changeSet.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentHeadSha: 'head-sha-A' }),
        }),
      );
    });
  });

  describe('syncPullRequest (manual sync trust boundary)', () => {
    it('syncPullRequest derives trusted metadata from authenticated GitHub API and ignores untrusted inputs', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'org/repo',
        name: 'repo',
        ownerLogin: 'org',
        connected: true,
        installation: {
          githubInstallationId: 'inst-1',
          status: 'ACTIVE',
        },
      });

      mockPrService.fetchPullRequestAndFiles.mockResolvedValue({
        pullRequest: {
          number: 42,
          title: 'Trusted Title From GitHub',
          body: 'Trusted Body',
          state: 'open',
          merged: false,
          baseRef: 'main',
          baseSha: 'trusted-base-sha',
          headRef: 'feat',
          headSha: 'trusted-head-sha',
          authorUsername: 'trusted-author',
          additions: 10,
          deletions: 2,
          changedFilesCount: 1,
        },
        files: [],
      });

      mockDb.client.changeSet.upsert.mockResolvedValue({
        id: 'cs-trusted',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        pullRequestNumber: 42,
        title: 'Trusted Title From GitHub',
        authorLogin: 'trusted-author',
        baseRef: 'main',
        headRef: 'feat',
        currentBaseSha: 'trusted-base-sha',
        currentHeadSha: 'trusted-head-sha',
        state: 'open',
        isDraft: false,
        isMerged: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockDb.client.changeRevision.findUnique.mockResolvedValue(null);
      mockDb.client.changeRevision.create.mockResolvedValue({
        id: 'rev-trusted',
        status: 'QUEUED',
        stage: 'QUEUED',
        createdAt: new Date(),
        updatedAt: new Date(),
        queuedAt: new Date(),
        baseSha: 'trusted-base-sha',
        headSha: 'trusted-head-sha',
      });

      const res = await service.syncPullRequest('org-1', 'repo-1', 42);

      expect(mockPrService.fetchPullRequestAndFiles).toHaveBeenCalledWith({
        githubInstallationId: 'inst-1',
        owner: 'org',
        repo: 'repo',
        pullNumber: 42,
      });

      expect(res.currentBaseSha).toBe('trusted-base-sha');
      expect(res.currentHeadSha).toBe('trusted-head-sha');
      expect(res.authorLogin).toBe('trusted-author');
      expect(mockQueue.enqueue).toHaveBeenCalledWith('rev-trusted');
    });
  });
});
