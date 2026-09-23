import {
  Controller,
  Post,
  Get,
  Patch,
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
import { OrganizationsService } from './organizations.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TenantGuard } from './guards/tenant.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CsrfOriginGuard } from '../common/guards/csrf-origin.guard';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { Permission } from '../authorization/permissions.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from './decorators/current-org.decorator';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { User, Organization } from '@impactra/database';
import { OrganizationDto, UserOrganizationSummary } from '@impactra/shared';

@ApiTags('Organizations & Multi-Tenancy')
@Controller('organizations')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(CsrfOriginGuard)
  @ApiOperation({ summary: 'Create a new organization and become initial OWNER' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @ApiResponse({ status: 409, description: 'Organization slug conflict' })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all organizations the authenticated user belongs to' })
  @ApiResponse({ status: 200, description: 'List of accessible organizations' })
  async listUserOrganizations(
    @CurrentUser() user: User,
  ): Promise<UserOrganizationSummary[]> {
    return this.organizationsService.listForUser(user.id);
  }

  @Get(':organizationId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions(Permission.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get details for a specific organization' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller not a member of organization' })
  async getOrganization(
    @CurrentOrganization() organization: Organization,
  ): Promise<OrganizationDto> {
    return this.organizationsService.formatOrganization(organization);
  }

  @Patch(':organizationId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard, CsrfOriginGuard)
  @RequirePermissions(Permission.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update organization profile (OWNER or ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks required permission' })
  async updateOrganization(
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.organizationsService.update(organizationId, dto);
  }
}
