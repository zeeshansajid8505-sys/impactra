import { Injectable, Logger } from '@nestjs/common';
import {
  DigitalTwinNodeType,
  DigitalTwinEdgeType,
} from '@impactra/database';
import {
  BlastRadiusSnapshotSide,
  BlastRadiusImpactClass,
  BlastRadiusCategory,
  PathNodeDto,
  PathEdgeDto,
} from '@impactra/shared';
import { BlastRadiusEdgePolicy, EdgeTraversalRule } from './blast-radius-edge-policy';

export interface GraphNode {
  id: string;
  stableKey: string;
  name: string;
  path: string | null;
  type: DigitalTwinNodeType;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceStableKey: string;
  targetStableKey: string;
  type: DigitalTwinEdgeType;
}

export interface TraversalRoot {
  rootId?: string;
  twinChangeMappingId?: string | null;
  digitalTwinNodeId?: string | null;
  stableKey: string;
  nodeType: DigitalTwinNodeType;
  changeKind: string;
  snapshotSide: BlastRadiusSnapshotSide;
}

export interface ComputedEvidencePath {
  rootStableKey: string;
  affectedStableKey: string;
  snapshotSide: BlastRadiusSnapshotSide;
  depth: number;
  pathNodes: PathNodeDto[];
  pathEdges: PathEdgeDto[];
}

export interface ComputedFinding {
  rootId?: string;
  digitalTwinNodeId?: string;
  stableKey: string;
  nodeName: string;
  nodePath: string | null;
  nodeType: DigitalTwinNodeType;
  category: BlastRadiusCategory;
  impactClass: BlastRadiusImpactClass;
  depth: number;
  reasonCode: string;
  reasonSummary: string;
  snapshotSide: BlastRadiusSnapshotSide;
  evidencePaths: ComputedEvidencePath[];
}

export interface TraversalLimits {
  maxDepth: number;
  maxAffectedNodes: number;
  maxEvidencePaths: number;
}

export interface TraversalOutput {
  findings: ComputedFinding[];
  evidencePaths: ComputedEvidencePath[];
  truncated: boolean;
  stats: {
    rootCount: number;
    affectedNodeCount: number;
    firstOrderCount: number;
    transitiveCount: number;
    evidencePathCount: number;
  };
}

interface BfsQueueItem {
  root: TraversalRoot;
  currentStableKey: string;
  depth: number;
  rule: EdgeTraversalRule;
  pathNodes: PathNodeDto[];
  pathEdges: PathEdgeDto[];
}

@Injectable()
export class BlastRadiusTraversalService {
  private readonly logger = new Logger(BlastRadiusTraversalService.name);

  constructor(private readonly edgePolicy: BlastRadiusEdgePolicy) {}

  /**
   * Resolves configured safety limits with fallback defaults.
   */
  resolveLimits(): TraversalLimits {
    const maxDepth = Math.max(
      1,
      parseInt(process.env.BLAST_RADIUS_MAX_DEPTH || '5', 10) || 5,
    );
    const maxAffectedNodes = Math.max(
      10,
      parseInt(process.env.BLAST_RADIUS_MAX_AFFECTED_NODES || '5000', 10) || 5000,
    );
    const maxEvidencePaths = Math.max(
      10,
      parseInt(process.env.BLAST_RADIUS_MAX_EVIDENCE_PATHS || '10000', 10) || 10000,
    );

    return { maxDepth, maxAffectedNodes, maxEvidencePaths };
  }

