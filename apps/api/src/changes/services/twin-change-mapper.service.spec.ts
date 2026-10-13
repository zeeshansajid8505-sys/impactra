import { TwinChangeMapperService } from './twin-change-mapper.service';
import { DatabaseService } from '../../database/database.service';
import {
  ChangedFileStatus,
  TwinMappingSide,
  TwinMappingType,
} from '@impactra/shared';

describe('TwinChangeMapperService', () => {
  let service: TwinChangeMapperService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        changedFile: {
          findMany: jest.fn(),
        },
        digitalTwinNode: {
          findMany: jest.fn(),
        },
      },
    };

    service = new TwinChangeMapperService(mockDb as DatabaseService);
  });

  it('maps ADDED file to head node with EXACT_PATH and side AFTER', async () => {
    mockDb.client.changedFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-1',
        newPath: 'src/components/Card.tsx',
        oldPath: null,
        status: ChangedFileStatus.ADDED,
      },
    ]);

    mockDb.client.digitalTwinNode.findMany
      .mockResolvedValueOnce([]) // baseNodes empty
      .mockResolvedValueOnce([
        {
          id: 'node-head-1',
          snapshotId: 'head-snap',
          stableKey: 'file:src/components/Card.tsx',
          path: 'src/components/Card.tsx',
          type: 'FILE',
        },
      ]); // headNodes

    const mappings = await service.mapTwinChanges({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(mappings).toHaveLength(2);
    expect(mappings[0].changedFileId).toBe('file-1');
    expect(mappings[0].side).toBe(TwinMappingSide.BEFORE);
    expect(mappings[0].mappingType).toBe(TwinMappingType.NOT_PRESENT);
    expect(mappings[0].digitalTwinNodeId).toBeNull();

    expect(mappings[1].changedFileId).toBe('file-1');
    expect(mappings[1].side).toBe(TwinMappingSide.AFTER);
    expect(mappings[1].mappingType).toBe(TwinMappingType.EXACT_PATH);
    expect(mappings[1].digitalTwinNodeId).toBe('node-head-1');
    expect(mappings[1].nodeStableKey).toBe('file:src/components/Card.tsx');
  });

  it('maps DELETED file to base node with EXACT_PATH and side BEFORE', async () => {
    mockDb.client.changedFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-2',
        oldPath: 'src/legacy.ts',
        newPath: null,
        status: ChangedFileStatus.DELETED,
      },
    ]);

    mockDb.client.digitalTwinNode.findMany
      .mockResolvedValueOnce([
        {
          id: 'node-base-2',
          snapshotId: 'base-snap',
          stableKey: 'file:src/legacy.ts',
          path: 'src/legacy.ts',
          type: 'FILE',
        },
      ]) // baseNodes
      .mockResolvedValueOnce([]); // headNodes

    const mappings = await service.mapTwinChanges({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(mappings).toHaveLength(2);
    expect(mappings[0].changedFileId).toBe('file-2');
    expect(mappings[0].side).toBe(TwinMappingSide.BEFORE);
    expect(mappings[0].mappingType).toBe(TwinMappingType.EXACT_PATH);
    expect(mappings[0].digitalTwinNodeId).toBe('node-base-2');
    expect(mappings[0].nodeStableKey).toBe('file:src/legacy.ts');

    expect(mappings[1].changedFileId).toBe('file-2');
    expect(mappings[1].side).toBe(TwinMappingSide.AFTER);
    expect(mappings[1].mappingType).toBe(TwinMappingType.NOT_PRESENT);
    expect(mappings[1].digitalTwinNodeId).toBeNull();
  });

  it('maps RENAMED file to base node (BEFORE) and head node (AFTER) with RENAMED_PATH', async () => {
    mockDb.client.changedFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-3',
        oldPath: 'src/util-old.ts',
        newPath: 'src/util-new.ts',
        status: ChangedFileStatus.RENAMED,
      },
    ]);

    mockDb.client.digitalTwinNode.findMany
      .mockResolvedValueOnce([
        {
          id: 'node-base-3',
          snapshotId: 'base-snap',
          stableKey: 'file:src/util-old.ts',
          path: 'src/util-old.ts',
          type: 'FILE',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'node-head-3',
          snapshotId: 'head-snap',
          stableKey: 'file:src/util-new.ts',
          path: 'src/util-new.ts',
          type: 'FILE',
        },
      ]);

    const mappings = await service.mapTwinChanges({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(mappings).toHaveLength(2);
    // BEFORE side
    expect(mappings[0].side).toBe(TwinMappingSide.BEFORE);
    expect(mappings[0].mappingType).toBe(TwinMappingType.RENAMED_PATH);
    expect(mappings[0].digitalTwinNodeId).toBe('node-base-3');
    expect(mappings[0].path).toBe('src/util-old.ts');

    // AFTER side
    expect(mappings[1].side).toBe(TwinMappingSide.AFTER);
    expect(mappings[1].mappingType).toBe(TwinMappingType.RENAMED_PATH);
    expect(mappings[1].digitalTwinNodeId).toBe('node-head-3');
    expect(mappings[1].path).toBe('src/util-new.ts');
  });

  it('maps MODIFIED file to base node (BEFORE) and head node (AFTER) with EXACT_PATH', async () => {
    mockDb.client.changedFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-4',
        oldPath: 'src/service.ts',
        newPath: 'src/service.ts',
        status: ChangedFileStatus.MODIFIED,
      },
    ]);

    mockDb.client.digitalTwinNode.findMany
      .mockResolvedValueOnce([
        {
          id: 'node-base-4',
          snapshotId: 'base-snap',
          stableKey: 'file:src/service.ts',
          path: 'src/service.ts',
          type: 'FILE',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'node-head-4',
          snapshotId: 'head-snap',
          stableKey: 'file:src/service.ts',
          path: 'src/service.ts',
          type: 'FILE',
        },
      ]);

    const mappings = await service.mapTwinChanges({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(mappings).toHaveLength(2);
    expect(mappings[0].side).toBe(TwinMappingSide.BEFORE);
    expect(mappings[0].mappingType).toBe(TwinMappingType.EXACT_PATH);
    expect(mappings[0].digitalTwinNodeId).toBe('node-base-4');

    expect(mappings[1].side).toBe(TwinMappingSide.AFTER);
    expect(mappings[1].mappingType).toBe(TwinMappingType.EXACT_PATH);
    expect(mappings[1].digitalTwinNodeId).toBe('node-head-4');
  });

  it('assigns NOT_PRESENT when file is not in twin graph', async () => {
    mockDb.client.changedFile.findMany.mockResolvedValueOnce([
      {
        id: 'file-5',
        oldPath: null,
        newPath: 'docs/README.md',
        status: ChangedFileStatus.ADDED,
      },
    ]);

    mockDb.client.digitalTwinNode.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const mappings = await service.mapTwinChanges({
      changeRevisionId: 'rev-1',
      baseSnapshotId: 'base-snap',
      headSnapshotId: 'head-snap',
    });

    expect(mappings).toHaveLength(2);
    expect(mappings[0].side).toBe(TwinMappingSide.BEFORE);
    expect(mappings[0].mappingType).toBe(TwinMappingType.NOT_PRESENT);
    expect(mappings[0].digitalTwinNodeId).toBeNull();

    expect(mappings[1].side).toBe(TwinMappingSide.AFTER);
    expect(mappings[1].mappingType).toBe(TwinMappingType.NOT_PRESENT);
    expect(mappings[1].digitalTwinNodeId).toBeNull();
  });
});
