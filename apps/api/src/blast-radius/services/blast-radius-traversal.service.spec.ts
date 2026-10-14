import { BlastRadiusTraversalService, GraphNode, GraphEdge, TraversalRoot } from './blast-radius-traversal.service';
import { BlastRadiusEdgePolicy } from './blast-radius-edge-policy';
import {
  DigitalTwinNodeType,
  DigitalTwinEdgeType,
} from '@impactra/database';
import {
  BlastRadiusSnapshotSide,
  BlastRadiusImpactClass,
} from '@impactra/shared';

describe('BlastRadiusTraversalService', () => {
  let service: BlastRadiusTraversalService;
  let edgePolicy: BlastRadiusEdgePolicy;

  beforeEach(() => {
    edgePolicy = new BlastRadiusEdgePolicy();
    service = new BlastRadiusTraversalService(edgePolicy);
  });

  const nodeA: GraphNode = {
    id: 'n-a',
    stableKey: 'file:src/utils.ts',
    name: 'utils.ts',
    path: 'src/utils.ts',
    type: DigitalTwinNodeType.FILE,
  };

  const nodeB: GraphNode = {
    id: 'n-b',
    stableKey: 'file:src/service.ts',
    name: 'service.ts',
    path: 'src/service.ts',
    type: DigitalTwinNodeType.FILE,
  };

  const nodeC: GraphNode = {
    id: 'n-c',
    stableKey: 'pkg:packages/api',
    name: 'api',
    path: 'packages/api',
    type: DigitalTwinNodeType.WORKSPACE_PACKAGE,
  };

  it('correctly discovers 1st order dependent when A changes and B imports A', () => {
    // Edge: B -(IMPORTS)-> A (B depends on A)
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    const result = service.traverse(roots, [nodeA, nodeB], edges, BlastRadiusSnapshotSide.AFTER);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].stableKey).toBe(nodeB.stableKey);
    expect(result.findings[0].impactClass).toBe(BlastRadiusImpactClass.FIRST_ORDER);
    expect(result.findings[0].depth).toBe(1);
    expect(result.evidencePaths).toHaveLength(1);
    expect(result.evidencePaths[0].rootStableKey).toBe(nodeA.stableKey);
    expect(result.evidencePaths[0].affectedStableKey).toBe(nodeB.stableKey);
  });

  it('correctly discovers transitive dependent at depth 2 (C imports B, B imports A)', () => {
    // B imports A, C imports B
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
      {
        id: 'e-2',
        sourceNodeId: nodeC.id,
        targetNodeId: nodeB.id,
        sourceStableKey: nodeC.stableKey,
        targetStableKey: nodeB.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    const result = service.traverse(roots, [nodeA, nodeB, nodeC], edges, BlastRadiusSnapshotSide.AFTER);

    expect(result.findings).toHaveLength(2);
    const findingB = result.findings.find((f) => f.stableKey === nodeB.stableKey);
    const findingC = result.findings.find((f) => f.stableKey === nodeC.stableKey);

    expect(findingB?.impactClass).toBe(BlastRadiusImpactClass.FIRST_ORDER);
    expect(findingB?.depth).toBe(1);
    expect(findingC?.impactClass).toBe(BlastRadiusImpactClass.TRANSITIVE);
    expect(findingC?.depth).toBe(2);
    expect(result.stats.firstOrderCount).toBe(1);
    expect(result.stats.transitiveCount).toBe(1);
  });

  it('handles cyclic dependencies deterministically without infinite loop', () => {
    // A -> B -> C -> A
    // Node B imports A, Node C imports B, Node A imports C
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
      {
        id: 'e-2',
        sourceNodeId: nodeC.id,
        targetNodeId: nodeB.id,
        sourceStableKey: nodeC.stableKey,
        targetStableKey: nodeB.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
      {
        id: 'e-3',
        sourceNodeId: nodeA.id,
        targetNodeId: nodeC.id,
        sourceStableKey: nodeA.stableKey,
        targetStableKey: nodeC.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    const result = service.traverse(roots, [nodeA, nodeB, nodeC], edges, BlastRadiusSnapshotSide.AFTER);

    // BFS should not re-visit A from C as an affected finding
    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((f) => f.stableKey).sort()).toEqual([nodeB.stableKey, nodeC.stableKey].sort());
  });

  it('respects maxDepth limit and halts traversal', () => {
    // B imports A, C imports B
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
      {
        id: 'e-2',
        sourceNodeId: nodeC.id,
        targetNodeId: nodeB.id,
        sourceStableKey: nodeC.stableKey,
        targetStableKey: nodeB.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    // Limit maxDepth to 1
    const result = service.traverse(roots, [nodeA, nodeB, nodeC], edges, BlastRadiusSnapshotSide.AFTER, {
      maxDepth: 1,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].stableKey).toBe(nodeB.stableKey);
    expect(result.findings.some((f) => f.stableKey === nodeC.stableKey)).toBe(false);
  });

  it('marks output as truncated when maxAffectedNodes is reached', () => {
    // B imports A, C imports B
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
      {
        id: 'e-2',
        sourceNodeId: nodeC.id,
        targetNodeId: nodeB.id,
        sourceStableKey: nodeC.stableKey,
        targetStableKey: nodeB.stableKey,
        type: DigitalTwinEdgeType.IMPORTS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    // Limit maxAffectedNodes to 1
    const result = service.traverse(roots, [nodeA, nodeB, nodeC], edges, BlastRadiusSnapshotSide.AFTER, {
      maxAffectedNodes: 1,
    });

    expect(result.truncated).toBe(true);
    expect(result.findings.length).toBeLessThanOrEqual(2);
  });

  it('ignores non-propagating edges such as CONTAINS', () => {
    const edges: GraphEdge[] = [
      {
        id: 'e-1',
        sourceNodeId: nodeB.id,
        targetNodeId: nodeA.id,
        sourceStableKey: nodeB.stableKey,
        targetStableKey: nodeA.stableKey,
        type: DigitalTwinEdgeType.CONTAINS,
      },
    ];

    const roots: TraversalRoot[] = [
      {
        stableKey: nodeA.stableKey,
        nodeType: nodeA.type,
        changeKind: 'MODIFIED',
        snapshotSide: BlastRadiusSnapshotSide.AFTER,
      },
    ];

    const result = service.traverse(roots, [nodeA, nodeB], edges, BlastRadiusSnapshotSide.AFTER);

    expect(result.findings).toHaveLength(0);
    expect(result.evidencePaths).toHaveLength(0);
  });
});