  /**
   * Executes deterministic bounded BFS traversal across Digital Twin dependents.
   */
  traverse(
    roots: TraversalRoot[],
    nodes: GraphNode[],
    edges: GraphEdge[],
    snapshotSide: BlastRadiusSnapshotSide,
    customLimits?: Partial<TraversalLimits>,
  ): TraversalOutput {
    const limits: TraversalLimits = {
      ...this.resolveLimits(),
      ...customLimits,
    };

    let truncated = false;

    // 1. Index nodes by stableKey for fast O(1) lookup
    const nodeMap = new Map<string, GraphNode>();
    for (const n of nodes) {
      nodeMap.set(n.stableKey, n);
    }

    // 2. Build reverse dependency adjacency map:
    // When A -(IMPORTS)-> B, B is the dependency and A is the dependent.
    // Changing B propagates to A. We index: targetStableKey -> list of { dependent, edge }
    const reverseAdjacency = new Map<
      string,
      Array<{ dependentKey: string; edge: GraphEdge; rule: EdgeTraversalRule }>
    >();

    for (const edge of edges) {
      const rule = this.edgePolicy.getEdgeRule(edge.type);
      if (!rule.propagates) continue;

      if (rule.direction === 'REVERSE_DEPENDENCY') {
        const fromTarget = edge.targetStableKey;
        const toSource = edge.sourceStableKey;

        if (!reverseAdjacency.has(fromTarget)) {
          reverseAdjacency.set(fromTarget, []);
        }
        reverseAdjacency.get(fromTarget)!.push({
          dependentKey: toSource,
          edge,
          rule,
        });
      }
    }

    // 3. Ensure deterministic neighbor ordering
    for (const [, adjList] of reverseAdjacency.entries()) {
      adjList.sort((a, b) => {
        const keyComp = a.dependentKey.localeCompare(b.dependentKey);
        if (keyComp !== 0) return keyComp;
        const typeComp = a.edge.type.localeCompare(b.edge.type);
        if (typeComp !== 0) return typeComp;
        return a.edge.id.localeCompare(b.edge.id);
      });
    }

    // 4. Initialize result maps:
    // Findings are deduplicated by affected entity stableKey
    const findingsMap = new Map<string, ComputedFinding>();
    const allEvidencePaths: ComputedEvidencePath[] = [];

    // Sort roots deterministically by stableKey
    const sortedRoots = [...roots].sort((a, b) => a.stableKey.localeCompare(b.stableKey));
    const rootStableKeys = new Set(sortedRoots.map((r) => r.stableKey));

    // 5. Run BFS for each root
    for (const root of sortedRoots) {
      const rootNode = nodeMap.get(root.stableKey);
      const rootNodeDto: PathNodeDto = {
        stableKey: root.stableKey,
        name: rootNode ? rootNode.name : root.stableKey,
        type: root.nodeType,
        path: rootNode ? rootNode.path : null,
      };

      const queue: BfsQueueItem[] = [];
      // Track visited nodes for this specific root to find shortest paths and prevent cycles
      const visitedForRoot = new Map<string, number>();
      visitedForRoot.set(root.stableKey, 0);

      const rootDependents = reverseAdjacency.get(root.stableKey) || [];
      for (const item of rootDependents) {
        // Roots themselves cannot be counted as affected dependents of themselves
        if (item.dependentKey === root.stableKey) continue;

        const depNode = nodeMap.get(item.dependentKey);
        if (!depNode) {
          this.logger.warn(
            `Dependent node '${item.dependentKey}' referenced in edge '${item.edge.id}' is missing from graph vertices. Skipping edge.`,
          );
          continue;
        }

        const depNodeDto: PathNodeDto = {
          stableKey: item.dependentKey,
          name: depNode.name,
          type: depNode.type,
          path: depNode.path,
        };

        const edgeDto: PathEdgeDto = {
          sourceStableKey: item.edge.sourceStableKey,
          targetStableKey: item.edge.targetStableKey,
          edgeType: item.edge.type,
          direction: item.rule.direction === 'DIRECT' ? 'DIRECT' : 'REVERSE_DEPENDENCY',
        };

        queue.push({
          root,
          currentStableKey: item.dependentKey,
          depth: 1,
          rule: item.rule,
          pathNodes: [rootNodeDto, depNodeDto],
          pathEdges: [edgeDto],
        });

        visitedForRoot.set(item.dependentKey, 1);
      }

      while (queue.length > 0) {
        const current = queue.shift()!;

        // Register finding & primary evidence path
        const affectedNode = nodeMap.get(current.currentStableKey);
        if (!affectedNode) {
          continue;
        }
        const affectedNodeType: DigitalTwinNodeType = affectedNode.type;
        const category = this.edgePolicy.mapNodeCategory(affectedNodeType);
        const impactClass: BlastRadiusImpactClass =
          current.depth === 1 ? 'FIRST_ORDER' : 'TRANSITIVE';

        const evidencePath: ComputedEvidencePath = {
          rootStableKey: root.stableKey,
          affectedStableKey: current.currentStableKey,
          snapshotSide,
          depth: current.depth,
          pathNodes: current.pathNodes,
          pathEdges: current.pathEdges,
        };

        // Check evidence path ceiling
        if (allEvidencePaths.length < limits.maxEvidencePaths) {
          allEvidencePaths.push(evidencePath);
        } else {
          truncated = true;
        }

        const existingFinding = findingsMap.get(current.currentStableKey);
        if (existingFinding) {
          // If reached at a strictly shorter depth, update primary impact class & depth
          if (current.depth < existingFinding.depth) {
            existingFinding.depth = current.depth;
            existingFinding.impactClass = impactClass;
            existingFinding.rootId = root.rootId;
            existingFinding.reasonCode = current.rule.reasonCode;
            existingFinding.reasonSummary = this.edgePolicy.buildReasonSummary(
              current.rule,
              current.depth,
              root.stableKey,
              current.currentStableKey,
            );
          }
          if (existingFinding.evidencePaths.length < 20) {
            existingFinding.evidencePaths.push(evidencePath);
          }
        } else {
          // Check affected node count limit
          if (findingsMap.size < limits.maxAffectedNodes) {
            const reasonSummary = this.edgePolicy.buildReasonSummary(
              current.rule,
              current.depth,
              root.stableKey,
              current.currentStableKey,
            );

            findingsMap.set(current.currentStableKey, {
              rootId: root.rootId,
              digitalTwinNodeId: affectedNode ? affectedNode.id : undefined,
              stableKey: current.currentStableKey,
              nodeName: affectedNode ? affectedNode.name : current.currentStableKey,
              nodePath: affectedNode ? affectedNode.path : null,
              nodeType: affectedNodeType,
              category,
              impactClass,
              depth: current.depth,
              reasonCode: current.rule.reasonCode,
              reasonSummary,
              snapshotSide,
              evidencePaths: [evidencePath],
            });
          } else {
            truncated = true;
          }
        }

        // Expand further if depth limit not reached
        if (current.depth < limits.maxDepth) {
          const nextDependents = reverseAdjacency.get(current.currentStableKey) || [];
          for (const nextItem of nextDependents) {
            const nextKey = nextItem.dependentKey;

            // Cycle prevention: skip if already in the active traversal path
            if (current.pathNodes.some((p) => p.stableKey === nextKey)) {
              continue;
            }

            // Do not loop back to root
            if (rootStableKeys.has(nextKey)) {
              continue;
            }

            // Visited check for this root: if visited at <= depth + 1, don't re-queue
            const prevDepth = visitedForRoot.get(nextKey);
            if (prevDepth !== undefined && prevDepth <= current.depth + 1) {
              continue;
            }

            visitedForRoot.set(nextKey, current.depth + 1);

            const nextDepNode = nodeMap.get(nextKey);
            if (!nextDepNode) {
              continue;
            }

            const nextDepNodeDto: PathNodeDto = {
              stableKey: nextKey,
              name: nextDepNode.name,
              type: nextDepNode.type,
              path: nextDepNode.path,
            };

            const nextEdgeDto: PathEdgeDto = {
              sourceStableKey: nextItem.edge.sourceStableKey,
              targetStableKey: nextItem.edge.targetStableKey,
              edgeType: nextItem.edge.type,
              direction: nextItem.rule.direction === 'DIRECT' ? 'DIRECT' : 'REVERSE_DEPENDENCY',
            };

            queue.push({
              root,
              currentStableKey: nextKey,
              depth: current.depth + 1,
              rule: nextItem.rule,
              pathNodes: [...current.pathNodes, nextDepNodeDto],
              pathEdges: [...current.pathEdges, nextEdgeDto],
            });
          }
        } else if (current.depth >= limits.maxDepth) {
          const hasFurther = (reverseAdjacency.get(current.currentStableKey) || []).length > 0;
          if (hasFurther) {
            truncated = true;
          }
        }
      }
    }

    // 6. Sort findings deterministically (depth ASC, stableKey ASC)
    const sortedFindings = Array.from(findingsMap.values()).sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.stableKey.localeCompare(b.stableKey);
    });

    const firstOrderCount = sortedFindings.filter((f) => f.impactClass === 'FIRST_ORDER').length;
    const transitiveCount = sortedFindings.filter((f) => f.impactClass === 'TRANSITIVE').length;

    return {
      findings: sortedFindings,
      evidencePaths: allEvidencePaths,
      truncated,
      stats: {
        rootCount: sortedRoots.length,
        affectedNodeCount: sortedFindings.length,
        firstOrderCount,
        transitiveCount,
        evidencePathCount: allEvidencePaths.length,
      },
    };
  }
}
