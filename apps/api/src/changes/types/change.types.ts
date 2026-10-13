import {
  ChangedFileStatus,
  TwinMappingSide,
  TwinMappingType,
  DependencyDeltaType,
  DigitalTwinEdgeType,
} from '@impactra/shared';

export interface ChangeJobPayload {
  changeRevisionId: string;
}

export interface RawPullRequestFile {
  sha: string;
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  blob_url?: string;
  raw_url?: string;
  contents_url?: string;
  patch?: string;
  previous_filename?: string;
}

export interface ProcessedChangedFile {
  oldPath: string | null;
  newPath: string | null;
  status: ChangedFileStatus;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  patchAvailable: boolean;
  patchTruncated: boolean;
  binary: boolean;
  rawPayload?: Record<string, any>;
}

export interface SnapshotAlignmentResult {
  status: 'ALIGNED' | 'WAITING';
  baseSnapshotId?: string;
  headSnapshotId?: string;
  waitingReason?: string;
}

export interface MappedTwinChangeRecord {
  changeRevisionId: string;
  changedFileId: string;
  side: TwinMappingSide;
  mappingType: TwinMappingType;
  repositorySnapshotId: string | null;
  digitalTwinSnapshotId?: string | null;
  digitalTwinNodeId: string | null;
  nodeStableKey: string | null;
  path: string;
}

export interface ComputedDependencyDeltaRecord {
  changeRevisionId: string;
  deltaType: DependencyDeltaType;
  sourceStableKey: string;
  targetStableKey: string;
  edgeType: DigitalTwinEdgeType;
  beforeEvidence?: Record<string, any> | null;
  afterEvidence?: Record<string, any> | null;
}
