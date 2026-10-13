import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { DependencyDeltaType } from '@impactra/shared';
import { ComputedDependencyDeltaRecord } from '../types/change.types';

export interface ComputeDependencyDeltaInput {
  changeRevisionId: string;
  baseSnapshotId: string;
  headSnapshotId: string;
}

@Injectable()
export class DependencyDeltaService {
  private readonly logger = new Logger(DependencyDeltaService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Deterministically computes graph dependency deltas (EDGE_ADDED and EDGE_REMOVED)
   * between base snapshot and head snapshot.
   */
  async computeDependencyDeltas(
    input: ComputeDependencyDeltaInput,
  ): Promise<ComputedDependencyDeltaRecord[]> {
    const { changeRevisionId, baseSnapshotId, headSnapshotId } = input;

    // 1. Fetch base edges with source and target node info
    const baseEdges = await this.databaseService.client.digitalTwinEdge.findMany({
      where: {
        OR: [
          { digitalTwinSnapshotId: baseSnapshotId },
          { snapshot: { repositorySnapshotId: baseSnapshotId } },
        ],
      },
      include: {
        sourceNode: true,
        targetNode: true,
      },
    });

    // 2. Fetch head edges with source and target node info
    const headEdges = await this.databaseService.client.digitalTwinEdge.findMany({
      where: {
        OR: [
          { digitalTwinSnapshotId: headSnapshotId },
          { snapshot: { repositorySnapshotId: headSnapshotId } },
        ],
      },
      include: {
        sourceNode: true,
        targetNode: true,
      },
    });

    // Build unique stable signature maps: `${sourceKey}|${targetKey}|${edgeType}`
    const makeSignature = (sourceKey: string, targetKey: string, edgeType: string) =>
      `${sourceKey}|${targetKey}|${edgeType}`;

    const baseMap = new Map<string, (typeof baseEdges)[0]>();
    for (const edge of baseEdges) {
      const src = edge.sourceNode;
      const tgt = edge.targetNode;
      if (src && tgt) {
        baseMap.set(
          makeSignature(src.stableKey, tgt.stableKey, edge.type),
          edge,
        );
      }
    }

    const headMap = new Map<string, (typeof headEdges)[0]>();
    for (const edge of headEdges) {
      const src = edge.sourceNode;
      const tgt = edge.targetNode;
      if (src && tgt) {
        headMap.set(
          makeSignature(src.stableKey, tgt.stableKey, edge.type),
          edge,
        );
      }
    }

    const deltas: ComputedDependencyDeltaRecord[] = [];

    // Detect EDGE_REMOVED: edges present in base but not in head
    for (const [sig, baseEdge] of baseMap.entries()) {
      if (!headMap.has(sig)) {
        deltas.push({
          changeRevisionId,
          deltaType: DependencyDeltaType.EDGE_REMOVED,
          sourceStableKey: baseEdge.sourceNode.stableKey,
          targetStableKey: baseEdge.targetNode.stableKey,
          edgeType: baseEdge.type,
          beforeEvidence: (baseEdge.evidence as Record<string, any>) || {},
          afterEvidence: null,
        });
      }
    }

    // Detect EDGE_ADDED: edges present in head but not in base
    for (const [sig, headEdge] of headMap.entries()) {
      if (!baseMap.has(sig)) {
        deltas.push({
          changeRevisionId,
          deltaType: DependencyDeltaType.EDGE_ADDED,
          sourceStableKey: headEdge.sourceNode.stableKey,
          targetStableKey: headEdge.targetNode.stableKey,
          edgeType: headEdge.type,
          beforeEvidence: null,
          afterEvidence: (headEdge.evidence as Record<string, any>) || {},
        });
      }
    }

    return deltas;
  }
}
