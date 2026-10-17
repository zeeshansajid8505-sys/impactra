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
import { ReleaseSafetyAnalysisService } from '../services/release-safety-analysis.service';
import { ReleaseSafetyPersistenceService } from '../services/release-safety-persistence.service';
import {
  EvaluateReleaseSafetyDto,
  ListReleaseSafetySignalsQueryDto,
  ListReleaseSafetyAssessmentsQueryDto,
} from '../dto/release-safety.dto';
import {
  ReleaseSafetyAssessmentDto,
  ReleaseSafetyLatestResponseDto,
  ReleaseSafetySignalsResponseDto,
  ReleaseSafetyAssessmentsListResponseDto,
} from '@impactra/shared';

@ApiTags('Release Safety Intelligence')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationReleaseSafetyController {
  constructor(
    private readonly analysisService: ReleaseSafetyAnalysisService,
    private readonly persistenceService: ReleaseSafetyPersistenceService,
  ) {}

  @Post([
    'changes/:changeSetId/release-safety',
    'changes/:changeSetId/release-safety/evaluate',
  ])
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.RELEASE_SAFETY_EVALUATE)
  @ApiOperation({
    summary: 'Trigger or retry deterministic release safety evaluation',
    description:
      'Evaluates transparent release safety rules and policy thresholds against change evidence and blast-radius graph findings.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'Release safety evaluation initiated or retrieved',
  })
  @ApiResponse({
    status: 400,
    description: 'Prerequisite Blast Radius analysis not completed',
  })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async evaluateReleaseSafety(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Body() body?: EvaluateReleaseSafetyDto,
  ): Promise<ReleaseSafetyAssessmentDto> {
    const force = body?.force === true;
    return this.analysisService.triggerEvaluation(
      organizationId,
      changeSetId,
      force,
    );
  }

  @Get([
    'changes/:changeSetId/release-safety',
    'changes/:changeSetId/release-safety/latest',
  ])
  @RequirePermissions(Permission.RELEASE_SAFETY_READ)
  @ApiOperation({
    summary: 'Get latest release safety assessment for change set',
    description:
      'Retrieves the most recent deterministic release safety decision and score for the change set revision.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'Latest release safety assessment retrieved',
  })
  async getLatestAssessment(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
  ): Promise<ReleaseSafetyLatestResponseDto> {
    return this.persistenceService.getLatestAssessment(
      organizationId,
      changeSetId,
    );
  }

  @Get('release-safety/assessments/:assessmentId')
  @RequirePermissions(Permission.RELEASE_SAFETY_READ)
  @ApiOperation({
    summary: 'Get release safety assessment by ID',
    description:
      'Retrieves a release safety assessment with top evaluated signals.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'assessmentId', description: 'Assessment ID' })
  @ApiResponse({ status: 200, description: 'Assessment found' })
  @ApiResponse({ status: 404, description: 'Assessment not found' })
  async getAssessmentById(
    @Param('organizationId') organizationId: string,
    @Param('assessmentId') assessmentId: string,
  ): Promise<ReleaseSafetyAssessmentDto> {
    return this.persistenceService.getAssessmentById(
      organizationId,
      assessmentId,
    );
  }

  @Get('release-safety/assessments/:assessmentId/signals')
  @RequirePermissions(Permission.RELEASE_SAFETY_READ)
  @ApiOperation({
    summary: 'List signals for a release safety assessment',
    description:
      'Retrieves paginated, deterministic rule signals contributing to the risk score and release decision.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'assessmentId', description: 'Assessment ID' })
  @ApiResponse({ status: 200, description: 'Signals listed' })
  async listSignals(
    @Param('organizationId') organizationId: string,
    @Param('assessmentId') assessmentId: string,
    @Query() query: ListReleaseSafetySignalsQueryDto,
  ): Promise<ReleaseSafetySignalsResponseDto> {
    return this.persistenceService.listSignals(
      organizationId,
      assessmentId,
      query,
    );
  }

  @Get('release-safety/assessments')
  @RequirePermissions(Permission.RELEASE_SAFETY_READ)
  @ApiOperation({
    summary: 'List release safety assessments across organization',
    description:
      'Retrieves paginated assessments filtered by decision, risk level, or status.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiResponse({ status: 200, description: 'Assessments listed' })
  async listAssessments(
    @Param('organizationId') organizationId: string,
    @Query() query: ListReleaseSafetyAssessmentsQueryDto,
  ): Promise<ReleaseSafetyAssessmentsListResponseDto> {
    return this.persistenceService.listAssessments(organizationId, query);
  }
}
