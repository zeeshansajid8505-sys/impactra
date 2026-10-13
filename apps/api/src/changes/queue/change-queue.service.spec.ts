import { ChangeQueueService } from './change-queue.service';
import { Queue } from 'bullmq';
import { ChangeJobPayload } from '../types/change.types';

describe('ChangeQueueService', () => {
  let service: ChangeQueueService;
  let mockQueue: jest.Mocked<Partial<Queue<ChangeJobPayload>>>;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' } as any),
    };
    service = new ChangeQueueService(mockQueue as Queue<ChangeJobPayload>);
  });

  describe('enqueue', () => {
    it('produces deterministic colon-free job ID for normal queue', async () => {
      const revisionId = 'rev-abc-123';
      await service.enqueue(revisionId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = (mockQueue.add as jest.Mock).mock.calls[0];

      expect(jobName).toBe('analyze-change-revision');
      expect(payload).toEqual({ changeRevisionId: revisionId });
      expect(options.jobId).toBe(`change-revision-${revisionId}`);
      expect(options.jobId).not.toContain(':');
    });

    it('generates identical job ID for repeated calls with same revision (no timestamp or randomness)', async () => {
      const revisionId = 'rev-deterministic-456';

      await service.enqueue(revisionId);
      const firstJobId = (mockQueue.add as jest.Mock).mock.calls[0][2].jobId;

      await service.enqueue(revisionId);
      const secondJobId = (mockQueue.add as jest.Mock).mock.calls[1][2].jobId;

      expect(firstJobId).toBe(secondJobId);
      expect(firstJobId).toBe('change-revision-rev-deterministic-456');
      expect(firstJobId).not.toMatch(/\d{13}/); // No 13-digit Date.now() timestamp
      expect(firstJobId).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/); // No generated UUID
    });
  });

  describe('enqueueWithDelay', () => {
    it('produces deterministic colon-free job ID for delayed queue without timestamps', async () => {
      const revisionId = 'rev-xyz-789';
      await service.enqueueWithDelay(revisionId, 5000);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = (mockQueue.add as jest.Mock).mock.calls[0];

      expect(jobName).toBe('analyze-change-revision');
      expect(payload).toEqual({ changeRevisionId: revisionId });
      expect(options.jobId).toBe(`change-revision-${revisionId}-delay`);
      expect(options.jobId).not.toContain(':');
      expect(options.delay).toBe(5000);
    });

    it('generates identical delayed job ID for repeated calls with same revision', async () => {
      const revisionId = 'rev-deterministic-delayed';

      await service.enqueueWithDelay(revisionId, 3000);
      const firstJobId = (mockQueue.add as jest.Mock).mock.calls[0][2].jobId;

      await service.enqueueWithDelay(revisionId, 3000);
      const secondJobId = (mockQueue.add as jest.Mock).mock.calls[1][2].jobId;

      expect(firstJobId).toBe(secondJobId);
      expect(firstJobId).toBe('change-revision-rev-deterministic-delayed-delay');
      expect(firstJobId).not.toMatch(/\d{13}/); // No Date.now() timestamp
      expect(firstJobId).not.toMatch(/Math\.random/);
    });
  });

  describe('queue availability fallback', () => {
    it('handles null/undefined queue gracefully without crashing', async () => {
      const noQueueService = new ChangeQueueService(undefined);
      await expect(noQueueService.enqueue('rev-no-queue')).resolves.not.toThrow();
      await expect(noQueueService.enqueueWithDelay('rev-no-queue', 1000)).resolves.not.toThrow();
    });
  });
});
