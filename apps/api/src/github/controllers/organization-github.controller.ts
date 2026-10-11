import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { TenantGuard } from '../../organizations/guards/tenant.guard';
import { PermissionsGuard } from '../../authorization/guards/permissions.guard';
import { RequirePermissions } from '../../authorization/decorators/require-permissions.decorator';
import { Permission } from '../../authorization/permissions.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@impactra/database';
import { GitHubInstallationService } from '../services/github-installation.service';
import { GitHubRepositoryService } from '../services/github-repository.service';
import {
  GitHubInstallationDto,
  GitHubInstallationStartResponse,
  RepositorySyncResponse,
} from '@impactra/shared';

@ApiTags('GitHub Integration')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId/github')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationGitHubController {
  constructor(
    private readonly installationService: GitHubInstallationService,
    private readonly repositoryService: GitHubRepositoryService,
  ) {}

  @Post('installations/start')
  @RequirePermissions(Permission.GITHUB_INSTALLATION_MANAGE)
  @ApiOperation({
    summary: 'Initiate GitHub App installation for an organization',
    description: 'Generates a secure single-use CSRF state token and returns the GitHub App installation URL.',
  })
  @ApiResponse({ status: 201, description: 'Installation initiated' })
  async startInstallation(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ): Promise<GitHubInstallationStartResponse> {
    return this.installationService.startInstallation(organizationId, user.id);
  }

  @Get('installation')
  @RequirePermissions(Permission.GITHUB_INSTALLATION_READ)
  @ApiOperation({
    summary: 'Get active GitHub App installation for an organization',
    description: 'Returns metadata about the currently linked GitHub App installation, if any.',
  })
  @ApiResponse({ status: 200, description: 'Active installation or null' })
  async getInstallation(
    @Param('organizationId') organizationId: string,
  ): Promise<GitHubInstallationDto | null> {
    return this.installationService.getInstallationForOrganization(organizationId);
  }

  @Delete('installation')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GITHUB_INSTALLATION_MANAGE)
  @ApiOperation({
    summary: 'Disconnect GitHub App installation from an organization',
    description: 'Disconnects the installation and marks linked repositories as unavailable.',
  })
  @ApiResponse({ status: 200, description: 'Installation disconnected' })
  async disconnectInstallation(
    @Param('organizationId') organizationId: string,
  ): Promise<{ disconnected: boolean }> {
    return this.installationService.disconnectInstallation(organizationId);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REPOSITORY_MANAGE)
  @ApiOperation({
    summary: 'Synchronize repository metadata from GitHub',
    description: 'Polls the GitHub installation for latest repository list and updates metadata cache.',
  })
  @ApiResponse({ status: 200, description: 'Repositories synchronized' })
  async syncRepositories(
    @Param('organizationId') organizationId: string,
  ): Promise<RepositorySyncResponse> {
    return this.repositoryService.syncRepositories(organizationId);
  }
}
