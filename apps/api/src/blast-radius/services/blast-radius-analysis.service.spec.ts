import { BlastRadiusAnalysisService } from './blast-radius-analysis.service';
import { DatabaseService } from '../../database/database.service';
import { BlastRadiusQueueService } from '../queue/blast-radius-queue.service';
import { BlastRadiusTraversalService } from './blast-radius-traversal.service';
import { BlastRadiusPersistenceService } from './blast-radius-persistence.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BlastRadiusAnalysisStatus } from '@impactra/shared';
import { DigitalTwinNodeType } from '@impactra/database';

describe('BlastRadiusAnalysisService', () => {
  let service: BlastRadiusAnalysisService;
  let mockDb: any;
  let mockQueue: any;
  let mockTraversal: any;
  let mockPersistence: any;

  beforeEach(() => {
    mockDb = {
      client: {
        changeSet: {
          findFirst: jest.fn(),
        },
        blastRadiusAnalysis: {
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        digitalTwinSnapshot: {
          findUnique: jest.fn(),
        },
      },
    };

    mockQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    mockTraversal = {
      traverse: jest.fn(),
    };

    mockPersistence = {
      getAnalysisById: jest.fn(),
      deriveRoots: jest.fn(),
      loadDigitalTwinGraph: jest.fn(),
      persistAnalysisResult: jest.fn(),
      getLatestSummary: jest.fn(),
      getFindingById: jest.fn(),
      listFindings: jest.fn(),
      listEvidencePaths: jest.fn(),
      listAnalyses: jest.fn(),
    };

    service = new BlastRadiusAnalysisService(
      mockDb as DatabaseService,
      mockQueue as BlastRadiusQueueService,
      mockTraversal as BlastRadiusTraversalService,
      mockPersistence as BlastRadiusPersistenceService,
    );
  });

  describe('triggerAnalysis', () => {
    const orgId = 'org-1';
    const csId = 'cs-1';

    it('throws NotFoundException if changeSet does not exist', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce(null);

      await expect(service.triggerAnalysis(orgId, csId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if changeSet has no revisions', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce({
        id: csId,
        organizationId: orgId,
        revisions: [],
      });

      await expect(service.triggerAnalysis(orgId, csId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if latest revision is not SUCCEEDED', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce({
        id: csId,
        organizationId: orgId,
        revisions: [{ id: 'rev-1', status: 'RUNNING' }],
      });

      await expect(service.triggerAnalysis(orgId, csId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns existing SUCCEEDED analysis if force=false (idempotent)', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce({
        id: csId,
        organizationId: orgId,
        revisions: [{ id: 'rev-1', status: 'SUCCEEDED' }],
      });

      mockDb.client.blastRadiusAnalysis.findUnique.mockResolvedValueOnce({
        id: 'analysis-1',
        status: 'SUCCEEDED',
      });

      mockPersistence.getAnalysisById.mockResolvedValueOnce({
        id: 'analysis-1',
        status: BlastRadiusAnalysisStatus.SUCCEEDED,
      });

      const result = await service.triggerAnalysis(orgId, csId, false);

      expect(result.id).toBe('analysis-1');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues and creates new analysis if none exists', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce({
        id: csId,
        organizationId: orgId,
        revisions: [{ id: 'rev-1', status: 'SUCCEEDED' }],
      });

      mockDb.client.blastRadiusAnalysis.findUnique.mockResolvedValueOnce(null);

      mockDb.client.blastRadiusAnalysis.create.mockResolvedValueOnce({
        id: 'new-analysis-1',
        status: 'QUEUED',
      });

      mockPersistence.getAnalysisById.mockResolvedValueOnce({
        id: 'new-analysis-1',
        status: BlastRadiusAnalysisStatus.QUEUED,
      });

      const result = await service.triggerAnalysis(orgId, csId, false);

      expect(mockDb.client.blastRadiusAnalysis.create).toHaveBeenCalled();
      expect(mockQueue.enqueue).toHaveBeenCalledWith('new-analysis-1');
      expect(result.id).toBe('new-analysis-1');
    });

    it('resets and enqueues existing analysis if force=true', async () => {
      mockDb.client.changeSet.findFirst.mockResolvedValueOnce({
        id: csId,
        organizationId: orgId,
        revisions: [{ id: 'rev-1', status: 'SUCCEEDED' }],
      });

      mockDb.client.blastRadiusAnalysis.findUnique.mockResolvedValueOnce({
        id: 'analysis-1',
        status: 'SUCCEEDED',
      });

      mockDb.client.blastRadiusAnalysis.update.mockResolvedValueOnce({
        id: 'analysis-1',
        status: 'QUEUED',
      });

      mockPersistence.getAnalysisById.mockResolvedValueOnce({
        id: 'analysis-1',
        status: BlastRadiusAnalysisStatus.QUEUED,
      });

      const result = await service.triggerAnalysis(orgId, csId, true);

      expect(mockDb.client.blastRadiusAnalysis.update).toHaveBeenCalled();
      expect(mockQueue.enqueue).toHaveBeenCalledWith('analysis-1');
      expect(result.id).toBe('analysis-1');
    });
  });

  describe('executeAnalysis', () => {
    it('executes analysis and marks SUCCEEDED', async () => {
      const mockRecord = {
        id: 'analysis-1',
        organizationId: 'org-1',
        changeSetId: 'cs-1',
        changeRevisionId: 'rev-1',
        status: 'QUEUED',
        changeRevision: {
          id: 'rev-1',
          status: 'SUCCEEDED',
          baseSnapshotId: 'base-snap',
          headSnapshotId: 'head-snap',
        },
      };

      mockDb.client.blastRadiusAnalysis.findUnique.mockResolvedValueOnce(mockRecord);
      mockDb.client.blastRadiusAnalysis.update.mockResolvedValue({});
      mockDb.client.digitalTwinSnapshot.findUnique
        .mockResolvedValueOnce({ id: 'twin-base-1' })
        .mockResolvedValueOnce({ id: 'twin-head-1' });

      mockPersistence.deriveRoots.mockResolvedValueOnce([
        {
          stableKey: 'file:src/index.ts',
          nodeType: DigitalTwinNodeType.FILE,
          changeKind: 'MODIFIED',
          snapshotSide: 'HEAD',
        },
      ]);

      mockPersistence.loadDigitalTwinGraph
        .mockResolvedValueOnce({ nodes: [], edges: [] })
        .mockResolvedValueOnce({
          nodes: [
            {
              id: 'n1',
              stableKey: 'file:src/index.ts',
              type: DigitalTwinNodeType.FILE,
              name: 'index.ts',
              path: 'src/index.ts',
            },
          ],
          edges: [],
        });

      mockTraversal.traverse.mockReturnValueOnce({
        findings: [],
        evidencePaths: [],
        truncated: false,
        stats: {
          rootCount: 1,
          affectedNodeCount: 0,
          firstOrderCount: 0,
          transitiveCount: 0,
          evidencePathCount: 0,
        },
      });

      mockPersistence.persistAnalysisResult.mockResolvedValueOnce(undefined);

      await service.executeAnalysis('analysis-1');

      expect(mockDb.client.blastRadiusAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-1' },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );

      expect(mockPersistence.persistAnalysisResult).toHaveBeenCalledWith(
        'analysis-1',
        expect.any(Array),
        expect.objectContaining({
          findings: expect.any(Array),
          evidencePaths: expect.any(Array),
        }),
      );
    });

    it('marks analysis as FAILED when exception occurs', async () => {
      mockDb.client.blastRadiusAnalysis.findUnique.mockResolvedValueOnce({
        id: 'analysis-err',
        organizationId: 'org-1',
        changeSetId: 'cs-1',
        changeRevisionId: 'rev-1',
        status: 'QUEUED',
        changeRevision: {
          id: 'rev-1',
          status: 'SUCCEEDED',
          baseSnapshotId: 'base-snap',
          headSnapshotId: 'head-snap',
        },
      });

      mockDb.client.blastRadiusAnalysis.update.mockResolvedValue({});
      mockDb.client.digitalTwinSnapshot.findUnique.mockResolvedValue({ id: 'twin-head-1' });

      mockPersistence.deriveRoots.mockRejectedValueOnce(
        new Error('Database error during root derivation'),
      );

      await expect(service.executeAnalysis('analysis-err')).rejects.toThrow();

      expect(mockDb.client.blastRadiusAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'analysis-err' },
          data: expect.objectContaining({
            status: 'FAILED',
            failureCode: 'ANALYSIS_ERROR',
          }),
        }),
      );
    });
  });
});
