import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BlastRadiusAnalysisService } from './services/blast-radius-analysis.service';
import { BlastRadiusJobPayload } from './queue/blast-radius-queue.service';

@Processor('blast-radius-analysis')
export class BlastRadiusProcessor extends WorkerHost {
  private readonly logger = new Logger(BlastRadiusProcessor.name);

  constructor(private readonly analysisService: BlastRadiusAnalysisService) {
    super();
  }

  async process(job: Job<BlastRadiusJobPayload>): Promise<void> {
    const { analysisId } = job.data;
    if (!analysisId) {
      this.logger.warn(`Received BullMQ job ${job.id} without analysisId.`);
      return;
    }

    this.logger.log(
      `BullMQ blast-radius-analysis worker processing job ${job.id} for analysis ${analysisId}`,
    );

    await this.analysisService.executeAnalysis(analysisId);
  }
}
