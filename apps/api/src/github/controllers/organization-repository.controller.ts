import {
  Controller,
  Get,
  Post,
  Param,
  Query,
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
import { GitHubRepositoryService } from '../services/github-repository.service';
import { ListRepositoriesQueryDto } from '../dto/github.dto';
import { RepositoryListResponse, RepositoryConnectionDto } from '@impactra/shared';

@ApiTags('Repository Connections')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId/repositories')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationRepositoryController {
  constructor(private readonly repositoryService: GitHubRepositoryService) {}

  @Get()
  @RequirePermissions(Permission.REPOSITORY_READ)
  @ApiOperation({
    summary: 'List organization repositories',
    description: 'Lists all synchronized GitHub repositories for the organization with pagination and status filters.',
  })
  @ApiResponse({ status: 200, description: 'List of repository connections' })
  async listRepositories(
    @Param('organizationId') organizationId: string,
    @Query() query: ListRepositoriesQueryDto,
  ): Promise<RepositoryListResponse> {
    return this.repositoryService.listRepositories(organizationId, query);
  }

  @Post(':repositoryId/connect')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REPOSITORY_MANAGE)
  @ApiOperation({
    summary: 'Connect a repository for Impactra change intelligence',
    description: 'Marks an available repository as connected so future events can trigger analysis.',
  })
  @ApiResponse({ status: 200, description: 'Repository connected' })
  async connectRepository(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
  ): Promise<RepositoryConnectionDto> {
    return this.repositoryService.connectRepository(organizationId, repositoryId);
  }

  @Post(':repositoryId/disconnect')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.REPOSITORY_MANAGE)
  @ApiOperation({
    summary: 'Disconnect a repository',
    description: 'Disconnects a previously connected repository from active analysis.',
  })
  @ApiResponse({ status: 200, description: 'Repository disconnected' })
  async disconnectRepository(
    @Param('organizationId') organizationId: string,
    @Param('repositoryId') repositoryId: string,
  ): Promise<RepositoryConnectionDto> {
    return this.repositoryService.disconnectRepository(organizationId, repositoryId);
  }
}
