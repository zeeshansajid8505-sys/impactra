import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { Prisma } from '@impactra/database';
import { StorageService } from '../../storage/storage.service';
import { IngestionQueueService } from '../queue/ingestion-queue.service';
import { RepositorySourceProvider } from './repository-source-provider.service';
import { TarReaderService, ExtractedFileEntry } from '../tar/tar-reader.service';
import { FileClassifierService, FileClassification } from '../parsers/file-classifier.service';
import { ManifestParserService } from '../parsers/manifest-parser.service';
import { ImportParserService } from '../parsers/import-parser.service';
import { DigitalTwinBuilderService } from './digital-twin-builder.service';
import {
  TriggerIngestionDto,
  ListIngestionsQueryDto,
  ListTwinNodesQueryDto,
  ListTwinEdgesQueryDto,
} from '../dto/ingestion.dto';
import {
  RepositoryIngestionDto,
  RepositoryIngestionListResponse,
  RepositorySnapshotDto,
  DigitalTwinSummaryResponse,
  DigitalTwinNodesResponse,
  DigitalTwinEdgesResponse,
  DigitalTwinNodeEntityDto,
  DigitalTwinEdgeDto,
  RepositoryFileCategory,
} from '@impactra/shared';

@Injectable()
export class IngestionOrchestratorService {
  private readonly logger = new Logger(IngestionOrchestratorService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly queueService: IngestionQueueService,
    private readonly sourceProvider: RepositorySourceProvider,
    private readonly tarReader: TarReaderService,
    private readonly fileClassifier: FileClassifierService,
    private readonly manifestParser: ManifestParserService,
    private readonly importParser: ImportParserService,
    private readonly twinBuilder: DigitalTwinBuilderService,
  ) {}

