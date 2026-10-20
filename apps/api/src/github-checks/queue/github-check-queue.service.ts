import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface GitHubCheckJobPayload {
  publicationId: string;
}

@Injectable()
export class GitHubCheckQueueService {
  private readonly logger = new Logger(GitHubCheckQueueService.name);
  public static readonly QUEUE_NAME = 'github-check-publication';

  constructor(
    @Optional()
    @InjectQueue('github-check-publication')
    private readonly queue?: Queue<GitHubCheckJobPayload>,
  ) {}

  /**
   * Enqueues a GitHub Check publication job into BullMQ with deterministic job ID
   * for deduplication and controlled retries.
   */
  async enqueue(publicationId: string): Promise<void> {
    if (this.queue) {
      const jobId = `github-check-publication-${publicationId}`;
      await this.queue.add(
        'publish-github-check',
        { publicationId },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(
        `Enqueued BullMQ job '${jobId}' for publication '${publicationId}'.`,
      );
    } else {
      this.logger.warn(
        `BullMQ queue not available. Publication '${publicationId}' recorded in DB only.`,
      );
    }
  }
}
