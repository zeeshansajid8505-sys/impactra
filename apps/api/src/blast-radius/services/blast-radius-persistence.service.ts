import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  Prisma,
  DigitalTwinNodeType,
  DigitalTwinEdgeType,
  BlastRadiusSnapshotSide,
  BlastRadiusImpactClass,
  BlastRadiusCategory,
  BlastRadiusAnalysisStatus,
  ChangedFileStatus,
} from '@impactra/database';
import {
  BlastRadiusAnalysisDto,
  BlastRadiusFindingDto,
  BlastRadiusEvidencePathDto,
  BlastRadiusRootDto,
  BlastRadiusFindingsResponse,
  BlastRadiusEvidencePathsResponse,
  BlastRadiusAnalysesListResponse,
  PathNodeDto,
  PathEdgeDto,
  ChangeSetDto,
  ChangeRevisionDto,
  ChangeRevisionStatus,
} from '@impactra/shared';
import {
  GraphNode,
  GraphEdge,
  TraversalRoot,
  TraversalOutput,
} from './blast-radius-traversal.service';

/**
 * Calculates the deterministic hop count for a stored evidence path.
 * Hop count represents the number of dependency edges traversed in the path.
 */
export function getEvidenceHopCount(
  depth: number,
  pathEdgesJson?: Prisma.JsonValue,
): number {
  if (Array.isArray(pathEdgesJson)) {
    return pathEdgesJson.length;
  }
  if (typeof depth === 'number' && Number.isFinite(depth) && depth >= 0) {
    return depth;
  }
  return 0;
}

export function parsePathNodes(json: Prisma.JsonValue): PathNodeDto[] {
  if (!Array.isArray(json)) return [];
  const nodes: PathNodeDto[] = [];
  for (const item of json) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const obj = item as Record<string, Prisma.JsonValue>;
      if (typeof obj.stableKey === 'string' && typeof obj.name === 'string') {
        nodes.push({
          stableKey: obj.stableKey,
          name: obj.name,
          type: (typeof obj.type === 'string' ? obj.type : 'FILE') as DigitalTwinNodeType,
          path: typeof obj.path === 'string' ? obj.path : null,
        });
      }
    }
  }
  return nodes;
}

export function parsePathEdges(json: Prisma.JsonValue): PathEdgeDto[] {
  if (!Array.isArray(json)) return [];
  const edges: PathEdgeDto[] = [];
  for (const item of json) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const obj = item as Record<string, Prisma.JsonValue>;
      if (typeof obj.sourceStableKey === 'string' && typeof obj.targetStableKey === 'string') {
        edges.push({
          sourceStableKey: obj.sourceStableKey,
          targetStableKey: obj.targetStableKey,
          edgeType: (typeof obj.edgeType === 'string' ? obj.edgeType : 'IMPORTS') as DigitalTwinEdgeType,
          direction: obj.direction === 'DIRECT' ? 'DIRECT' : 'REVERSE_DEPENDENCY',
        });
      }
    }
  }
  return edges;
}

export interface ListFindingsFilter {
  page?: number;
  limit?: number;
  category?: string;
  impactClass?: string;
  depth?: number;
  snapshotSide?: string;
  search?: string;
}

export interface ListEvidencePathsFilter {
  page?: number;
  limit?: number;
  findingId?: string;
  rootStableKey?: string;
  affectedStableKey?: string;
}

export interface ListAnalysesFilter {
  page?: number;
  limit?: number;
  repositoryId?: string;
  status?: string;
}

