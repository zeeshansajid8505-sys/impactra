import {
  Controller,
  Query,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { TenantGuard } from '../../organizations/guards/tenant.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { Permission } from '../../authorization/permissions.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CurrentMembership } from '../../organizations/decorators/current-membership.decorator';
import { ReleaseApprovalService } from '../services/release-approval.service';
import {
  RequestReleaseApprovalDto,
  ResolveReleaseApprovalDto,
  GrantReleaseExceptionDto,
} from '../dto/release-approval.dto';
import { ReleaseApprovalWorkflowResponseDto } from '@impactra/shared';
import { User, OrganizationMembership } from '@impactra/database';

@ApiTags('Release Approval & Governance')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationReleaseApprovalController {
  constructor(
    private readonly releaseApprovalService: ReleaseApprovalService,
  ) {}

  @Get('changes/:changeSetId/release-approval')
  @RequirePermissions(Permission.RELEASE_APPROVAL_READ)
  @ApiOperation({
    summary: 'Get release approval workflow state',
    description:
      'Retrieves the authoritative Release Safety decision, human approval state, effective release authorization, actor info, and complete audit history.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'Release approval workflow retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async getWorkflow(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: OrganizationMembership,
    @Query('assessmentId') assessmentId?: string,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.releaseApprovalService.getWorkflow(
      organizationId,
      changeSetId,
      user,
      membership?.role,
      assessmentId,
    );
  }

  @Post('changes/:changeSetId/release-approval/request')
  @RequirePermissions(Permission.RELEASE_APPROVAL_REQUEST)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request release approval',
    description:
      'Creates or reuses a pending approval request for a completed Release Safety assessment.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'Release approval requested or reused successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Release is PASS (no approval required) or assessment not succeeded',
  })
  @ApiResponse({ status: 404, description: 'Change set or assessment not found' })
  async requestApproval(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @CurrentUser() user: User,
    @Body() dto: RequestReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.releaseApprovalService.requestApproval(
      organizationId,
      changeSetId,
      user,
      dto,
    );
  }

  @Post('changes/:changeSetId/release-approval/:approvalId/approve')
  @RequirePermissions(Permission.RELEASE_APPROVAL_RESOLVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve release',
    description:
      'Approves a pending release approval request. Requester cannot approve their own request.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'approvalId', description: 'Release approval request ID' })
  @ApiResponse({
    status: 200,
    description: 'Release approved and effective authorization updated',
  })
  @ApiResponse({ status: 400, description: 'Missing reason or release is BLOCKED' })
  @ApiResponse({ status: 403, description: 'Self-approval denied' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  @ApiResponse({ status: 409, description: 'Request already resolved' })
  async approve(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser() user: User,
    @Body() dto: ResolveReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.releaseApprovalService.approve(
      organizationId,
      changeSetId,
      approvalId,
      user,
      dto,
    );
  }

  @Post('changes/:changeSetId/release-approval/:approvalId/reject')
  @RequirePermissions(Permission.RELEASE_APPROVAL_RESOLVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject release',
    description:
      'Rejects a pending release approval request with mandatory audit reason.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'approvalId', description: 'Release approval request ID' })
  @ApiResponse({
    status: 200,
    description: 'Release rejected and effective authorization updated',
  })
  @ApiResponse({ status: 400, description: 'Missing rejection reason' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  @ApiResponse({ status: 409, description: 'Request already resolved' })
  async reject(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser() user: User,
    @Body() dto: ResolveReleaseApprovalDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.releaseApprovalService.reject(
      organizationId,
      changeSetId,
      approvalId,
      user,
      dto,
    );
  }

  @Post('changes/:changeSetId/release-approval/:approvalId/exception')
  @RequirePermissions(Permission.RELEASE_APPROVAL_EXCEPTION)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Grant release exception',
    description:
      'Grants an explicit administrative policy exception/override for a BLOCKED or REVIEW_REQUIRED release.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({
    name: 'approvalId',
    description: "Release approval request ID, or 'latest'",
  })
  @ApiResponse({
    status: 200,
    description: 'Policy exception granted and effective authorization updated',
  })
  @ApiResponse({ status: 400, description: 'Missing exception reason' })
  @ApiResponse({ status: 403, description: 'Elevated exception permission required' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  @ApiResponse({ status: 409, description: 'Request already resolved' })
  async grantException(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser() user: User,
    @Body() dto: GrantReleaseExceptionDto,
  ): Promise<ReleaseApprovalWorkflowResponseDto> {
    return this.releaseApprovalService.grantException(
      organizationId,
      changeSetId,
      approvalId,
      user,
      dto,
    );
  }
}
