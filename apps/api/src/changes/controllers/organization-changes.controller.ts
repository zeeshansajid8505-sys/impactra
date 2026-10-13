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
import { Permission } from '../../authorization/permissions.enum';
import { ChangeOrchestratorService } from '../services/change-orchestrator.service';
import {
  ListChangeSetsQueryDto,
  ListChangeRevisionsQueryDto,
  ListChangedFilesQueryDto,
  ListTwinChangeMappingsQueryDto,
  ListDependencyDeltasQueryDto,
  SyncPullRequestDto,
} from '../dto/changes.dto';
import {
  ChangeSetDto,
  ChangeRevisionDto,
  ChangeSetListResponse,
  ChangeRevisionListResponse,
  ChangedFilesResponse,
  TwinChangeMappingsResponse,
  DependencyDeltaResponse,
} from '@impactra/shared';

@ApiTags('Pull Request & Change Intelligence')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationChangesController {
  constructor(private readonly orchestratorService: ChangeOrchestratorService) {}

  @Get('changes')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'List pull request change sets',
    description: 'Retrieves all pull requests and change sets tracked for the organization with pagination and filters.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiResponse({ status: 200, description: 'List of change sets' })
  async listChangeSets(
    @Param('organizationId') organizationId: string,
    @Query() query: ListChangeSetsQueryDto,
  ): Promise<ChangeSetListResponse> {
    return this.orchestratorService.listChangeSets(organizationId, query);
  }

  @Get('changes/:changeSetId')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'Get pull request change set details',
    description: 'Retrieves metadata and latest analysis revision for a specific pull request change set.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({ status: 200, description: 'Change set details' })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async getChangeSet(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
  ): Promise<ChangeSetDto> {
    return this.orchestratorService.getChangeSet(organizationId, changeSetId);
  }

  @Get('changes/:changeSetId/revisions')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'List immutable revisions for a change set',
    description: 'Returns all commit-pair analysis revisions generated for a pull request change set.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({ status: 200, description: 'List of change revisions' })
  async listChangeRevisions(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Query() query: ListChangeRevisionsQueryDto,
  ): Promise<ChangeRevisionListResponse> {
    return this.orchestratorService.listChangeRevisions(organizationId, changeSetId, query);
  }

  @Get('changes/:changeSetId/revisions/:revisionId')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'Get specific change revision details',
    description: 'Retrieves an immutable change analysis revision by ID.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'revisionId', description: 'Revision ID' })
  @ApiResponse({ status: 200, description: 'Revision details' })
  @ApiResponse({ status: 404, description: 'Revision not found' })
  async getChangeRevision(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('revisionId') revisionId: string,
  ): Promise<ChangeRevisionDto> {
    return this.orchestratorService.getChangeRevision(organizationId, changeSetId, revisionId);
  }

  @Get('changes/:changeSetId/revisions/:revisionId/files')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'List changed files for a revision',
    description: 'Returns the file-level diff inventory and status for the change revision.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'revisionId', description: 'Revision ID' })
  @ApiResponse({ status: 200, description: 'Changed files list' })
  async listChangedFiles(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: ListChangedFilesQueryDto,
  ): Promise<ChangedFilesResponse> {
    return this.orchestratorService.listChangedFiles(
      organizationId,
      changeSetId,
      revisionId,
      query,
    );
  }

  @Get('changes/:changeSetId/revisions/:revisionId/twin-mappings')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'List digital twin node mappings for a revision',
    description: 'Returns the before/after mappings between changed files and digital twin nodes.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'revisionId', description: 'Revision ID' })
  @ApiResponse({ status: 200, description: 'Digital twin mappings list' })
  async listTwinChangeMappings(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: ListTwinChangeMappingsQueryDto,
  ): Promise<TwinChangeMappingsResponse> {
    return this.orchestratorService.listTwinChangeMappings(
      organizationId,
      changeSetId,
      revisionId,
      query,
    );
  }

  @Get('changes/:changeSetId/revisions/:revisionId/dependency-deltas')
  @RequirePermissions(Permission.CHANGE_READ)
  @ApiOperation({
    summary: 'List dependency deltas for a revision',
    description: 'Returns direct graph EDGE_ADDED and EDGE_REMOVED deltas between base and head digital twins.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'revisionId', description: 'Revision ID' })
  @ApiResponse({ status: 200, description: 'Dependency deltas list' })
  async listDependencyDeltas(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: ListDependencyDeltasQueryDto,
  ): Promise<DependencyDeltaResponse> {
    return this.orchestratorService.listDependencyDeltas(
      organizationId,
      changeSetId,
      revisionId,
      query,
    );
  }

  @Post('repositories/:repositoryId/changes/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(Permission.CHANGE_SYNC)
  @ApiOperation({
    summary: 'Synchronize or trigger change intelligence analysis for a pull request',
    description: 'Fetches the pull request from GitHub, establishes base and head snapshots, and starts change analysis.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryId', description: 'Repository connection ID' })
  @ApiResponse({ status: 202, description: 'Pull request synchronization initiated' })
  async syncPullRequest(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
    @Body() dto: SyncPullRequestDto,
  ): Promise<ChangeSetDto> {
    return this.orchestratorService.syncPullRequest(organizationId, repositoryId, dto.prNumber);
  }
}
