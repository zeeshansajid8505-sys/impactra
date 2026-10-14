import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface BlastRadiusJobPayload {
  analysisId: string;
}

@Injectable()
export class BlastRadiusQueueService {
  private readonly logger = new Logger(BlastRadiusQueueService.name);
  public static readonly QUEUE_NAME = 'blast-radius-analysis';

  constructor(
    @Optional()
    @InjectQueue('blast-radius-analysis')
    private readonly queue?: Queue<BlastRadiusJobPayload>,
  ) {}

  /**
   * Enqueues a blast radius analysis job into BullMQ with deterministic job ID
   * for idempotent deduplication.
   */
  async enqueue(analysisId: string): Promise<void> {
    if (this.queue) {
      const jobId = `blast-radius-analysis-${analysisId}`;
      await this.queue.add(
        'analyze-blast-radius',
        { analysisId },
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
      this.logger.log(`Enqueued BullMQ job '${jobId}' for blast-radius analysis '${analysisId}'.`);
    } else {
      this.logger.warn(
        `BullMQ queue not available. Blast radius analysis '${analysisId}' recorded in DB only.`,
      );
    }
  }
}