export interface PersistedAnalysisInput {
  id: string;
  organizationId: string;
  changeSetId: string;
  changeRevisionId: string;
  baseDigitalTwinSnapshotId?: string | null;
  headDigitalTwinSnapshotId?: string | null;
  status: BlastRadiusAnalysisStatus;
  analysisVersion: string;
  maxDepth: number;
  rootCount: number;
  affectedNodeCount: number;
  firstOrderCount: number;
  transitiveCount: number;
  evidencePathCount: number;
  truncated: boolean;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  changeSet?: {
    id: string;
    organizationId: string;
    repositoryConnectionId?: string | null;
    provider?: string;
    providerPullRequestId?: string;
    pullRequestNumber?: number;
    title?: string;
    authorLogin?: string | null;
    baseRef?: string;
    headRef?: string;
    currentBaseSha: string;
    currentHeadSha: string;
    state?: string;
    isDraft?: boolean;
    isMerged?: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
    repositoryConnection?: {
      id: string;
      name: string;
      fullName: string;
    } | null;
  } | null;
  changeRevision?: {
    id: string;
    changeSetId: string;
    organizationId: string;
    repositoryConnectionId?: string | null;
    baseSha: string;
    headSha: string;
    baseSnapshotId?: string | null;
    headSnapshotId?: string | null;
    analysisVersion: string;
    status: string;
    stage: string;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed: number;
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    failureCode?: string | null;
    failureMessage?: string | null;
    queuedAt: Date | string;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
  roots?: Array<{
    id: string;
    analysisId: string;
    twinChangeMappingId?: string | null;
    snapshotSide: BlastRadiusSnapshotSide;
    digitalTwinNodeId?: string | null;
    stableKey: string;
    nodeType: DigitalTwinNodeType;
    changeKind: ChangedFileStatus;
    createdAt: Date | string;
  }>;
}

@Injectable()
export class BlastRadiusPersistenceService {
  private readonly logger = new Logger(BlastRadiusPersistenceService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Authoritative root derivation from Phase 06 TwinChangeMapping evidence.
   */
  async deriveRoots(changeRevisionId: string): Promise<TraversalRoot[]> {
    const mappings = await this.databaseService.client.twinChangeMapping.findMany({
      where: {
        changeRevisionId,
        mappingType: { not: 'NOT_PRESENT' },
      },
      include: {
        changedFile: true,
        digitalTwinNode: true,
      },
    });

    const rootMap = new Map<string, TraversalRoot>();

    for (const mapping of mappings) {
      if (!mapping.nodeStableKey) continue;

      const fileStatus = mapping.changedFile.status;
      // DELETED files use BASE snapshot; ADDED, MODIFIED, RENAMED use HEAD snapshot
      const snapshotSide: BlastRadiusSnapshotSide =
        fileStatus === 'DELETED' ? 'BASE' : 'HEAD';

      const key = `${snapshotSide}:${mapping.nodeStableKey}`;
      if (!rootMap.has(key)) {
        if (!mapping.digitalTwinNode) {
          this.logger.warn(
            `Skipping root candidate '${mapping.nodeStableKey}' for mapping '${mapping.id}': missing corresponding DigitalTwinNode evidence.`,
          );
          continue;
        }

        const nodeType: DigitalTwinNodeType = mapping.digitalTwinNode.type;

        rootMap.set(key, {
          twinChangeMappingId: mapping.id,
          digitalTwinNodeId: mapping.digitalTwinNodeId || null,
          stableKey: mapping.nodeStableKey,
          nodeType,
          changeKind: fileStatus,
          snapshotSide,
        });
      }
    }

    return Array.from(rootMap.values()).sort((a, b) =>
      a.stableKey.localeCompare(b.stableKey),
    );
  }

  /**
   * Loads in-memory graph nodes and edges for a given DigitalTwinSnapshot.
   */
  async loadDigitalTwinGraph(
    digitalTwinSnapshotId: string,
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const [dbNodes, dbEdges] = await Promise.all([
      this.databaseService.client.digitalTwinNode.findMany({
        where: { digitalTwinSnapshotId },
      }),
      this.databaseService.client.digitalTwinEdge.findMany({
        where: { digitalTwinSnapshotId },
        include: {
          sourceNode: true,
          targetNode: true,
        },
      }),
    ]);

    const nodes: GraphNode[] = dbNodes.map((n) => ({
      id: n.id,
      stableKey: n.stableKey,
      name: n.name,
      path: n.path,
      type: n.type as DigitalTwinNodeType,
    }));

    const edges: GraphEdge[] = dbEdges
      .filter((e) => e.sourceNode && e.targetNode)
      .map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceStableKey: e.sourceNode.stableKey,
        targetStableKey: e.targetNode.stableKey,
        type: e.type,
      }));

