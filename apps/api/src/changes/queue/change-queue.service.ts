import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChangeJobPayload } from '../types/change.types';

@Injectable()
export class ChangeQueueService {
  private readonly logger = new Logger(ChangeQueueService.name);
  public static readonly QUEUE_NAME = 'change-ingestion';

  constructor(
    @Optional()
    @InjectQueue('change-ingestion')
    private readonly queue?: Queue<ChangeJobPayload>,
  ) {}

  /**
   * Enqueues a change revision job into BullMQ with immutable revision payload ({ changeRevisionId })
   * and deterministic deduplication via BullMQ jobId.
   */
  async enqueue(changeRevisionId: string): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'analyze-change-revision',
        { changeRevisionId },
        {
          jobId: `change-revision-${changeRevisionId}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(`BullMQ job enqueued for change revision ${changeRevisionId}`);
    } else {
      this.logger.warn(
        `BullMQ queue not available. Change revision ${changeRevisionId} recorded in database only.`,
      );
    }
  }

  /**
   * Requeues a change revision job with a specified delay (e.g. while waiting for snapshot ingestion).
   */
  async enqueueWithDelay(changeRevisionId: string, delayMs = 5000): Promise<void> {
    if (this.queue) {
      // Deterministic colon-free jobId ensuring duplicate protection without wall-clock timestamps
      const requeueJobId = `change-revision-${changeRevisionId}-delay`;
      await this.queue.add(
        'analyze-change-revision',
        { changeRevisionId },
        {
          jobId: requeueJobId,
          delay: delayMs,
          attempts: 3,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(
        `BullMQ delayed job enqueued for change revision ${changeRevisionId} (delay: ${delayMs}ms)`,
      );
    } else {
      this.logger.warn(
        `BullMQ queue not available. Delayed change revision ${changeRevisionId} cannot be queued.`,
      );
    }
  }
}
