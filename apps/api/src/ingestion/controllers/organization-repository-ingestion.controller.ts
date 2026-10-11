import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { TenantGuard } from '../../organizations/guards/tenant.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permission } from '../../authorization/permissions.enum';
import { User } from '@impactra/database';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
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
} from '@impactra/shared';

@ApiTags('Repository Ingestion & Digital Twin')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId/repositories/:repositoryId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationRepositoryIngestionController {
  constructor(private readonly orchestratorService: IngestionOrchestratorService) {}

  @Post('ingestions')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(Permission.INGESTION_TRIGGER)
  @ApiOperation({
    summary: 'Trigger repository source ingestion and digital twin generation',
    description:
      'Enqueues an asynchronous ingestion job to fetch source code, validate security limits, index file inventories, and build the architectural digital twin.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 202, description: 'Ingestion job successfully queued' })
  @ApiResponse({ status: 409, description: 'An ingestion job is already running for this repository' })
  async triggerIngestion(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @CurrentUser() user: User,
    @Body() dto: TriggerIngestionDto,
  ): Promise<RepositoryIngestionDto> {
    return this.orchestratorService.triggerIngestion(
      organizationId,
      repositoryId,
      user?.id,
      dto,
    );
  }

  @Get('ingestions')
  @RequirePermissions(Permission.INGESTION_READ)
  @ApiOperation({
    summary: 'List repository ingestion jobs',
    description: 'Lists all past and active ingestion jobs for the repository with status filtering.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 200, description: 'Paginated list of repository ingestions' })
  async listIngestions(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @Query() query: ListIngestionsQueryDto,
  ): Promise<RepositoryIngestionListResponse> {
    return this.orchestratorService.listIngestions(organizationId, repositoryId, query);
  }

  @Get('ingestions/:ingestionId')
  @RequirePermissions(Permission.INGESTION_READ)
  @ApiOperation({
    summary: 'Get repository ingestion details and progress',
    description: 'Retrieves current status, stage progress, and failure diagnostics for a specific ingestion job.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiParam({ name: 'ingestionId', description: 'Ingestion job ID' })
  @ApiResponse({ status: 200, description: 'Repository ingestion details' })
  async getIngestion(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @Param('ingestionId') ingestionId: string,
  ): Promise<RepositoryIngestionDto> {
    return this.orchestratorService.getIngestion(organizationId, repositoryId, ingestionId);
  }

  @Get('snapshots/latest')
  @RequirePermissions(Permission.INGESTION_READ)
  @ApiOperation({
    summary: 'Get latest repository snapshot and file inventory',
    description: 'Retrieves the most recent immutable snapshot metadata and detailed file inventory.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 200, description: 'Latest repository snapshot details' })
  async getLatestSnapshot(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
  ): Promise<RepositorySnapshotDto> {
    return this.orchestratorService.getLatestSnapshot(organizationId, repositoryId);
  }

  @Get('digital-twin/latest')
  @RequirePermissions(Permission.DIGITAL_TWIN_READ)
  @ApiOperation({
    summary: 'Get latest Software Digital Twin summary',
    description:
      'Retrieves graph vertex/edge counts, language distribution, and architectural breakdown for the latest snapshot.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 200, description: 'Digital twin summary graph metadata' })
  async getLatestDigitalTwin(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
  ): Promise<DigitalTwinSummaryResponse> {
    return this.orchestratorService.getLatestDigitalTwin(organizationId, repositoryId);
  }

  @Get('digital-twin/latest/nodes')
  @RequirePermissions(Permission.DIGITAL_TWIN_READ)
  @ApiOperation({
    summary: 'Query digital twin nodes',
    description: 'Returns paginated and filtered nodes (packages, files, dependencies, configs) of the digital twin graph.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 200, description: 'Paginated digital twin nodes' })
  async listTwinNodes(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @Query() query: ListTwinNodesQueryDto,
  ): Promise<DigitalTwinNodesResponse> {
    return this.orchestratorService.listTwinNodes(organizationId, repositoryId, query);
  }

  @Get('digital-twin/latest/edges')
  @RequirePermissions(Permission.DIGITAL_TWIN_READ)
  @ApiOperation({
    summary: 'Query digital twin dependency edges',
    description: 'Returns paginated and filtered directed edges (imports, containment, package dependencies) of the digital twin graph.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Connected repository ID' })
  @ApiResponse({ status: 200, description: 'Paginated digital twin edges' })
  async listTwinEdges(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @Query() query: ListTwinEdgesQueryDto,
  ): Promise<DigitalTwinEdgesResponse> {
    return this.orchestratorService.listTwinEdges(organizationId, repositoryId, query);
  }
}