  /**
   * Triggers a new ingestion job for a connected repository.
   * Enforces tenancy, validates connection state, and prevents concurrent runs.
   */
  async triggerIngestion(
    organizationId: string,
    repositoryId: string,
    requestedByUserId?: string | null,
    dto: TriggerIngestionDto = {},
  ): Promise<RepositoryIngestionDto> {
    const repository = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        id: repositoryId,
        organizationId,
      },
      include: {
        installation: true,
      },
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository connection '${repositoryId}' not found in organization '${organizationId}'.`,
      );
    }

    if (!repository.connected) {
      throw new BadRequestException(
        `Repository '${repository.fullName}' is not connected. Connect the repository before triggering ingestion.`,
      );
    }

    if (!repository.available) {
      throw new BadRequestException(
        `Repository '${repository.fullName}' is no longer available in the GitHub installation.`,
      );
    }

    if (repository.installation && repository.installation.status !== 'ACTIVE') {
      throw new BadRequestException(
        `GitHub App installation for repository '${repository.fullName}' is ${repository.installation.status.toLowerCase()}. Ingestion cannot proceed.`,
      );
    }

    // Concurrency protection: Check for active ingestion
    const activeIngestion = await this.databaseService.client.repositoryIngestion.findFirst({
      where: {
        repositoryConnectionId: repositoryId,
        status: {
          in: ['QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING'],
        },
      },
    });

    if (activeIngestion) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `An ingestion job (${activeIngestion.id}) is already in progress for repository '${repository.fullName}' [status: ${activeIngestion.status}].`,
        activeIngestionId: activeIngestion.id,
        activeStatus: activeIngestion.status,
      });
    }

    const targetRef = (dto.ref || repository.defaultBranch || 'main').trim();

    try {
      // Create queued ingestion record
      const ingestion = await this.databaseService.client.repositoryIngestion.create({
        data: {
          organizationId,
          repositoryConnectionId: repositoryId,
          requestedByUserId,
          targetRef,
          commitSha: dto.commitSha || null,
          status: 'QUEUED',
          stage: 'QUEUED',
        },
      });

      // Enqueue job for background processing
      await this.queueService.enqueue(ingestion.id);

      return this.mapIngestionDto(ingestion);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `An ingestion job is already in progress for repository '${repository.fullName}'.`,
        });
      }
      throw error;
    }
  }

  /**
   * Retrieves an ingestion by ID.
   */
  async getIngestion(
    organizationId: string,
    repositoryId: string,
    ingestionId: string,
  ): Promise<RepositoryIngestionDto> {
    const ingestion = await this.databaseService.client.repositoryIngestion.findFirst({
      where: {
        id: ingestionId,
        organizationId,
        repositoryConnectionId: repositoryId,
      },
    });

    if (!ingestion) {
      throw new NotFoundException(
        `Ingestion '${ingestionId}' not found for repository '${repositoryId}'.`,
      );
    }

    return this.mapIngestionDto(ingestion);
  }

  /**
   * Lists ingestions for a repository with pagination and status filters.
   */
  async listIngestions(
    organizationId: string,
    repositoryId: string,
    query: ListIngestionsQueryDto,
  ): Promise<RepositoryIngestionListResponse> {
    const repository = await this.databaseService.client.repositoryConnection.findFirst({
      where: {
        id: repositoryId,
        organizationId,
      },
    });

    if (!repository) {
      throw new NotFoundException(
        `Repository connection '${repositoryId}' not found in organization '${organizationId}'.`,
      );
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      repositoryConnectionId: repositoryId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      this.databaseService.client.repositoryIngestion.count({ where }),
      this.databaseService.client.repositoryIngestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      ingestions: items.map((i) => this.mapIngestionDto(i)),
      total,
    };
  }

  /**
   * Retrieves the latest snapshot for a repository.
   */
  async getLatestSnapshot(
    organizationId: string,
    repositoryId: string,
  ): Promise<RepositorySnapshotDto> {
    const snapshot = await this.databaseService.client.repositorySnapshot.findFirst({
      where: {
        organizationId,
        repositoryConnectionId: repositoryId,
        ingestion: {
          status: 'SUCCEEDED',
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        fileInventories: true,
      },
    });

    if (!snapshot) {
      throw new NotFoundException(
        `No snapshots found for repository '${repositoryId}'. Trigger an ingestion to create one.`,
      );
    }

    return {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      repositoryConnectionId: snapshot.repositoryConnectionId,
      ingestionId: snapshot.ingestionId,
      commitSha: snapshot.commitSha,
      ref: snapshot.ref,
      sourceProvider: snapshot.sourceProvider,
      parserVersion: snapshot.parserVersion,
      artifactKey: snapshot.artifactKey,
      artifactSha256: snapshot.artifactSha256,
      sourceBytes: snapshot.sourceBytes,
      fileCount: snapshot.fileCount,
      createdAt: snapshot.createdAt.toISOString(),
      fileInventories: snapshot.fileInventories?.map((f) => ({
        id: f.id,
        repositorySnapshotId: f.repositorySnapshotId,
        path: f.path,
        contentSha256: f.contentSha256,
        byteSize: f.byteSize,
        language: f.language,
        isBinary: f.isBinary,
        category: f.category,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Retrieves the latest Digital Twin summary for a repository.
   */
  async getLatestDigitalTwin(
    organizationId: string,
    repositoryId: string,
  ): Promise<DigitalTwinSummaryResponse> {
    const twin = await this.databaseService.client.digitalTwinSnapshot.findFirst({
      where: {
        organizationId,
        repositoryConnectionId: repositoryId,
        repositorySnapshot: {
          ingestion: {
            status: 'SUCCEEDED',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        repositorySnapshot: {
          include: {
            fileInventories: true,
          },
        },
        nodes: true,
        edges: true,
      },
    });

    if (!twin) {
      throw new NotFoundException(
        `No digital twin snapshot found for repository '${repositoryId}'.`,
      );
    }

    const nodesByType: Record<string, number> = {};
    for (const node of twin.nodes) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    const edgesByType: Record<string, number> = {};
    for (const edge of twin.edges) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    const languageDistribution: Record<string, number> = {};
    for (const file of twin.repositorySnapshot.fileInventories) {
      if (file.language) {
        languageDistribution[file.language] = (languageDistribution[file.language] || 0) + 1;
      }
    }

    return {
      snapshot: {
        id: twin.id,
        organizationId: twin.organizationId,
        repositoryConnectionId: twin.repositoryConnectionId,
        repositorySnapshotId: twin.repositorySnapshotId,
        twinVersion: twin.twinVersion,
        nodeCount: twin.nodeCount,
        edgeCount: twin.edgeCount,
        createdAt: twin.createdAt.toISOString(),
      },
      repositorySnapshot: {
        id: twin.repositorySnapshot.id,
        organizationId: twin.repositorySnapshot.organizationId,
        repositoryConnectionId: twin.repositorySnapshot.repositoryConnectionId,
        ingestionId: twin.repositorySnapshot.ingestionId,
        commitSha: twin.repositorySnapshot.commitSha,
        ref: twin.repositorySnapshot.ref,
        sourceProvider: twin.repositorySnapshot.sourceProvider,
        parserVersion: twin.repositorySnapshot.parserVersion,
        artifactKey: twin.repositorySnapshot.artifactKey,
        artifactSha256: twin.repositorySnapshot.artifactSha256,
        sourceBytes: twin.repositorySnapshot.sourceBytes,
        fileCount: twin.repositorySnapshot.fileCount,
        createdAt: twin.repositorySnapshot.createdAt.toISOString(),
      },
      nodeCount: twin.nodeCount,
      edgeCount: twin.edgeCount,
      nodesByType,
      edgesByType,
      languageDistribution,
    };
  }

  /**
   * Lists nodes for the latest digital twin snapshot with pagination and filters.
   */
  async listTwinNodes(
    organizationId: string,
    repositoryId: string,
    query: ListTwinNodesQueryDto,
  ): Promise<DigitalTwinNodesResponse> {
    const twin = await this.databaseService.client.digitalTwinSnapshot.findFirst({
      where: {
        organizationId,
        repositoryConnectionId: repositoryId,
        repositorySnapshot: {
          ingestion: {
            status: 'SUCCEEDED',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!twin) {
      throw new NotFoundException(`No digital twin found for repository '${repositoryId}'.`);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      digitalTwinSnapshotId: twin.id,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { path: { contains: search, mode: 'insensitive' } },
        { stableKey: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, nodes] = await Promise.all([
      this.databaseService.client.digitalTwinNode.count({ where }),
      this.databaseService.client.digitalTwinNode.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        digitalTwinSnapshotId: n.digitalTwinSnapshotId,
        stableKey: n.stableKey,
        type: n.type as any,
        name: n.name,
        path: n.path,
        metadata: (n.metadata as Record<string, unknown>) || {},
        createdAt: n.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Lists edges for the latest digital twin snapshot with pagination and filters.
   */
  async listTwinEdges(
    organizationId: string,
    repositoryId: string,
    query: ListTwinEdgesQueryDto,
  ): Promise<DigitalTwinEdgesResponse> {
    const twin = await this.databaseService.client.digitalTwinSnapshot.findFirst({
      where: {
        organizationId,
        repositoryConnectionId: repositoryId,
        repositorySnapshot: {
          ingestion: {
            status: 'SUCCEEDED',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!twin) {
      throw new NotFoundException(`No digital twin found for repository '${repositoryId}'.`);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      digitalTwinSnapshotId: twin.id,
    };

    if (query.type) {
      where.type = query.type;
    }

    if (query.sourceNodeId) {
      where.sourceNodeId = query.sourceNodeId;
    }

    if (query.targetNodeId) {
      where.targetNodeId = query.targetNodeId;
    }

    const [total, edges] = await Promise.all([
      this.databaseService.client.digitalTwinEdge.count({ where }),
      this.databaseService.client.digitalTwinEdge.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: {
          sourceNode: true,
          targetNode: true,
        },
      }),
    ]);

    return {
      edges: edges.map((e) => ({
        id: e.id,
        digitalTwinSnapshotId: e.digitalTwinSnapshotId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        type: e.type as any,
        evidence: (e.evidence as Record<string, unknown>) || {},
        createdAt: e.createdAt.toISOString(),
        sourceNode: {
          id: e.sourceNode.id,
          digitalTwinSnapshotId: e.sourceNode.digitalTwinSnapshotId,
          stableKey: e.sourceNode.stableKey,
          type: e.sourceNode.type as any,
          name: e.sourceNode.name,
          path: e.sourceNode.path,
          metadata: (e.sourceNode.metadata as Record<string, unknown>) || {},
          createdAt: e.sourceNode.createdAt.toISOString(),
        },
        targetNode: {
          id: e.targetNode.id,
          digitalTwinSnapshotId: e.targetNode.digitalTwinSnapshotId,
          stableKey: e.targetNode.stableKey,
          type: e.targetNode.type as any,
          name: e.targetNode.name,
          path: e.targetNode.path,
          metadata: (e.targetNode.metadata as Record<string, unknown>) || {},
          createdAt: e.targetNode.createdAt.toISOString(),
        },
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Executes the end-to-end ingestion pipeline for an enqueued job.
   */
  async processIngestion(ingestionId: string): Promise<void> {
    const ingestion = await this.databaseService.client.repositoryIngestion.findUnique({
      where: { id: ingestionId },
      include: {
        repositoryConnection: true,
      },
    });

    if (!ingestion || ingestion.status === 'SUCCEEDED' || ingestion.status === 'FAILED') {
      return;
    }

    const repository = ingestion.repositoryConnection;
    const now = new Date();

    try {
      // Phase 1: FETCHING
      await this.updateIngestionState(ingestionId, {
        status: 'FETCHING',
        stage: 'FETCHING_ARCHIVE',
        startedAt: now,
      });

      const sourceArchive = await this.sourceProvider.fetchSourceArchive({
        organizationId: ingestion.organizationId,
        repositoryConnectionId: ingestion.repositoryConnectionId,
        ref: ingestion.targetRef,
        commitSha: ingestion.commitSha || undefined,
      });

      // Persist resolved commitSha
      await this.updateIngestionState(ingestionId, {
        commitSha: sourceArchive.commitSha,
      });

      // Phase 2: VALIDATING
      await this.updateIngestionState(ingestionId, {
        status: 'VALIDATING',
        stage: 'VALIDATING_SECURITY',
      });

      const extracted = this.tarReader.extract(sourceArchive.archiveBuffer);

      // Phase 3: INDEXING
      await this.updateIngestionState(ingestionId, {
        status: 'INDEXING',
        stage: 'INDEXING_FILES',
      });

      const classifications = new Map<string, FileClassification>();
      for (const file of extracted.files) {
        const cls = this.fileClassifier.classify(file.path, file.content);
        classifications.set(file.path, cls);
      }

      // Phase 4: BUILDING_TWIN
      await this.updateIngestionState(ingestionId, {
        status: 'BUILDING_TWIN',
        stage: 'BUILDING_TWIN',
      });

      const manifestAnalysis = this.manifestParser.parse(extracted.files);
      const workspaceNames = new Set(manifestAnalysis.workspacePackages.map((p) => p.name));
      const discoveredImports = this.importParser.parseImports(extracted.files, workspaceNames);

      const graph = this.twinBuilder.buildGraph({
        repositoryId: repository.id,
        repositoryFullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        files: extracted.files,
        classifications,
        manifestAnalysis,
        discoveredImports,
      });

      // Phase 5: STORING
      await this.updateIngestionState(ingestionId, {
        status: 'STORING',
        stage: 'STORING_SNAPSHOT',
      });

      // Store source archive in MinIO S3
      const artifactKey = `organizations/${ingestion.organizationId}/repositories/${repository.id}/snapshots/${ingestion.id}/source.tar.gz`;
      await this.storageService.putObject(
        artifactKey,
        sourceArchive.archiveBuffer,
        'application/gzip',
      );

      try {
        // Atomically persist snapshot, inventories, twin graph in database
        await this.databaseService.client.$transaction(async (tx) => {
        // 1. Snapshot
        const snapshot = await tx.repositorySnapshot.upsert({
          where: {
            repositoryConnectionId_commitSha_parserVersion: {
              repositoryConnectionId: repository.id,
              commitSha: sourceArchive.commitSha,
              parserVersion: 'digital-twin-parser-v1',
            },
          },
          update: {
            ingestionId,
            ref: sourceArchive.ref,
            artifactKey,
            artifactSha256: extracted.archiveSha256,
            sourceBytes: extracted.sourceBytes,
            fileCount: extracted.fileCount,
          },
          create: {
            organizationId: ingestion.organizationId,
            repositoryConnectionId: repository.id,
            ingestionId,
            commitSha: sourceArchive.commitSha,
            ref: sourceArchive.ref,
            sourceProvider: sourceArchive.sourceProvider,
            parserVersion: 'digital-twin-parser-v1',
            artifactKey,
            artifactSha256: extracted.archiveSha256,
            sourceBytes: extracted.sourceBytes,
            fileCount: extracted.fileCount,
          },
        });

        // 2. Clean previous inventories if re-ingested
        await tx.repositoryFileInventory.deleteMany({
          where: { repositorySnapshotId: snapshot.id },
        });

        // Bulk insert file inventories
        const inventoryData = extracted.files.map((file) => {
          const cls = classifications.get(file.path)!;
          return {
            repositorySnapshotId: snapshot.id,
            path: file.path,
            contentSha256: file.contentSha256,
            byteSize: file.byteSize,
            language: cls.language,
            isBinary: cls.isBinary,
            category: cls.category,
          };
        });

        if (inventoryData.length > 0) {
          await tx.repositoryFileInventory.createMany({
            data: inventoryData,
          });
        }

        // 3. Digital Twin Snapshot
        await tx.digitalTwinSnapshot.deleteMany({
          where: { repositorySnapshotId: snapshot.id },
        });

        const twinSnapshot = await tx.digitalTwinSnapshot.create({
          data: {
            organizationId: ingestion.organizationId,
            repositoryConnectionId: repository.id,
            repositorySnapshotId: snapshot.id,
            twinVersion: 'digital-twin-v1',
            nodeCount: graph.nodeCount,
            edgeCount: graph.edgeCount,
          },
        });

        // 4. Digital Twin Nodes
        const nodesData = graph.nodes.map((node) => ({
          digitalTwinSnapshotId: twinSnapshot.id,
          stableKey: node.stableKey,
          type: node.type,
          name: node.name,
          path: node.path,
          metadata: (node.metadata || {}) as Prisma.InputJsonObject,
        }));

        if (nodesData.length > 0) {
          await tx.digitalTwinNode.createMany({
            data: nodesData,
          });
        }

        // Look up created node IDs by stableKey for edge wiring
        const persistedNodes = await tx.digitalTwinNode.findMany({
          where: { digitalTwinSnapshotId: twinSnapshot.id },
          select: { id: true, stableKey: true },
        });

        const nodeKeyToId = new Map<string, string>();
        for (const n of persistedNodes) {
          nodeKeyToId.set(n.stableKey, n.id);
        }

        // 5. Digital Twin Edges
        const edgesData = graph.edges
          .map((edge) => {
            const sourceNodeId = nodeKeyToId.get(edge.sourceStableKey);
            const targetNodeId = nodeKeyToId.get(edge.targetStableKey);
            if (!sourceNodeId || !targetNodeId) return null;

            return {
              digitalTwinSnapshotId: twinSnapshot.id,
              sourceNodeId,
              targetNodeId,
              type: edge.type,
              evidence: (edge.evidence || {}) as Prisma.InputJsonObject,
            };
          })
          .filter((e): e is NonNullable<typeof e> => e !== null);

        if (edgesData.length > 0) {
          await tx.digitalTwinEdge.createMany({
            data: edgesData,
          });
        }
      });
    } catch (dbError) {
      // Safe cleanup of uploaded MinIO artifact
      try {
        await this.storageService.deleteObject(artifactKey);
      } catch (cleanupErr) {
        this.logger.warn(
          `Failed to clean up storage object ${artifactKey} after DB failure: ${cleanupErr}`,
        );
      }
      throw dbError;
    }

      // Phase 6: SUCCEEDED
      await this.updateIngestionState(ingestionId, {
        status: 'SUCCEEDED',
        stage: 'COMPLETED',
        completedAt: new Date(),
      });

      this.logger.log(
        `Successfully completed ingestion ${ingestionId} for ${repository.fullName} (${extracted.fileCount} files, ${graph.nodeCount} nodes, ${graph.edgeCount} edges)`,
      );
    } catch (err: unknown) {
      const sanitizedMessage = this.sanitizeErrorMessage(err);
      const failureCode = (err as any)?.name || 'INGESTION_ERROR';

      this.logger.error(`Ingestion ${ingestionId} failed: ${sanitizedMessage}`);

      await this.updateIngestionState(ingestionId, {
        status: 'FAILED',
        stage: 'FAILED',
        failureCode,
        failureMessage: sanitizedMessage,
        completedAt: new Date(),
      });
    }
  }

  private async updateIngestionState(
    id: string,
    data: {
      status?: any;
      stage?: string;
      commitSha?: string;
      startedAt?: Date;
      completedAt?: Date;
      failureCode?: string;
      failureMessage?: string;
    },
  ): Promise<void> {
    try {
      await this.databaseService.client.repositoryIngestion.update({
        where: { id },
        data,
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to update state for ingestion ${id}: ${err}`);
    }
  }

  private sanitizeErrorMessage(err: unknown): string {
    if (!err) return 'Unknown ingestion error';
    let msg = err instanceof Error ? err.message : String(err);
    // Remove potential tokens or long secrets
    msg = msg.replace(/(?:gh[pousr]_[A-Za-z0-9_]+)/g, '[REDACTED_TOKEN]');
    msg = msg.replace(/(?:bearer\s+[A-Za-z0-9_\-\.]+)/gi, '[REDACTED_AUTH]');
    return msg.slice(0, 1000);
  }

  private mapIngestionDto(record: any): RepositoryIngestionDto {
    return {
      id: record.id,
      organizationId: record.organizationId,
      repositoryConnectionId: record.repositoryConnectionId,
      requestedByUserId: record.requestedByUserId,
      targetRef: record.targetRef,
      commitSha: record.commitSha,
      status: record.status,
      stage: record.stage,
      startedAt: record.startedAt ? record.startedAt.toISOString() : null,
      completedAt: record.completedAt ? record.completedAt.toISOString() : null,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
