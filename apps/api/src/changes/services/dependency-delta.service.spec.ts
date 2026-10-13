import { DependencyDeltaService } from './dependency-delta.service';
import { DatabaseService } from '../../database/database.service';
import { DependencyDeltaType } from '@impactra/shared';

describe('DependencyDeltaService', () => {
  let service: DependencyDeltaService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        digitalTwinEdge: {
          findMany: jest.fn(),
        },
      },
    };

    service = new DependencyDeltaService(mockDb as DatabaseService);
  });

  it('computes EDGE_ADDED and EDGE_REMOVED deltas correctly', async () => {
    // Base edges: A -> B
    const baseEdges = [
      {
        id: 'edge-1',
        snapshotId: 'base-snap',
        sourceId: 'node-a',
        targetId: 'node-b',
        type: 'IMPORTS',
        evidence: { importType: 'named' },
        sourceNode: { stableKey: 'file:src/a.ts', name: 'a.ts', type: 'FILE' },
        targetNode: { stableKey: 'file:src/b.ts', name: 'b.ts', type: 'FILE' },
      },
    ];

    // Head edges: A -> C
    const headEdges = [
      {
        id: 'edge-2',
        snapshotId: 'head-snap',
        sourceId: 'node-a',
        targetId: 'node-c',
        type: 'IMPORTS',
        evidence: { importType: 'named' },
        sourceNode: { stableKey: 'file:src/a.ts', name: 'a.ts', type: 'FILE' },
        targetNode: { stableKey: 'file:src/c.ts', name: 'c.ts', type: 'FILE' },
      },
    ];

    mockDb.client.digitalTwinEdge.findMany
      .mockResolvedValueOnce(baseEdges)
      .mockResolvedValueOnce(headEdges);

    const deltas = await service.computeDependencyDeltas({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(deltas).toHaveLength(2);

    const removed = deltas.find((d) => d.deltaType === DependencyDeltaType.EDGE_REMOVED);
    expect(removed).toBeDefined();
    expect(removed!.sourceStableKey).toBe('file:src/a.ts');
    expect(removed!.targetStableKey).toBe('file:src/b.ts');
    expect(removed!.edgeType).toBe('IMPORTS');

    const added = deltas.find((d) => d.deltaType === DependencyDeltaType.EDGE_ADDED);
    expect(added).toBeDefined();
    expect(added!.sourceStableKey).toBe('file:src/a.ts');
    expect(added!.targetStableKey).toBe('file:src/c.ts');
    expect(added!.edgeType).toBe('IMPORTS');
  });

  it('verifies exact controlled fixture scenario: service.ts -> util.ts to new-util.ts, react to zod', async () => {
    const baseEdges = [
      {
        id: 'b-e1',
        snapshotId: 'base-snap',
        sourceId: 's1',
        targetId: 'u1',
        type: 'IMPORTS',
        evidence: { importPath: './util' },
        sourceNode: { stableKey: 'file:src/service.ts', name: 'service.ts', type: 'FILE' },
        targetNode: { stableKey: 'file:src/util.ts', name: 'util.ts', type: 'FILE' },
      },
      {
        id: 'b-e2',
        snapshotId: 'base-snap',
        sourceId: 'pkg1',
        targetId: 'dep-react',
        type: 'DECLARES_DEPENDENCY',
        evidence: { version: '^18.0.0' },
        sourceNode: { stableKey: 'pkg:app', name: 'app', type: 'WORKSPACE_PACKAGE' },
        targetNode: { stableKey: 'dep:react', name: 'react', type: 'EXTERNAL_DEPENDENCY' },
      },
    ];

    const headEdges = [
      {
        id: 'h-e1',
        snapshotId: 'head-snap',
        sourceId: 's1',
        targetId: 'u2',
        type: 'IMPORTS',
        evidence: { importPath: './new-util' },
        sourceNode: { stableKey: 'file:src/service.ts', name: 'service.ts', type: 'FILE' },
        targetNode: { stableKey: 'file:src/new-util.ts', name: 'new-util.ts', type: 'FILE' },
      },
      {
        id: 'h-e2',
        snapshotId: 'head-snap',
        sourceId: 'pkg1',
        targetId: 'dep-react',
        type: 'DECLARES_DEPENDENCY',
        evidence: { version: '^18.0.0' },
        sourceNode: { stableKey: 'pkg:app', name: 'app', type: 'WORKSPACE_PACKAGE' },
        targetNode: { stableKey: 'dep:react', name: 'react', type: 'EXTERNAL_DEPENDENCY' },
      },
      {
        id: 'h-e3',
        snapshotId: 'head-snap',
        sourceId: 'pkg1',
        targetId: 'dep-zod',
        type: 'DECLARES_DEPENDENCY',
        evidence: { version: '^3.22.0' },
        sourceNode: { stableKey: 'pkg:app', name: 'app', type: 'WORKSPACE_PACKAGE' },
        targetNode: { stableKey: 'dep:zod', name: 'zod', type: 'EXTERNAL_DEPENDENCY' },
      },
    ];

    mockDb.client.digitalTwinEdge.findMany
      .mockResolvedValueOnce(baseEdges)
      .mockResolvedValueOnce(headEdges);

    const deltas = await service.computeDependencyDeltas({
      changeRevisionId: 'rev-fixture',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(deltas).toHaveLength(3);

    const edgesRemoved = deltas.filter((d) => d.deltaType === DependencyDeltaType.EDGE_REMOVED);
    expect(edgesRemoved).toHaveLength(1);
    expect(edgesRemoved[0].targetStableKey).toBe('file:src/util.ts');

    const edgesAdded = deltas.filter((d) => d.deltaType === DependencyDeltaType.EDGE_ADDED);
    expect(edgesAdded).toHaveLength(2);
    expect(edgesAdded.map((e) => e.targetStableKey)).toContain('file:src/new-util.ts');
    expect(edgesAdded.map((e) => e.targetStableKey)).toContain('dep:zod');
  });
});
