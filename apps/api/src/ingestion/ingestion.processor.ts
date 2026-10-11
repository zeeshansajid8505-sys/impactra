import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionOrchestratorService } from './services/ingestion-orchestrator.service';

export interface IngestionJobData {
  ingestionId: string;
}

@Processor('repository-ingestion')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly orchestratorService: IngestionOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<void> {
    const { ingestionId } = job.data;
    if (!ingestionId) {
      this.logger.warn(`Received BullMQ job ${job.id} without ingestionId.`);
      return;
    }
    this.logger.log(
      `BullMQ repository-ingestion worker processing job ${job.id} for ingestion ${ingestionId}`,
    );
    await this.orchestratorService.processIngestion(ingestionId);
  }
}
