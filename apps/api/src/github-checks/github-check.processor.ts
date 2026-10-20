import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { GitHubCheckPublicationService } from './services/github-check-publication.service';
import { GitHubCheckJobPayload } from './queue/github-check-queue.service';

@Processor('github-check-publication')
export class GitHubCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(GitHubCheckProcessor.name);

  constructor(
    private readonly publicationService: GitHubCheckPublicationService,
  ) {
    super();
  }

  async process(job: Job<GitHubCheckJobPayload>): Promise<void> {
    const { publicationId } = job.data;
    if (!publicationId) {
      this.logger.warn(`Received BullMQ job ${job.id} without publicationId.`);
      return;
    }

    this.logger.log(
      `BullMQ github-check-publication worker processing job ${job.id} for publication ${publicationId}`,
    );

    await this.publicationService.executePublication(publicationId);
  }
}
