import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReleaseSafetyAnalysisService } from './services/release-safety-analysis.service';
import { ReleaseSafetyJobPayload } from './queue/release-safety-queue.service';

@Processor('release-safety-analysis')
export class ReleaseSafetyProcessor extends WorkerHost {
  private readonly logger = new Logger(ReleaseSafetyProcessor.name);

  constructor(
    private readonly analysisService: ReleaseSafetyAnalysisService,
  ) {
    super();
  }

  async process(job: Job<ReleaseSafetyJobPayload>): Promise<void> {
    const { assessmentId } = job.data;
    if (!assessmentId) {
      this.logger.warn(`Received BullMQ job ${job.id} without assessmentId.`);
      return;
    }

    this.logger.log(
      `BullMQ release-safety-analysis worker processing job ${job.id} for assessment ${assessmentId}`,
    );

    await this.analysisService.executeEvaluation(assessmentId);
  }
}
