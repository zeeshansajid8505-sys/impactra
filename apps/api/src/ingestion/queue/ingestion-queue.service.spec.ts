import { IngestionQueueService } from './ingestion-queue.service';
import { Queue } from 'bullmq';
import { IngestionJobData } from '../ingestion.processor';

describe('IngestionQueueService', () => {
  let service: IngestionQueueService;
  let mockQueue: jest.Mocked<Partial<Queue<IngestionJobData>>>;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-ing-1' } as any),
    };
    service = new IngestionQueueService(mockQueue as Queue<IngestionJobData>);
  });

  describe('enqueue', () => {
    it('produces deterministic colon-free job ID repository-ingestion-${ingestionId}', async () => {
      const ingestionId = 'ing-abc-123';
      await service.enqueue(ingestionId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = (mockQueue.add as jest.Mock).mock.calls[0];

      expect(jobName).toBe('ingest-repository');
      expect(payload).toEqual({ ingestionId });
      expect(options.jobId).toBe(`repository-ingestion-${ingestionId}`);
      expect(options.jobId).not.toContain(':');
    });

    it('generates identical job ID for repeated calls with same ingestion (no timestamps or randomness)', async () => {
      const ingestionId = 'ing-deterministic-456';

      await service.enqueue(ingestionId);
      const firstJobId = (mockQueue.add as jest.Mock).mock.calls[0][2].jobId;

      await service.enqueue(ingestionId);
      const secondJobId = (mockQueue.add as jest.Mock).mock.calls[1][2].jobId;

      expect(firstJobId).toBe(secondJobId);
      expect(firstJobId).toBe('repository-ingestion-ing-deterministic-456');
      expect(firstJobId).not.toMatch(/\d{13}/); // No Date.now() timestamp
      expect(firstJobId).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/); // No generated UUID
    });

    it('handles missing queue gracefully without crashing', async () => {
      const noQueueService = new IngestionQueueService(undefined);
      await expect(noQueueService.enqueue('ing-no-queue')).resolves.not.toThrow();
    });
  });
});
