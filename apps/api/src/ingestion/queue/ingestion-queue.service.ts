import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestionJobData } from '../ingestion.processor';

@Injectable()
export class IngestionQueueService {
  private readonly logger = new Logger(IngestionQueueService.name);
  public static readonly QUEUE_NAME = 'repository-ingestion';

  constructor(
    @Optional()
    @InjectQueue('repository-ingestion')
    private readonly queue?: Queue<IngestionJobData>,
  ) {}

  /**
   * Enqueues an ingestion job into BullMQ with safe payload ({ ingestionId })
   * and deterministic deduplication via BullMQ jobId.
   */
  async enqueue(ingestionId: string): Promise<void> {
    if (this.queue) {
      await this.queue.add(
        'ingest-repository',
        { ingestionId },
        {
          jobId: `repository-ingestion-${ingestionId}`, // deterministic deduplication (colon-free)
          attempts: 1, // DB state remains authoritative source of truth
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(`BullMQ job enqueued for ingestion ${ingestionId}`);
    } else {
      this.logger.warn(
        `BullMQ queue not available. Ingestion ${ingestionId} recorded in database only.`,
      );
    }
  }
}
