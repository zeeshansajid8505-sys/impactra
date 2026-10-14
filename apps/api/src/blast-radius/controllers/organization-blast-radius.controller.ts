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
import { BlastRadiusAnalysisService } from '../services/blast-radius-analysis.service';
import {
  TriggerBlastRadiusDto,
  ListFindingsQueryDto,
  ListEvidencePathsQueryDto,
  ListAnalysesQueryDto,
} from '../dto/blast-radius.dto';
import {
  BlastRadiusAnalysisDto,
  BlastRadiusAnalysisSummaryResponse,
  BlastRadiusFindingsResponse,
  BlastRadiusEvidencePathsResponse,
  BlastRadiusAnalysesListResponse,
} from '@impactra/shared';

@ApiTags('Blast Radius Intelligence')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationBlastRadiusController {
  constructor(private readonly blastRadiusService: BlastRadiusAnalysisService) {}

  @Post(['changes/:changeSetId/blast-radius', 'changes/:changeSetId/blast-radius/analyze'])
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BLAST_RADIUS_ANALYZE)
  @ApiOperation({
    summary: 'Trigger or retry deterministic blast-radius analysis',
    description:
      'Enqueues an asynchronous blast-radius traversal job to calculate first-order and transitive dependents for a completed change revision.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({ status: 200, description: 'Blast radius analysis initiated or retrieved' })
  @ApiResponse({ status: 400, description: 'Change revision is not in SUCCEEDED state' })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async triggerAnalysis(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Body() dto: TriggerBlastRadiusDto,
  ): Promise<
    BlastRadiusAnalysisDto & {
      success: boolean;
      analysisId: string;
      analysis: BlastRadiusAnalysisDto;
    }
  > {
    const analysis = await this.blastRadiusService.triggerAnalysis(
      organizationId,
      changeSetId,
      dto.force,
    );
    return {
      success: true,
      analysisId: analysis.id,
      analysis,
      ...analysis,
    };
  }

  @Get('changes/:changeSetId/blast-radius/latest')
  @RequirePermissions(Permission.BLAST_RADIUS_READ)
  @ApiOperation({
    summary: 'Get latest blast-radius analysis summary for a change set',
    description:
      'Retrieves the most recent deterministic blast radius metrics, root count, first-order, and transitive counts.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({ status: 200, description: 'Latest blast radius analysis summary' })
  @ApiResponse({ status: 404, description: 'No analysis found for this change set' })
  async getLatestSummary(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
  ): Promise<BlastRadiusAnalysisSummaryResponse> {
    return this.blastRadiusService.getLatestSummary(organizationId, changeSetId);
  }

  @Get('changes/:changeSetId/blast-radius/:analysisId')
  @RequirePermissions(Permission.BLAST_RADIUS_READ)
  @ApiOperation({
    summary: 'Get specific blast-radius analysis details',
    description: 'Retrieves an immutable blast-radius analysis by ID.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'analysisId', description: 'Blast radius analysis ID' })
  @ApiResponse({ status: 200, description: 'Blast radius analysis details' })
  @ApiResponse({ status: 404, description: 'Analysis not found' })
  async getAnalysis(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('analysisId') analysisId: string,
  ): Promise<BlastRadiusAnalysisDto> {
    const analysis = await this.blastRadiusService.getAnalysis(
      organizationId,
      changeSetId,
      analysisId,
    );
    return {
      ...analysis,
      totalAffectedNodes: analysis.affectedNodeCount,
      firstOrderAffectedNodes: analysis.firstOrderCount,
      transitiveAffectedNodes: analysis.transitiveCount,
    };
  }

  @Get('changes/:changeSetId/blast-radius/:analysisId/findings')
  @RequirePermissions(Permission.BLAST_RADIUS_READ)
  @ApiOperation({
    summary: 'List paginated affected entity findings for a blast-radius analysis',
    description:
      'Returns deterministic first-order and transitive affected components with filtering by category and impact class.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'analysisId', description: 'Blast radius analysis ID' })
  @ApiResponse({ status: 200, description: 'Paginated blast radius findings' })
  async listFindings(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('analysisId') analysisId: string,
    @Query() query: ListFindingsQueryDto,
  ): Promise<BlastRadiusFindingsResponse> {
    return this.blastRadiusService.listFindings(
      organizationId,
      changeSetId,
      analysisId,
      query,
    );
  }

  @Get('changes/:changeSetId/blast-radius/:analysisId/evidence-paths')
  @RequirePermissions(Permission.BLAST_RADIUS_READ)
  @ApiOperation({
    summary: 'List verifiable dependency evidence paths for an analysis',
    description:
      'Returns immutable evidence paths demonstrating step-by-step propagation from changed roots to affected entities.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'analysisId', description: 'Blast radius analysis ID' })
  @ApiResponse({ status: 200, description: 'Paginated blast radius evidence paths' })
  async listEvidencePaths(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('analysisId') analysisId: string,
    @Query() query: ListEvidencePathsQueryDto,
  ): Promise<BlastRadiusEvidencePathsResponse> {
    return this.blastRadiusService.listEvidencePaths(
      organizationId,
      changeSetId,
      analysisId,
      query,
    );
  }

  @Get('blast-radius')
  @RequirePermissions(Permission.BLAST_RADIUS_READ)
  @ApiOperation({
    summary: 'List organization blast-radius analyses across pull requests',
    description:
      'Lists recent blast-radius analysis summaries across all repository change sets for the organization.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiResponse({ status: 200, description: 'List of blast radius analyses' })
  async listAnalyses(
    @Param('organizationId') organizationId: string,
    @Query() query: ListAnalysesQueryDto,
  ): Promise<BlastRadiusAnalysesListResponse> {
    return this.blastRadiusService.listOrganizationAnalyses(organizationId, query);
  }
}