    return { nodes, edges };
  }

  /**
   * Persists computed blast-radius analysis, roots, findings, and evidence paths transactionally.
   */
  async persistAnalysisResult(
    analysisId: string,
    roots: TraversalRoot[],
    traversalOutput: TraversalOutput,
  ): Promise<void> {
    const { findings, evidencePaths, truncated, stats } = traversalOutput;

    await this.databaseService.client.$transaction(async (tx) => {
      // 1. Clean existing sub-records if this is a re-run
      await tx.blastRadiusEvidencePath.deleteMany({ where: { analysisId } });
      await tx.blastRadiusFinding.deleteMany({ where: { analysisId } });
      await tx.blastRadiusRoot.deleteMany({ where: { analysisId } });

      // 2. Persist Roots
      const rootRecords: Array<{ id: string; snapshotSide: BlastRadiusSnapshotSide; stableKey: string }> = [];
      for (const r of roots) {
        const rootRecord = await tx.blastRadiusRoot.create({
          data: {
            analysisId,
            twinChangeMappingId: r.twinChangeMappingId || null,
            snapshotSide: r.snapshotSide,
            digitalTwinNodeId: r.digitalTwinNodeId || null,
            stableKey: r.stableKey,
            nodeType: r.nodeType,
            changeKind: r.changeKind as ChangedFileStatus,
          },
        });
        rootRecords.push(rootRecord);
      }

      // Map root stableKey to root record ID for relational linking
      const rootIdMap = new Map<string, string>();
      for (const rec of rootRecords) {
        rootIdMap.set(`${rec.snapshotSide}:${rec.stableKey}`, rec.id);
      }

      // 3. Persist Findings
      const findingIdMap = new Map<string, string>();
      for (const f of findings) {
        const linkedRootId = f.rootId || rootIdMap.get(`${f.snapshotSide}:${f.stableKey}`) || null;
        const findingRecord = await tx.blastRadiusFinding.create({
          data: {
            analysisId,
            rootId: linkedRootId,
            digitalTwinNodeId: f.digitalTwinNodeId || null,
            stableKey: f.stableKey,
            nodeName: f.nodeName,
            nodePath: f.nodePath,
            nodeType: f.nodeType,
            category: f.category,
            impactClass: f.impactClass,
            depth: f.depth,
            reasonCode: f.reasonCode,
            reasonSummary: f.reasonSummary,
            snapshotSide: f.snapshotSide,
          },
        });
        findingIdMap.set(f.stableKey, findingRecord.id);
      }

      // 4. Persist Evidence Paths
      for (const ep of evidencePaths) {
        const findingId = findingIdMap.get(ep.affectedStableKey);
        if (!findingId) continue;

        await tx.blastRadiusEvidencePath.create({
          data: {
            analysisId,
            findingId,
            rootStableKey: ep.rootStableKey,
            affectedStableKey: ep.affectedStableKey,
            snapshotSide: ep.snapshotSide,
            depth: ep.depth,
            pathNodesJson: ep.pathNodes.map((n) => ({
              stableKey: n.stableKey,
              name: n.name,
              type: n.type,
              path: n.path,
            })),
            pathEdgesJson: ep.pathEdges.map((e) => ({
              sourceStableKey: e.sourceStableKey,
              targetStableKey: e.targetStableKey,
              edgeType: e.edgeType,
              direction: e.direction,
            })),
          },
        });
      }

      // 5. Update BlastRadiusAnalysis header to SUCCEEDED
      await tx.blastRadiusAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'SUCCEEDED',
          rootCount: stats.rootCount,
          affectedNodeCount: stats.affectedNodeCount,
          firstOrderCount: stats.firstOrderCount,
          transitiveCount: stats.transitiveCount,
          evidencePathCount: stats.evidencePathCount,
          truncated,
          completedAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
    });
  }

  /**
   * Retrieves the latest analysis for a change set with tenant isolation.
   */
  async getLatestAnalysis(
    organizationId: string,
    changeSetId: string,
  ): Promise<BlastRadiusAnalysisDto | null> {
    const analysis = await this.databaseService.client.blastRadiusAnalysis.findFirst({
      where: {
        organizationId,
        changeSetId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        roots: true,
        changeSet: true,
        changeRevision: true,
      },
    });

    if (!analysis) return null;
    return this.mapAnalysisDto(analysis);
  }

  /**
   * Retrieves an analysis by ID scoped to organization and changeSet.
   */
  async getAnalysisById(
    organizationId: string,
    changeSetId: string,
    analysisId: string,
  ): Promise<BlastRadiusAnalysisDto> {
    const analysis = await this.databaseService.client.blastRadiusAnalysis.findFirst({
      where: {
        id: analysisId,
        organizationId,
        changeSetId,
      },
      include: {
        roots: true,
        changeSet: true,
        changeRevision: true,
      },
    });

    if (!analysis) {
      throw new NotFoundException(
        `Blast radius analysis '${analysisId}' not found for change set '${changeSetId}'.`,
      );
    }

    return this.mapAnalysisDto(analysis);
  }

  /**
   * Lists paginated and filtered findings for an analysis.
   */
  async listFindings(
    organizationId: string,
    changeSetId: string,
    analysisId: string,
    filter: ListFindingsFilter,
  ): Promise<BlastRadiusFindingsResponse> {
    // Verify parent analysis belongs to tenant
    await this.getAnalysisById(organizationId, changeSetId, analysisId);

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.BlastRadiusFindingWhereInput = { analysisId };
    if (filter.category) where.category = filter.category as BlastRadiusCategory;
    if (filter.impactClass) where.impactClass = filter.impactClass as BlastRadiusImpactClass;
    if (filter.depth) where.depth = filter.depth;
    if (filter.snapshotSide) where.snapshotSide = filter.snapshotSide as BlastRadiusSnapshotSide;
    if (filter.search) {
      const term = filter.search.trim();
      where.OR = [
        { stableKey: { contains: term, mode: 'insensitive' } },
        { nodeName: { contains: term, mode: 'insensitive' } },
        { nodePath: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.databaseService.client.blastRadiusFinding.count({ where }),
      this.databaseService.client.blastRadiusFinding.findMany({
        where,
        orderBy: [{ depth: 'asc' }, { stableKey: 'asc' }],
        skip,
        take: limit,
        include: {
          evidencePaths: {
            take: 5,
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((f) => ({
        id: f.id,
        analysisId: f.analysisId,
        rootId: f.rootId,
        digitalTwinNodeId: f.digitalTwinNodeId,
        stableKey: f.stableKey,
        nodeName: f.nodeName,
        nodePath: f.nodePath,
        nodeType: f.nodeType,
        category: f.category,
        impactClass: f.impactClass,
        depth: f.depth,
        reasonCode: f.reasonCode,
        reasonSummary: f.reasonSummary,
        snapshotSide: f.snapshotSide,
        createdAt: f.createdAt.toISOString(),
        evidencePaths: f.evidencePaths?.map((ep) => ({
          id: ep.id,
          analysisId: ep.analysisId,
          findingId: ep.findingId,
          rootStableKey: ep.rootStableKey,
          affectedStableKey: ep.affectedStableKey,
          snapshotSide: ep.snapshotSide,
          depth: ep.depth,
          hopCount: getEvidenceHopCount(ep.depth, ep.pathEdgesJson),
          pathNodes: parsePathNodes(ep.pathNodesJson),
          pathEdges: parsePathEdges(ep.pathEdgesJson),
          createdAt: ep.createdAt.toISOString(),
        })),
      })),
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
    };
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
    await this.getAnalysisById(organizationId, changeSetId, analysisId);

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.BlastRadiusEvidencePathWhereInput = { analysisId };
    if (filter.findingId) where.findingId = filter.findingId;
    if (filter.rootStableKey) where.rootStableKey = filter.rootStableKey;
    if (filter.affectedStableKey) where.affectedStableKey = filter.affectedStableKey;

    const [total, items] = await Promise.all([
      this.databaseService.client.blastRadiusEvidencePath.count({ where }),
      this.databaseService.client.blastRadiusEvidencePath.findMany({
        where,
        orderBy: [{ depth: 'asc' }, { rootStableKey: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((ep) => ({
        id: ep.id,
        analysisId: ep.analysisId,
        findingId: ep.findingId,
        rootStableKey: ep.rootStableKey,
        affectedStableKey: ep.affectedStableKey,
        snapshotSide: ep.snapshotSide,
        depth: ep.depth,
        hopCount: getEvidenceHopCount(ep.depth, ep.pathEdgesJson),
        pathNodes: parsePathNodes(ep.pathNodesJson),
        pathEdges: parsePathEdges(ep.pathEdgesJson),
        createdAt: ep.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
    };
  }

  /**
   * Lists organization-scoped analyses across all change sets. Powers /intelligence/blast-radius page.
   */
  async listAnalyses(
    organizationId: string,
    filter: ListAnalysesFilter,
  ): Promise<BlastRadiusAnalysesListResponse> {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.BlastRadiusAnalysisWhereInput = { organizationId };
    if (filter.status) where.status = filter.status as BlastRadiusAnalysisStatus;
    if (filter.repositoryId) {
      where.changeSet = { repositoryConnectionId: filter.repositoryId };
    }

    const [total, items] = await Promise.all([
      this.databaseService.client.blastRadiusAnalysis.count({ where }),
      this.databaseService.client.blastRadiusAnalysis.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          changeSet: {
            include: {
              repositoryConnection: true,
            },
          },
          changeRevision: true,
          roots: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((a) => this.mapAnalysisDto(a)),
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
    };
  }

  mapAnalysisDto(a: PersistedAnalysisInput): BlastRadiusAnalysisDto {
    const toIso = (d: Date | string | null | undefined): string | null => {
      if (!d) return null;
      return typeof d === 'string' ? d : d.toISOString();
    };

    return {
      id: a.id,
      organizationId: a.organizationId,
      changeSetId: a.changeSetId,
      changeRevisionId: a.changeRevisionId,
      baseDigitalTwinSnapshotId: a.baseDigitalTwinSnapshotId || null,
      headDigitalTwinSnapshotId: a.headDigitalTwinSnapshotId || null,
      status: a.status,
      analysisVersion: a.analysisVersion,
      maxDepth: a.maxDepth,
      rootCount: a.rootCount,
      affectedNodeCount: a.affectedNodeCount,
      firstOrderCount: a.firstOrderCount,
      transitiveCount: a.transitiveCount,
      totalAffectedNodes: a.affectedNodeCount,
      firstOrderAffectedNodes: a.firstOrderCount,
      transitiveAffectedNodes: a.transitiveCount,
      evidencePathCount: a.evidencePathCount,
      truncated: a.truncated,
      startedAt: toIso(a.startedAt),
      completedAt: toIso(a.completedAt),
      failureCode: a.failureCode || null,
      failureMessage: a.failureMessage || null,
      createdAt: toIso(a.createdAt) || new Date().toISOString(),
      updatedAt: toIso(a.updatedAt) || new Date().toISOString(),
      changeSet:
        a.changeSet &&
        typeof a.changeSet.repositoryConnectionId === 'string' &&
        a.changeSet.repositoryConnectionId.length > 0
          ? {
              id: a.changeSet.id,
              organizationId: a.changeSet.organizationId,
              repositoryConnectionId: a.changeSet.repositoryConnectionId,
              provider: a.changeSet.provider || 'GITHUB',
              providerPullRequestId: a.changeSet.providerPullRequestId || '',
              pullRequestNumber: a.changeSet.pullRequestNumber || 0,
              title: a.changeSet.title || '',
              authorLogin: a.changeSet.authorLogin || '',
              baseRef: a.changeSet.baseRef || '',
              headRef: a.changeSet.headRef || '',
              currentBaseSha: a.changeSet.currentBaseSha,
              currentHeadSha: a.changeSet.currentHeadSha,
              state: a.changeSet.state || 'OPEN',
              isDraft: a.changeSet.isDraft || false,
              isMerged: a.changeSet.isMerged || false,
              createdAt: toIso(a.changeSet.createdAt) || new Date().toISOString(),
              updatedAt: toIso(a.changeSet.updatedAt) || new Date().toISOString(),
              repository: a.changeSet.repositoryConnection
                ? {
                    id: a.changeSet.repositoryConnection.id,
                    name: a.changeSet.repositoryConnection.name,
                    fullName: a.changeSet.repositoryConnection.fullName,
                  }
                : undefined,
            }
          : undefined,
      changeRevision:
        a.changeRevision &&
        typeof a.changeRevision.repositoryConnectionId === 'string' &&
        a.changeRevision.repositoryConnectionId.length > 0
          ? {
              id: a.changeRevision.id,
              changeSetId: a.changeRevision.changeSetId,
              organizationId: a.changeRevision.organizationId,
              repositoryConnectionId: a.changeRevision.repositoryConnectionId,
              baseSha: a.changeRevision.baseSha,
              headSha: a.changeRevision.headSha,
              baseSnapshotId: a.changeRevision.baseSnapshotId || null,
              headSnapshotId: a.changeRevision.headSnapshotId || null,
              analysisVersion: a.changeRevision.analysisVersion,
              status: (a.changeRevision.status as ChangeRevisionStatus) || 'QUEUED',
              stage: a.changeRevision.stage,
              filesAdded: a.changeRevision.filesAdded,
              filesModified: a.changeRevision.filesModified,
              filesDeleted: a.changeRevision.filesDeleted,
              filesRenamed: a.changeRevision.filesRenamed,
              nodesAdded: a.changeRevision.nodesAdded,
              nodesRemoved: a.changeRevision.nodesRemoved,
              nodesModified: a.changeRevision.nodesModified,
              edgesAdded: a.changeRevision.edgesAdded,
              edgesRemoved: a.changeRevision.edgesRemoved,
              failureCode: a.changeRevision.failureCode || null,
              failureMessage: a.changeRevision.failureMessage || null,
              queuedAt: toIso(a.changeRevision.queuedAt) || new Date().toISOString(),
              startedAt: toIso(a.changeRevision.startedAt),
              completedAt: toIso(a.changeRevision.completedAt),
              createdAt: toIso(a.changeRevision.createdAt) || new Date().toISOString(),
              updatedAt: toIso(a.changeRevision.updatedAt) || new Date().toISOString(),
            }
          : undefined,
      roots: a.roots?.map((r) => ({
        id: r.id,
        analysisId: r.analysisId,
        twinChangeMappingId: r.twinChangeMappingId || null,
        snapshotSide: r.snapshotSide,
        digitalTwinNodeId: r.digitalTwinNodeId || null,
        stableKey: r.stableKey,
        nodeType: r.nodeType,
        changeKind: r.changeKind,
        createdAt: toIso(r.createdAt) || new Date().toISOString(),
      })),
    };
  }
}
