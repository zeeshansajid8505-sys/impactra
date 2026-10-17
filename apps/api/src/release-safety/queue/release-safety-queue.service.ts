import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface ReleaseSafetyJobPayload {
  assessmentId: string;
}

@Injectable()
export class ReleaseSafetyQueueService {
  private readonly logger = new Logger(ReleaseSafetyQueueService.name);
  public static readonly QUEUE_NAME = 'release-safety-analysis';

  constructor(
    @Optional()
    @InjectQueue('release-safety-analysis')
    private readonly queue?: Queue<ReleaseSafetyJobPayload>,
  ) {}

  /**
   * Enqueues a release safety evaluation job into BullMQ with deterministic job ID
   * for idempotent deduplication.
   */
  async enqueue(assessmentId: string): Promise<void> {
    if (this.queue) {
      const jobId = `release-safety-assessment-${assessmentId}`;
      await this.queue.add(
        'evaluate-release-safety',
        { assessmentId },
        {
          jobId,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(
        `Enqueued BullMQ job '${jobId}' for release safety assessment '${assessmentId}'.`,
      );
    } else {
      this.logger.warn(
        `BullMQ queue not available. Release safety assessment '${assessmentId}' recorded in DB only.`,
      );
    }
  }
}
