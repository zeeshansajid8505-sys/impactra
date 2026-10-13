import { ConflictException } from '@nestjs/common';
import { SnapshotAlignmentService } from './snapshot-alignment.service';
import { DatabaseService } from '../../database/database.service';
import { IngestionOrchestratorService } from '../../ingestion/services/ingestion-orchestrator.service';

describe('SnapshotAlignmentService', () => {
  let service: SnapshotAlignmentService;
  let mockDb: any;
  let mockIngestionOrchestrator: any;

  beforeEach(() => {
    mockDb = {
      client: {
        repositorySnapshot: {
          findFirst: jest.fn(),
        },
        repositoryIngestion: {
          findFirst: jest.fn(),
        },
      },
    };

    mockIngestionOrchestrator = {
      triggerIngestion: jest.fn(),
    };

    service = new SnapshotAlignmentService(
      mockDb as DatabaseService,
      mockIngestionOrchestrator as IngestionOrchestratorService,
    );
  });

  it('returns ALIGNED when both base and head snapshots are SUCCEEDED', async () => {
    mockDb.client.repositorySnapshot.findFirst
      .mockResolvedValueOnce({ id: 'base-snap-123', commitSha: 'base-sha-1' })
      .mockResolvedValueOnce({ id: 'head-snap-456', commitSha: 'head-sha-2' });

    const result = await service.alignSnapshots({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      baseSha: 'base-sha-1',
      headSha: 'head-sha-2',
    });

    expect(result.status).toBe('ALIGNED');
    expect(result.baseSnapshotId).toBe('base-snap-123');
    expect(result.headSnapshotId).toBe('head-snap-456');
    expect(mockIngestionOrchestrator.triggerIngestion).not.toHaveBeenCalled();
  });

  it('triggers base ingestion first when base snapshot is missing and no active job running', async () => {
    // base snapshot not found
    mockDb.client.repositorySnapshot.findFirst.mockResolvedValueOnce(null);
    // no active job
    mockDb.client.repositoryIngestion.findFirst.mockResolvedValueOnce(null);
    mockIngestionOrchestrator.triggerIngestion.mockResolvedValueOnce({ id: 'job-1' });

    const result = await service.alignSnapshots({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      baseSha: 'base-sha-1',
      baseRef: 'main',
      headSha: 'head-sha-2',
    });

    expect(result.status).toBe('WAITING');
    expect(mockIngestionOrchestrator.triggerIngestion).toHaveBeenCalledWith(
      'org-1',
      'repo-1',
      null,
      { commitSha: 'base-sha-1', ref: 'main' },
    );
  });

  it('waits when base snapshot is missing and an active ingestion is already running', async () => {
    mockDb.client.repositorySnapshot.findFirst.mockResolvedValueOnce(null);
    mockDb.client.repositoryIngestion.findFirst.mockResolvedValueOnce({
      id: 'active-job-1',
      status: 'PROCESSING',
    });

    const result = await service.alignSnapshots({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      baseSha: 'base-sha-1',
      headSha: 'head-sha-2',
    });

    expect(result.status).toBe('WAITING');
    expect(mockIngestionOrchestrator.triggerIngestion).not.toHaveBeenCalled();
  });

  it('triggers head ingestion sequentially only after base snapshot is SUCCEEDED', async () => {
    // base snapshot SUCCEEDED
    mockDb.client.repositorySnapshot.findFirst
      .mockResolvedValueOnce({ id: 'base-snap-123', commitSha: 'base-sha-1' })
      // head snapshot not found
      .mockResolvedValueOnce(null);

    // no active job
    mockDb.client.repositoryIngestion.findFirst.mockResolvedValueOnce(null);
    mockIngestionOrchestrator.triggerIngestion.mockResolvedValueOnce({ id: 'head-job-2' });

    const result = await service.alignSnapshots({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      baseSha: 'base-sha-1',
      headSha: 'head-sha-2',
      headRef: 'feature-pr',
    });

    expect(result.status).toBe('WAITING');
    expect(result.baseSnapshotId).toBe('base-snap-123');
    expect(mockIngestionOrchestrator.triggerIngestion).toHaveBeenCalledWith(
      'org-1',
      'repo-1',
      null,
      { commitSha: 'head-sha-2', ref: 'feature-pr' },
    );
  });

  it('handles ConflictException gracefully when concurrent ingestion was just started', async () => {
    mockDb.client.repositorySnapshot.findFirst.mockResolvedValueOnce(null);
    mockDb.client.repositoryIngestion.findFirst.mockResolvedValueOnce(null);
    mockIngestionOrchestrator.triggerIngestion.mockRejectedValueOnce(
      new ConflictException('Ingestion job already running'),
    );

    const result = await service.alignSnapshots({
      organizationId: 'org-1',
      repositoryConnectionId: 'repo-1',
      baseSha: 'base-sha-1',
      headSha: 'head-sha-2',
    });

    expect(result.status).toBe('WAITING');
  });
});
