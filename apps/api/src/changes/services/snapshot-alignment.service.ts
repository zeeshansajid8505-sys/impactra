import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IngestionOrchestratorService } from '../../ingestion/services/ingestion-orchestrator.service';
import { SnapshotAlignmentResult } from '../types/change.types';

@Injectable()
export class SnapshotAlignmentService {
  private readonly logger = new Logger(SnapshotAlignmentService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly ingestionOrchestrator: IngestionOrchestratorService,
  ) {}

  /**
   * Finds an existing snapshot with SUCCEEDED ingestion for the exact commit SHA.
   */
  async findCompletedSnapshot(
    repositoryConnectionId: string,
    commitSha: string,
  ) {
    return this.databaseService.client.repositorySnapshot.findFirst({
      where: {
        repositoryConnectionId,
        commitSha,
        ingestion: {
          status: 'SUCCEEDED',
        },
      },
      include: {
        ingestion: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Checks if an ingestion job is currently running for this repository connection.
   */
  async getActiveIngestion(repositoryConnectionId: string) {
    return this.databaseService.client.repositoryIngestion.findFirst({
      where: {
        repositoryConnectionId,
        status: {
          in: ['QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING'],
        },
      },
    });
  }

  /**
   * Aligns base and head snapshots sequentially:
   * 1. Checks base SHA. If missing, triggers base ingestion if not already running, returns WAITING.
   * 2. Once base SHA has a SUCCEEDED snapshot, checks head SHA. If missing, triggers head ingestion if not already running, returns WAITING.
   * 3. Once both base and head have SUCCEEDED snapshots, returns ALIGNED with both snapshot IDs.
   */
  async alignSnapshots(params: {
    organizationId: string;
    repositoryConnectionId: string;
    baseSha: string;
    baseRef?: string;
    headSha: string;
    headRef?: string;
  }): Promise<SnapshotAlignmentResult> {
    const { organizationId, repositoryConnectionId, baseSha, baseRef, headSha, headRef } = params;

    // 1. Check Base Snapshot
    const baseSnapshot = await this.findCompletedSnapshot(repositoryConnectionId, baseSha);

    if (!baseSnapshot) {
      const active = await this.getActiveIngestion(repositoryConnectionId);
      if (active) {
        this.logger.log(
          `Waiting for active ingestion (${active.id}, status: ${active.status}) before aligning base SHA ${baseSha.slice(0, 7)}`,
        );
        return {
          status: 'WAITING',
          waitingReason: `Waiting for active ingestion ${active.id} (status: ${active.status}) for base commit`,
        };
      }

      this.logger.log(
        `Triggering ingestion for base SHA ${baseSha.slice(0, 7)} (ref: ${baseRef || 'main'})`,
      );
      try {
        await this.ingestionOrchestrator.triggerIngestion(
          organizationId,
          repositoryConnectionId,
          null,
          {
            commitSha: baseSha,
            ref: baseRef || 'main',
          },
        );
      } catch (err: any) {
        if (err instanceof ConflictException || err?.status === 409) {
          this.logger.log(`Conflict triggering base ingestion; active job in progress.`);
        } else {
          this.logger.error(`Failed to trigger base ingestion: ${err.message}`, err.stack);
          throw err;
        }
      }

      return {
        status: 'WAITING',
        waitingReason: `Triggered ingestion for base commit ${baseSha.slice(0, 7)}`,
      };
    }

    // 2. Check Head Snapshot
    const headSnapshot = await this.findCompletedSnapshot(repositoryConnectionId, headSha);

    if (!headSnapshot) {
      const active = await this.getActiveIngestion(repositoryConnectionId);
      if (active) {
        this.logger.log(
          `Waiting for active ingestion (${active.id}, status: ${active.status}) before aligning head SHA ${headSha.slice(0, 7)}`,
        );
        return {
          status: 'WAITING',
          baseSnapshotId: baseSnapshot.id,
          waitingReason: `Waiting for active ingestion ${active.id} (status: ${active.status}) for head commit`,
        };
      }

      this.logger.log(
        `Triggering ingestion for head SHA ${headSha.slice(0, 7)} (ref: ${headRef || 'head'})`,
      );
      try {
        await this.ingestionOrchestrator.triggerIngestion(
          organizationId,
          repositoryConnectionId,
          null,
          {
            commitSha: headSha,
            ref: headRef || 'head',
          },
        );
      } catch (err: any) {
        if (err instanceof ConflictException || err?.status === 409) {
          this.logger.log(`Conflict triggering head ingestion; active job in progress.`);
        } else {
          this.logger.error(`Failed to trigger head ingestion: ${err.message}`, err.stack);
          throw err;
        }
      }

      return {
        status: 'WAITING',
        baseSnapshotId: baseSnapshot.id,
        waitingReason: `Triggered ingestion for head commit ${headSha.slice(0, 7)}`,
      };
    }

    // Both snapshots are available and SUCCEEDED
    return {
      status: 'ALIGNED',
      baseSnapshotId: baseSnapshot.id,
      headSnapshotId: headSnapshot.id,
    };
  }
}
