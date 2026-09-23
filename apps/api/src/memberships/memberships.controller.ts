import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TenantGuard } from '../organizations/guards/tenant.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CsrfOriginGuard } from '../common/guards/csrf-origin.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { Permission } from '../authorization/permissions.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentMembership } from '../organizations/decorators/current-membership.decorator';
import { InviteMemberDto, UpdateMemberRoleDto } from './dto';
import { User, OrganizationMembership } from '@impactra/database';
import { MembershipDto } from '@impactra/shared';

@ApiTags('Organization Memberships & RBAC')
@Controller('organizations/:organizationId/members')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
@ApiCookieAuth()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MEMBERSHIP_READ)
  @ApiOperation({ summary: 'List all members belonging to the organization' })
  @ApiResponse({ status: 200, description: 'List of organization members' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller not an authorized member' })
  async listMembers(
    @Param('organizationId') organizationId: string,
  ): Promise<MembershipDto[]> {
    return this.membershipsService.listMembers(organizationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CsrfOriginGuard)
  @RequirePermissions(Permission.MEMBERSHIP_INVITE)
  @ApiOperation({ summary: 'Invite or add a user to the organization' })
  @ApiResponse({ status: 201, description: 'Member added or invitation dispatched' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks invite permission or OWNER elevation' })
  @ApiResponse({ status: 409, description: 'User already a member of organization' })
  async addOrInviteMember(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: OrganizationMembership,
    @Body() dto: InviteMemberDto,
  ) {
    return this.membershipsService.addOrInviteMember(
      organizationId,
      { userId: user.id, role: membership.role },
      dto,
    );
  }

  @Patch(':membershipId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  @RequirePermissions(Permission.MEMBERSHIP_ROLE_UPDATE)
  @ApiOperation({ summary: 'Update member role (subject to owner safeguards)' })
  @ApiResponse({ status: 200, description: 'Member role updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request: cannot demote last OWNER' })
  @ApiResponse({ status: 403, description: 'Forbidden: privilege escalation prevented' })
  @ApiResponse({ status: 404, description: 'Membership not found in this organization' })
  async updateMemberRole(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: OrganizationMembership,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MembershipDto> {
    return this.membershipsService.updateMemberRole(
      organizationId,
      membershipId,
      { userId: user.id, role: membership.role },
      dto.role,
    );
  }

  @Delete(':membershipId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfOriginGuard)
  @RequirePermissions(Permission.MEMBERSHIP_REMOVE)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiResponse({ status: 200, description: 'Member removed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request: cannot remove last OWNER' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller unauthorized to remove target' })
  @ApiResponse({ status: 404, description: 'Membership not found in this organization' })
  async removeMember(
    @Param('organizationId') organizationId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: User,
    @CurrentMembership() membership: OrganizationMembership,
  ) {
    return this.membershipsService.removeMember(
      organizationId,
      membershipId,
      { userId: user.id, role: membership.role },
    );
  }
}
