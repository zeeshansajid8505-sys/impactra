import {
  Controller,
  Query,
  Get,
  Post,
  Patch,
  Param,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { TenantGuard } from '../../organizations/guards/tenant.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { Permission } from '../../authorization/permissions.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@impactra/database';
import { ReleasePolicyService } from '../services/release-policy.service';
import {
  CreateReleasePolicyDto,
  UpdateReleasePolicyDto,
  PreviewReleasePolicyDto,
  ListReleasePoliciesQueryDto,
} from '../dto/release-policy.dto';
import {
  ReleasePolicyDto,
  ReleasePolicyPreviewDto,
  EffectiveReleasePolicyDto,
} from '@impactra/shared';

@ApiTags('Release Policies & Enforcement')
@ApiCookieAuth('impactra_session')
@Controller(['organizations/:organizationId', 'api/v1/organizations/:organizationId'])
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationReleasePolicyController {
  constructor(private readonly releasePolicyService: ReleasePolicyService) {}

  @Get('release-policies')
  @RequirePermissions(Permission.RELEASE_POLICY_READ)
  @ApiOperation({
    summary: 'List release policies for organization',
    description: 'Retrieves all release policies configured in the organization.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiResponse({ status: 200, description: 'Policies retrieved successfully' })
  async listPolicies(
    @Param('organizationId') organizationId: string,
    @Query() query: ListReleasePoliciesQueryDto,
  ): Promise<ReleasePolicyDto[]> {
    return this.releasePolicyService.listPolicies(organizationId, {
      repositoryConnectionId: query.repositoryConnectionId,
      status: query.status,
      isDefault: query.isDefault,
    });
  }

  @Post('release-policies')
  @RequirePermissions(Permission.RELEASE_POLICY_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new DRAFT release policy',
    description: 'Creates a new versioned DRAFT release policy with deterministic rule set.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiResponse({ status: 201, description: 'Policy created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error in rule configuration' })
  async createPolicy(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateReleasePolicyDto,
  ): Promise<ReleasePolicyDto> {
    return this.releasePolicyService.createDraftPolicy(
      organizationId,
      user.id,
      dto,
    );
  }

  @Get('release-policies/:policyId')
  @RequirePermissions(Permission.RELEASE_POLICY_READ)
  @ApiOperation({
    summary: 'Get release policy details',
    description: 'Retrieves full policy details including ordered rules and audit event ledger.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'policyId', description: 'Release policy ID' })
  @ApiResponse({ status: 200, description: 'Policy retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async getPolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
  ): Promise<ReleasePolicyDto> {
    return this.releasePolicyService.getPolicy(organizationId, policyId);
  }

  @Patch('release-policies/:policyId')
  @RequirePermissions(Permission.RELEASE_POLICY_UPDATE)
  @ApiOperation({
    summary: 'Update DRAFT release policy',
    description: 'Updates policy metadata and rules. Only DRAFT policies can be modified.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'policyId', description: 'Release policy ID' })
  @ApiResponse({ status: 200, description: 'Policy updated successfully' })
  @ApiResponse({ status: 400, description: 'Policy is not in DRAFT status or validation failed' })
  async updatePolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateReleasePolicyDto,
  ): Promise<ReleasePolicyDto> {
    return this.releasePolicyService.updateDraftPolicy(
      organizationId,
      policyId,
      user.id,
      dto,
    );
  }

  @Post('release-policies/:policyId/activate')
  @RequirePermissions(Permission.RELEASE_POLICY_ACTIVATE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate release policy',
    description: 'Activates DRAFT policy and supersedes conflicting previous active versions atomically.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'policyId', description: 'Release policy ID' })
  @ApiResponse({ status: 200, description: 'Policy activated successfully' })
  @ApiResponse({ status: 400, description: 'Policy is already ACTIVE or not DRAFT' })
  async activatePolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @CurrentUser() user: User,
  ): Promise<ReleasePolicyDto> {
    return this.releasePolicyService.activatePolicy(
      organizationId,
      policyId,
      user.id,
    );
  }

  @Post('release-policies/:policyId/archive')
  @RequirePermissions(Permission.RELEASE_POLICY_ARCHIVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive release policy',
    description: 'Archives an existing release policy.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'policyId', description: 'Release policy ID' })
  @ApiResponse({ status: 200, description: 'Policy archived successfully' })
  @ApiResponse({ status: 400, description: 'Policy is already ARCHIVED' })
  async archivePolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @CurrentUser() user: User,
  ): Promise<ReleasePolicyDto> {
    return this.releasePolicyService.archivePolicy(
      organizationId,
      policyId,
      user.id,
    );
  }

  @Post('release-policies/:policyId/preview')
  @RequirePermissions(Permission.RELEASE_POLICY_READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview release policy against a change set',
    description: 'Dry-run evaluation with strictly zero database mutations or side effects.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'policyId', description: 'Release policy ID' })
  @ApiResponse({ status: 200, description: 'Preview evaluation generated successfully' })
  async previewPolicy(
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @Body() dto: PreviewReleasePolicyDto,
  ): Promise<ReleasePolicyPreviewDto> {
    return this.releasePolicyService.previewPolicy(
      organizationId,
      policyId,
      dto,
    );
  }

  @Get('repositories/:repositoryConnectionId/effective-release-policy')
  @RequirePermissions(Permission.RELEASE_POLICY_READ)
  @ApiOperation({
    summary: 'Get effective release policy for repository and branch',
    description: 'Shows exactly which policy would be resolved according to canonical precedence.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'repositoryConnectionId', description: 'Repository connection ID' })
  @ApiQuery({ name: 'branch', required: false, description: 'Target branch name' })
  @ApiResponse({ status: 200, description: 'Effective policy resolved successfully' })
  async getEffectivePolicy(
    @Param('organizationId') organizationId: string,
    @Param('repositoryConnectionId') repositoryConnectionId: string,
    @Query('branch') branch?: string,
  ): Promise<EffectiveReleasePolicyDto> {
    return this.releasePolicyService.getEffectivePolicy(
      organizationId,
      repositoryConnectionId,
      branch,
    );
  }
}
