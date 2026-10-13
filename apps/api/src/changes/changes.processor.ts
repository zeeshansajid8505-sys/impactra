import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ChangeOrchestratorService } from './services/change-orchestrator.service';
import { ChangeJobPayload } from './types/change.types';

@Processor('change-ingestion')
export class ChangesProcessor extends WorkerHost {
  private readonly logger = new Logger(ChangesProcessor.name);

  constructor(private readonly orchestratorService: ChangeOrchestratorService) {
    super();
  }

  async process(job: Job<ChangeJobPayload>): Promise<void> {
    const { changeRevisionId } = job.data;
    if (!changeRevisionId) {
      this.logger.warn(`Received BullMQ job ${job.id} without changeRevisionId.`);
      return;
    }

    this.logger.log(
      `BullMQ change-ingestion worker processing job ${job.id} for revision ${changeRevisionId}`,
    );

    await this.orchestratorService.processChangeRevision(changeRevisionId);
  }
}
