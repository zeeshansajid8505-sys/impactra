import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  ChangedFileStatus,
  TwinMappingSide,
  TwinMappingType,
} from '@impactra/shared';
import { MappedTwinChangeRecord } from '../types/change.types';

export interface MapTwinChangesInput {
  changeRevisionId: string;
  baseSnapshotId: string;
  headSnapshotId: string;
}

@Injectable()
export class TwinChangeMapperService {
  private readonly logger = new Logger(TwinChangeMapperService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Deterministically maps changed files to digital twin nodes in base and head snapshots.
   */
  async mapTwinChanges(input: MapTwinChangesInput): Promise<MappedTwinChangeRecord[]> {
    const { changeRevisionId, baseSnapshotId, headSnapshotId } = input;

    // 1. Fetch all changed files for this revision
    const changedFiles = await this.databaseService.client.changedFile.findMany({
      where: { changeRevisionId },
    });

    if (changedFiles.length === 0) {
      return [];
    }

    // 2. Fetch base snapshot digital twin nodes
    const baseNodes = await this.databaseService.client.digitalTwinNode.findMany({
      where: {
        OR: [
          { digitalTwinSnapshotId: baseSnapshotId },
          { snapshot: { repositorySnapshotId: baseSnapshotId } },
        ],
      },
    });

    // 3. Fetch head snapshot digital twin nodes
    const headNodes = await this.databaseService.client.digitalTwinNode.findMany({
      where: {
        OR: [
          { digitalTwinSnapshotId: headSnapshotId },
          { snapshot: { repositorySnapshotId: headSnapshotId } },
        ],
      },
    });

    // Build lookup maps for fast deterministic matching
    const baseByPath = new Map<string, (typeof baseNodes)[0]>();
    const baseByKey = new Map<string, (typeof baseNodes)[0]>();
    for (const node of baseNodes) {
      if (node.path) {
        baseByPath.set(node.path, node);
      }
      baseByKey.set(node.stableKey, node);
    }

    const headByPath = new Map<string, (typeof headNodes)[0]>();
    const headByKey = new Map<string, (typeof headNodes)[0]>();
    for (const node of headNodes) {
      if (node.path) {
        headByPath.set(node.path, node);
      }
      headByKey.set(node.stableKey, node);
    }

    const mappings: MappedTwinChangeRecord[] = [];

    for (const file of changedFiles) {
      const status = file.status as ChangedFileStatus;

      if (status === ChangedFileStatus.ADDED) {
        const path = file.newPath || file.oldPath || '';
        const headNode =
          headByPath.get(path) ||
          headByKey.get(`file:${path}`) ||
          headByKey.get(`cfg:${path}`);

        // BEFORE side: NOT_PRESENT
        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.BEFORE,
          mappingType: TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: baseSnapshotId,
          digitalTwinNodeId: null,
          nodeStableKey: null,
          path,
        });

        // AFTER side: exact head node
        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.AFTER,
          mappingType: headNode ? TwinMappingType.EXACT_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: headSnapshotId,
          digitalTwinNodeId: headNode?.id || null,
          nodeStableKey: headNode?.stableKey || null,
          path,
        });
      } else if (status === ChangedFileStatus.DELETED) {
        const path = file.oldPath || file.newPath || '';
        const baseNode =
          baseByPath.get(path) ||
          baseByKey.get(`file:${path}`) ||
          baseByKey.get(`cfg:${path}`);

        // BEFORE side: exact base node
        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.BEFORE,
          mappingType: baseNode ? TwinMappingType.EXACT_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: baseSnapshotId,
          digitalTwinNodeId: baseNode?.id || null,
          nodeStableKey: baseNode?.stableKey || null,
          path,
        });

        // AFTER side: NOT_PRESENT
        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.AFTER,
          mappingType: TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: headSnapshotId,
          digitalTwinNodeId: null,
          nodeStableKey: null,
          path,
        });
      } else if (status === ChangedFileStatus.RENAMED) {
        // BEFORE side (old path)
        const oldPath = file.oldPath || '';
        const baseNode =
          baseByPath.get(oldPath) ||
          baseByKey.get(`file:${oldPath}`) ||
          baseByKey.get(`cfg:${oldPath}`);

        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.BEFORE,
          mappingType: baseNode ? TwinMappingType.RENAMED_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: baseSnapshotId,
          digitalTwinNodeId: baseNode?.id || null,
          nodeStableKey: baseNode?.stableKey || null,
          path: oldPath,
        });

        // AFTER side (new path)
        const newPath = file.newPath || '';
        const headNode =
          headByPath.get(newPath) ||
          headByKey.get(`file:${newPath}`) ||
          headByKey.get(`cfg:${newPath}`);

        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.AFTER,
          mappingType: headNode ? TwinMappingType.RENAMED_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: headSnapshotId,
          digitalTwinNodeId: headNode?.id || null,
          nodeStableKey: headNode?.stableKey || null,
          path: newPath,
        });
      } else {
        // MODIFIED
        const filePath = file.newPath || file.oldPath || '';

        const baseNode =
          baseByPath.get(filePath) ||
          baseByKey.get(`file:${filePath}`) ||
          baseByKey.get(`cfg:${filePath}`);

        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.BEFORE,
          mappingType: baseNode ? TwinMappingType.EXACT_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: baseSnapshotId,
          digitalTwinNodeId: baseNode?.id || null,
          nodeStableKey: baseNode?.stableKey || null,
          path: filePath,
        });

        const headNode =
          headByPath.get(filePath) ||
          headByKey.get(`file:${filePath}`) ||
          headByKey.get(`cfg:${filePath}`);

        mappings.push({
          changeRevisionId,
          changedFileId: file.id,
          side: TwinMappingSide.AFTER,
          mappingType: headNode ? TwinMappingType.EXACT_PATH : TwinMappingType.NOT_PRESENT,
          repositorySnapshotId: headSnapshotId,
          digitalTwinNodeId: headNode?.id || null,
          nodeStableKey: headNode?.stableKey || null,
          path: filePath,
        });
      }
    }

    return mappings;
  }
}
