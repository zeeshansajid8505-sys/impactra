import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { BlastRadiusQueueService } from '../queue/blast-radius-queue.service';
import {
  BlastRadiusTraversalService,
  TraversalOutput,
  ComputedFinding,
  ComputedEvidencePath,
} from './blast-radius-traversal.service';
import {
  BlastRadiusPersistenceService,
  ListFindingsFilter,
  ListEvidencePathsFilter,
  ListAnalysesFilter,
} from './blast-radius-persistence.service';
import {
  BlastRadiusAnalysisDto,
  BlastRadiusAnalysisSummaryResponse,
  BlastRadiusFindingsResponse,
  BlastRadiusEvidencePathsResponse,
  BlastRadiusAnalysesListResponse,
} from '@impactra/shared';

@Injectable()
export class BlastRadiusAnalysisService {
  private readonly logger = new Logger(BlastRadiusAnalysisService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly queueService: BlastRadiusQueueService,
    private readonly traversalService: BlastRadiusTraversalService,
    private readonly persistenceService: BlastRadiusPersistenceService,
  ) {}

  /**
   * Triggers or retries a deterministic blast-radius analysis for a change set.
   * Enforces multi-tenancy and validates revision completion state.
   */
  async triggerAnalysis(
    organizationId: string,
    changeSetId: string,
    force = false,
  ): Promise<BlastRadiusAnalysisDto> {
    const changeSet = await this.databaseService.client.changeSet.findFirst({
      where: {
        id: changeSetId,
        organizationId,
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!changeSet) {
      throw new NotFoundException(
        `Change set '${changeSetId}' not found in organization '${organizationId}'.`,
      );
    }

    const latestRevision = changeSet.revisions[0];
    if (!latestRevision) {
      throw new BadRequestException(
        `Change set '${changeSetId}' has no analysis revisions.`,
      );
    }

    if (latestRevision.status !== 'SUCCEEDED') {
      throw new BadRequestException(
        `Cannot run blast-radius analysis: ChangeRevision '${latestRevision.id}' is in status '${latestRevision.status}'. Only SUCCEEDED revisions can be analyzed.`,
      );
    }

    // Idempotent boundary: check if an analysis already exists for this revision + version
    const existing =
      await this.databaseService.client.blastRadiusAnalysis.findUnique({
        where: {
          changeRevisionId_analysisVersion: {
            changeRevisionId: latestRevision.id,
            analysisVersion: 'blast-radius-v1',
          },
        },
      });

    if (existing) {
      if (
        (existing.status === 'SUCCEEDED' ||
          existing.status === 'RUNNING' ||
          existing.status === 'QUEUED') &&
        !force
      ) {
        this.logger.log(
          `Returning existing ${existing.status} blast-radius analysis '${existing.id}' for revision '${latestRevision.id}'.`,
        );
        return this.persistenceService.getAnalysisById(
          organizationId,
          changeSetId,
          existing.id,
        );
      }

      // Re-triggering a FAILED analysis or forced re-run: reset to QUEUED
      const updated = await this.databaseService.client.blastRadiusAnalysis.update({
        where: { id: existing.id },
        data: {
          status: 'QUEUED',
          rootCount: 0,
          affectedNodeCount: 0,
          firstOrderCount: 0,
          transitiveCount: 0,
          evidencePathCount: 0,
          truncated: false,
          startedAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
        },
      });

      await this.queueService.enqueue(updated.id);
      return this.persistenceService.getAnalysisById(
        organizationId,
        changeSetId,
        updated.id,
      );
    }

    // Create new analysis record
    const created = await this.databaseService.client.blastRadiusAnalysis.create({
      data: {
        organizationId,
        changeSetId,
        changeRevisionId: latestRevision.id,
        analysisVersion: 'blast-radius-v1',
        status: 'QUEUED',
      },
    });

    await this.queueService.enqueue(created.id);
    return this.persistenceService.getAnalysisById(
      organizationId,
      changeSetId,
      created.id,
    );
  }

  /**
   * Background execution processor for an analysis job.
   */
  async executeAnalysis(analysisId: string): Promise<void> {
    const analysis =
      await this.databaseService.client.blastRadiusAnalysis.findUnique({
        where: { id: analysisId },
        include: {
          changeRevision: true,
        },
      });

    if (!analysis) {
      this.logger.error(`BlastRadiusAnalysis '${analysisId}' not found.`);
      return;
    }

    if (analysis.status === 'SUCCEEDED') {
      this.logger.log(
        `BlastRadiusAnalysis '${analysisId}' is already SUCCEEDED. Skipping.`,
      );
      return;
    }

    this.logger.log(
      `Starting deterministic blast-radius analysis '${analysisId}' for revision '${analysis.changeRevisionId}'...`,
    );

    await this.databaseService.client.blastRadiusAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const revision = analysis.changeRevision;
      if (revision.status !== 'SUCCEEDED') {
        throw new Error(
          `REVISION_NOT_READY: ChangeRevision '${revision.id}' has status '${revision.status}'.`,
        );
      }

      // 1. Resolve Digital Twin snapshots for base and head
      const [baseTwin, headTwin] = await Promise.all([
        revision.baseSnapshotId
          ? this.databaseService.client.digitalTwinSnapshot.findUnique({
              where: { repositorySnapshotId: revision.baseSnapshotId },
            })
          : null,
        revision.headSnapshotId
          ? this.databaseService.client.digitalTwinSnapshot.findUnique({
              where: { repositorySnapshotId: revision.headSnapshotId },
            })
          : null,
      ]);

      if (!baseTwin && !headTwin) {
        throw new Error(
          `MISSING_TWIN_SNAPSHOT: Neither base nor head DigitalTwinSnapshot found for revision '${revision.id}'.`,
        );
      }

      // Update snapshot references on analysis
      await this.databaseService.client.blastRadiusAnalysis.update({
        where: { id: analysisId },
        data: {
          baseDigitalTwinSnapshotId: baseTwin ? baseTwin.id : null,
          headDigitalTwinSnapshotId: headTwin ? headTwin.id : null,
        },
      });

      // 2. Authoritative root derivation
      const roots = await this.persistenceService.deriveRoots(revision.id);
      this.logger.log(
        `Derived ${roots.length} blast-radius roots for analysis '${analysisId}'.`,
      );

      if (roots.length === 0) {
        // No mapped roots - persist clean empty result
        await this.persistenceService.persistAnalysisResult(analysisId, roots, {
          findings: [],
          evidencePaths: [],
          truncated: false,
          stats: {
            rootCount: 0,
            affectedNodeCount: 0,
            firstOrderCount: 0,
            transitiveCount: 0,
            evidencePathCount: 0,
          },
        });
        this.logger.log(
          `Blast-radius analysis '${analysisId}' completed: 0 roots, 0 findings.`,
        );
        return;
      }

      // 3. Partition roots by snapshot side
      const headRoots = roots.filter((r) => r.snapshotSide === 'HEAD');
      const baseRoots = roots.filter((r) => r.snapshotSide === 'BASE');

      const allFindingsMap = new Map<string, ComputedFinding>();
      const allEvidencePaths: ComputedEvidencePath[] = [];
      let isTruncated = false;

      // 4. Traversal on HEAD graph
      if (headRoots.length > 0 && headTwin) {
        const headGraph = await this.persistenceService.loadDigitalTwinGraph(
          headTwin.id,
        );
        const headOutput = this.traversalService.traverse(
          headRoots,
          headGraph.nodes,
          headGraph.edges,
          'HEAD',
        );

        if (headOutput.truncated) isTruncated = true;
        for (const ep of headOutput.evidencePaths) {
          allEvidencePaths.push(ep);
        }
        for (const f of headOutput.findings) {
          allFindingsMap.set(f.stableKey, f);
        }
      }

      // 5. Traversal on BASE graph (for deleted entities)
      if (baseRoots.length > 0 && baseTwin) {
        const baseGraph = await this.persistenceService.loadDigitalTwinGraph(
          baseTwin.id,
        );
        const baseOutput = this.traversalService.traverse(
          baseRoots,
          baseGraph.nodes,
          baseGraph.edges,
          'BASE',
        );

        if (baseOutput.truncated) isTruncated = true;
        for (const ep of baseOutput.evidencePaths) {
          allEvidencePaths.push(ep);
        }
        for (const f of baseOutput.findings) {
          const existing = allFindingsMap.get(f.stableKey);
          if (!existing) {
            allFindingsMap.set(f.stableKey, f);
          } else if (f.depth < existing.depth) {
            allFindingsMap.set(f.stableKey, f);
          }
        }
      }

      // 6. Sort merged findings and evidence paths
      const mergedFindings = Array.from(allFindingsMap.values()).sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.stableKey.localeCompare(b.stableKey);
      });

      const firstOrderCount = mergedFindings.filter(
        (f) => f.impactClass === 'FIRST_ORDER',
      ).length;
      const transitiveCount = mergedFindings.filter(
        (f) => f.impactClass === 'TRANSITIVE',
      ).length;

      const mergedOutput: TraversalOutput = {
        findings: mergedFindings,
        evidencePaths: allEvidencePaths,
        truncated: isTruncated,
        stats: {
          rootCount: roots.length,
          affectedNodeCount: mergedFindings.length,
          firstOrderCount,
          transitiveCount,
          evidencePathCount: allEvidencePaths.length,
        },
      };

      // 7. Transactional persistence
      await this.persistenceService.persistAnalysisResult(
        analysisId,
        roots,
        mergedOutput,
      );

      this.logger.log(
        `Blast-radius analysis '${analysisId}' succeeded: ${roots.length} roots, ${mergedFindings.length} affected entities (${firstOrderCount} first-order, ${transitiveCount} transitive, truncated=${isTruncated}).`,
      );
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      const failureCode = errMessage.startsWith('MISSING_')
        ? errMessage.split(':')[0]
        : 'ANALYSIS_ERROR';
      const failureMessage = errMessage || 'Unknown blast radius analysis error';

      this.logger.error(
        `Blast-radius analysis '${analysisId}' failed: ${failureMessage}`,
      );

      await this.databaseService.client.blastRadiusAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'FAILED',
          failureCode,
          failureMessage,
          completedAt: new Date(),
        },
      });

      throw err;
    }
  }

  /**
   * Alias for executeAnalysis for backward compatibility.
   */
  async processBlastRadiusAnalysis(analysisId: string): Promise<void> {
    return this.executeAnalysis(analysisId);
  }

  /**
   * Retrieves latest blast-radius summary for a change set.
   */
  async getLatestSummary(
    organizationId: string,
    changeSetId: string,
  ): Promise<BlastRadiusAnalysisSummaryResponse> {
    const analysis = await this.persistenceService.getLatestAnalysis(
      organizationId,
      changeSetId,
    );

    if (!analysis) {
      throw new NotFoundException(
        `No blast radius analysis found for change set '${changeSetId}'. Trigger an analysis first.`,
      );
    }

    return {
      analysis,
      roots: analysis.roots || [],
      summary: {
        rootCount: analysis.rootCount,
        affectedNodeCount: analysis.affectedNodeCount,
        firstOrderCount: analysis.firstOrderCount,
        transitiveCount: analysis.transitiveCount,
        evidencePathCount: analysis.evidencePathCount,
        truncated: analysis.truncated,
      },
    };
  }

  /**
   * Retrieves specific analysis details by ID.
   */
  async getAnalysis(
    organizationId: string,
    changeSetId: string,
    analysisId: string,
  ): Promise<BlastRadiusAnalysisDto> {
    return this.persistenceService.getAnalysisById(
      organizationId,
      changeSetId,
      analysisId,
    );
  }

  /**
   * Lists paginated findings for an analysis.
   */
  async listFindings(
    organizationId: string,
    changeSetId: string,
    analysisId: string,
    filter: ListFindingsFilter,
  ): Promise<BlastRadiusFindingsResponse> {
    return this.persistenceService.listFindings(
      organizationId,
      changeSetId,
      analysisId,
      filter,
    );
  }

  /**
   * Lists paginated evidence paths for an analysis.
   */
  async listEvidencePaths(
    organizationId: string,
    changeSetId: string,
    analysisId: string,
    filter: ListEvidencePathsFilter,
  ): Promise<BlastRadiusEvidencePathsResponse> {
    return this.persistenceService.listEvidencePaths(
      organizationId,
      changeSetId,
      analysisId,
      filter,
    );
  }

  /**
   * Lists organization-scoped analyses. Powers /intelligence/blast-radius page.
   */
  async listOrganizationAnalyses(
    organizationId: string,
    filter: ListAnalysesFilter,
  ): Promise<BlastRadiusAnalysesListResponse> {
    return this.persistenceService.listAnalyses(organizationId, filter);
  }
}
