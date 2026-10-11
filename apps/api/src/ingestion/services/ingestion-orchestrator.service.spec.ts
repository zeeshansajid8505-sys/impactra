import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IngestionOrchestratorService } from './ingestion-orchestrator.service';

describe('IngestionOrchestratorService', () => {
  let service: IngestionOrchestratorService;
  let mockDb: any;
  let mockStorage: any;
  let mockQueue: any;
  let mockSourceProvider: any;
  let mockTarReader: any;
  let mockFileClassifier: any;
  let mockManifestParser: any;
  let mockImportParser: any;
  let mockTwinBuilder: any;

  beforeEach(() => {
    mockDb = {
      client: {
        repositoryConnection: {
          findFirst: jest.fn(),
        },
        repositoryIngestion: {
          create: jest.fn(),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          findMany: jest.fn(),
          count: jest.fn(),
          update: jest.fn(),
        },
        repositorySnapshot: {
          findFirst: jest.fn(),
          upsert: jest.fn(),
        },
        repositoryFileInventory: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
        },
        digitalTwinSnapshot: {
          findFirst: jest.fn(),
          deleteMany: jest.fn(),
          create: jest.fn(),
        },
        digitalTwinNode: {
          findMany: jest.fn(),
          createMany: jest.fn(),
          count: jest.fn(),
        },
        digitalTwinEdge: {
          createMany: jest.fn(),
          count: jest.fn(),
        },
        $transaction: jest.fn((callback) => callback(mockDb.client)),
      },
    };

    mockStorage = {
      putObject: jest.fn().mockResolvedValue({ key: 'test-key', sha256: 'test-sha', byteSize: 100 }),
    };

    mockQueue = {
      registerHandler: jest.fn(),
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    mockSourceProvider = {
      fetchSourceArchive: jest.fn(),
    };

    mockTarReader = {
      extract: jest.fn(),
    };

    mockFileClassifier = {
      classify: jest.fn().mockReturnValue({ language: 'TypeScript', category: 'SOURCE_CODE', isBinary: false }),
    };

    mockManifestParser = {
      parse: jest.fn().mockReturnValue({
        isMonorepo: false,
        workspacePackages: [],
        workspaceLinks: [],
        externalDependencies: [],
      }),
    };

    mockImportParser = {
      parseImports: jest.fn().mockReturnValue([]),
    };

    mockTwinBuilder = {
      buildGraph: jest.fn().mockReturnValue({
        nodes: [{ stableKey: 'repo:r1', type: 'REPOSITORY', name: 'org/repo', path: null, metadata: {} }],
        edges: [],
        nodeCount: 1,
        edgeCount: 0,
        nodesByType: { REPOSITORY: 1 },
        edgesByType: {},
      }),
    };

    service = new IngestionOrchestratorService(
      mockDb,
      mockStorage,
      mockQueue,
      mockSourceProvider,
      mockTarReader,
      mockFileClassifier,
      mockManifestParser,
      mockImportParser,
      mockTwinBuilder,
    );
  });

  describe('triggerIngestion', () => {
    it('successfully triggers ingestion and enqueues job', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: true,
        available: true,
        defaultBranch: 'main',
      });

      // No active ingestion
      mockDb.client.repositoryIngestion.findFirst.mockResolvedValue(null);

      mockDb.client.repositoryIngestion.create.mockResolvedValue({
        id: 'ing-1',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        requestedByUserId: 'user-1',
        targetRef: 'main',
        commitSha: null,
        status: 'QUEUED',
        stage: 'QUEUED',
        startedAt: null,
        completedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.triggerIngestion('org-1', 'repo-1', 'user-1', {});

      expect(res.id).toBe('ing-1');
      expect(res.status).toBe('QUEUED');
      expect(mockQueue.enqueue).toHaveBeenCalledWith('ing-1');
    });

    it('rejects trigger with 409 Conflict when an ingestion is already running', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: true,
        available: true,
        defaultBranch: 'main',
      });

      mockDb.client.repositoryIngestion.findFirst.mockResolvedValue({
        id: 'active-ing-1',
        status: 'FETCHING',
      });

      await expect(
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
      ).rejects.toThrow(ConflictException);

      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('rejects trigger with 400 BadRequest when repository is not connected', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: false,
        available: true,
      });

      await expect(
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects trigger with 400 BadRequest when repository is unavailable in GitHub installation', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: true,
        available: false,
      });

      await expect(
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects trigger with 400 BadRequest when GitHub installation is suspended or deleted', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: true,
        available: true,
        installation: {
          status: 'SUSPENDED',
        },
      });

      await expect(
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects trigger with 404 NotFound when repository does not exist in tenant', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue(null);

      await expect(
        service.triggerIngestion('org-1', 'repo-unknown', 'user-1', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processIngestion', () => {
    it('executes full pipeline and updates status to SUCCEEDED', async () => {
      const now = new Date();
      mockDb.client.repositoryIngestion.findUnique.mockResolvedValue({
        id: 'ing-1',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        targetRef: 'main',
        status: 'QUEUED',
        repositoryConnection: {
          id: 'repo-1',
          fullName: 'impactra/test',
          defaultBranch: 'main',
        },
      });

      mockSourceProvider.fetchSourceArchive.mockResolvedValue({
        archiveBuffer: Buffer.from('mock-tar'),
        commitSha: '97640defa1234567890abcdef1234567890abcde',
        ref: 'main',
        sourceProvider: 'fixture',
      });

      mockTarReader.extract.mockReturnValue({
        files: [
          {
            path: 'index.ts',
            byteSize: 50,
            content: Buffer.from('export const a = 1;'),
            contentSha256: 'sha1',
          },
        ],
        fileCount: 1,
        sourceBytes: 50,
        archiveSha256: 'archive-sha',
        archiveByteSize: 100,
      });

      mockDb.client.repositorySnapshot.upsert.mockResolvedValue({ id: 'snap-1' });
      mockDb.client.digitalTwinSnapshot.create.mockResolvedValue({ id: 'twin-1' });
      mockDb.client.digitalTwinNode.findMany.mockResolvedValue([
        { id: 'node-1', stableKey: 'repo:r1' },
      ]);

      await service.processIngestion('ing-1');

      // Verify MinIO upload
      expect(mockStorage.putObject).toHaveBeenCalled();

      // Verify status transitions to SUCCEEDED
      expect(mockDb.client.repositoryIngestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ing-1' },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            stage: 'COMPLETED',
          }),
        }),
      );
    });

    it('marks ingestion as FAILED with sanitized error message on pipeline failure', async () => {
      mockDb.client.repositoryIngestion.findUnique.mockResolvedValue({
        id: 'ing-fail-1',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        targetRef: 'main',
        status: 'QUEUED',
        repositoryConnection: {
          id: 'repo-1',
          fullName: 'impactra/test',
          defaultBranch: 'main',
        },
      });

      mockSourceProvider.fetchSourceArchive.mockRejectedValue(
        new Error('Failed to download archive ghp_SecretGitHubToken12345'),
      );

      await service.processIngestion('ing-fail-1');

      expect(mockDb.client.repositoryIngestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ing-fail-1' },
          data: expect.objectContaining({
            status: 'FAILED',
            stage: 'FAILED',
            failureMessage: expect.not.stringContaining('ghp_SecretGitHubToken12345'),
          }),
        }),
      );
    });

    it('cleans up MinIO storage artifact if database transaction fails', async () => {
      mockDb.client.repositoryIngestion.findUnique.mockResolvedValue({
        id: 'ing-tx-fail',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        targetRef: 'main',
        status: 'QUEUED',
        repositoryConnection: {
          id: 'repo-1',
          fullName: 'impactra/test',
          defaultBranch: 'main',
        },
      });

      mockSourceProvider.fetchSourceArchive.mockResolvedValue({
        archiveBuffer: Buffer.from('mock-tar'),
        commitSha: '97640defa1234567890abcdef1234567890abcde',
        ref: 'main',
        sourceProvider: 'fixture',
      });

      mockTarReader.extract.mockReturnValue({
        files: [],
        fileCount: 0,
        sourceBytes: 0,
        archiveSha256: 'archive-sha',
        archiveByteSize: 100,
      });

      mockStorage.deleteObject = jest.fn().mockResolvedValue(undefined);
      mockDb.client.$transaction.mockRejectedValue(new Error('DB transaction deadlock'));

      await service.processIngestion('ing-tx-fail');

      expect(mockStorage.putObject).toHaveBeenCalled();
      expect(mockStorage.deleteObject).toHaveBeenCalledWith(
        expect.stringContaining('organizations/org-1/repositories/repo-1/snapshots/ing-tx-fail/source.tar.gz'),
      );
      expect(mockDb.client.repositoryIngestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ing-tx-fail' },
          data: expect.objectContaining({
            status: 'FAILED',
            stage: 'FAILED',
          }),
        }),
      );
    });
  });

  describe('concurrency and race conditions', () => {
    it('handles concurrent trigger requests with Promise.all and database unique constraint conflict (P2002)', async () => {
      mockDb.client.repositoryConnection.findFirst.mockResolvedValue({
        id: 'repo-1',
        organizationId: 'org-1',
        fullName: 'impactra/test',
        connected: true,
        available: true,
        defaultBranch: 'main',
      });

      // Both pass the in-memory findFirst activeIngestion check
      mockDb.client.repositoryIngestion.findFirst.mockResolvedValue(null);

      let callCount = 0;
      mockDb.client.repositoryIngestion.create.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            id: 'ing-win',
            organizationId: 'org-1',
            repositoryConnectionId: 'repo-1',
            targetRef: 'main',
            status: 'QUEUED',
            stage: 'QUEUED',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else {
          const p2002Err: any = new Error('Unique constraint failed on repository_connection_id');
          p2002Err.code = 'P2002';
          return Promise.reject(p2002Err);
        }
      });

      const results = await Promise.allSettled([
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
        service.triggerIngestion('org-1', 'repo-1', 'user-1', {}),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect((fulfilled[0] as PromiseFulfilledResult<any>).value.id).toBe('ing-win');

      expect(rejected).toHaveLength(1);
      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionReason).toBeInstanceOf(ConflictException);
      expect(rejectionReason.getStatus()).toBe(409);
    });
  });

  describe('snapshot publication safety', () => {
    it('getLatestSnapshot queries only SUCCEEDED ingestions and throws 404 when none exist', async () => {
      mockDb.client.repositorySnapshot.findFirst.mockImplementation(({ where }: any) => {
        expect(where.ingestion).toEqual({ status: 'SUCCEEDED' });
        return Promise.resolve(null);
      });

      await expect(
        service.getLatestSnapshot('org-1', 'repo-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('getLatestDigitalTwin queries only SUCCEEDED ingestions and throws 404 when none exist', async () => {
      mockDb.client.digitalTwinSnapshot.findFirst.mockImplementation(({ where }: any) => {
        expect(where.repositorySnapshot.ingestion).toEqual({ status: 'SUCCEEDED' });
        return Promise.resolve(null);
      });

      await expect(
        service.getLatestDigitalTwin('org-1', 'repo-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns previous successful snapshot A even when newer ingestion B is queued or failed', async () => {
      const snapA = {
        id: 'snap-A',
        organizationId: 'org-1',
        repositoryConnectionId: 'repo-1',
        ingestionId: 'ing-A-succeeded',
        commitSha: 'commit-A-sha',
        ref: 'main',
        sourceProvider: 'github',
        parserVersion: 'digital-twin-parser-v1',
        artifactKey: 'k-A',
        artifactSha256: 'sha-A',
        sourceBytes: 100,
        fileCount: 5,
        createdAt: new Date('2026-09-20T10:00:00Z'),
        fileInventories: [],
      };

      mockDb.client.repositorySnapshot.findFirst.mockImplementation(({ where }: any) => {
        if (where.ingestion?.status === 'SUCCEEDED') {
          return Promise.resolve(snapA);
        }
        return Promise.resolve(null);
      });

      const res = await service.getLatestSnapshot('org-1', 'repo-1');
      expect(res.id).toBe('snap-A');
      expect(res.commitSha).toBe('commit-A-sha');
    });
  });

  describe('restart / duplicate BullMQ processing safety', () => {
    it('safely skips processing if ingestion is already SUCCEEDED', async () => {
      mockDb.client.repositoryIngestion.findUnique.mockResolvedValue({
        id: 'ing-already-done',
        status: 'SUCCEEDED',
      });

      await service.processIngestion('ing-already-done');

      expect(mockSourceProvider.fetchSourceArchive).not.toHaveBeenCalled();
      expect(mockStorage.putObject).not.toHaveBeenCalled();
      expect(mockDb.client.repositoryIngestion.update).not.toHaveBeenCalled();
    });

    it('safely skips processing if ingestion is already FAILED', async () => {
      mockDb.client.repositoryIngestion.findUnique.mockResolvedValue({
        id: 'ing-already-failed',
        status: 'FAILED',
      });

      await service.processIngestion('ing-already-failed');

      expect(mockSourceProvider.fetchSourceArchive).not.toHaveBeenCalled();
      expect(mockStorage.putObject).not.toHaveBeenCalled();
      expect(mockDb.client.repositoryIngestion.update).not.toHaveBeenCalled();
    });
  });
});
