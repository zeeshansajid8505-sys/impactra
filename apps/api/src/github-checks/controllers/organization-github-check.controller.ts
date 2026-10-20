import {
  Controller,
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
import { GitHubCheckPublicationService } from '../services/github-check-publication.service';
import { GitHubCheckPersistenceService } from '../services/github-check-persistence.service';
import { PublishGitHubCheckDto } from '../dto/github-check.dto';
import {
  GitHubCheckLatestResponseDto,
  GitHubCheckPublicationDto,
  GitHubCheckPublishResponseDto,
} from '@impactra/shared';

@ApiTags('GitHub Checks & Release Gate')
@ApiCookieAuth('impactra_session')
@Controller('organizations/:organizationId')
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class OrganizationGitHubCheckController {
  constructor(
    private readonly publicationService: GitHubCheckPublicationService,
    private readonly persistenceService: GitHubCheckPersistenceService,
  ) {}

  @Get([
    'changes/:changeSetId/github-check',
    'changes/:changeSetId/github-check/latest',
  ])
  @RequirePermissions(Permission.GITHUB_CHECK_READ)
  @ApiOperation({
    summary: 'Get latest GitHub Check publication for a change set',
    description:
      'Retrieves the most recent GitHub Check Run status, conclusion, and publication metadata for the change revision commit.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'Latest GitHub Check publication details retrieved',
  })
  @ApiResponse({ status: 404, description: 'Change set not found' })
  async getLatestCheckPublication(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
  ): Promise<GitHubCheckLatestResponseDto> {
    return this.persistenceService.findLatestByChangeSet(
      organizationId,
      changeSetId,
    );
  }

  @Get('changes/:changeSetId/github-check/:publicationId')
  @RequirePermissions(Permission.GITHUB_CHECK_READ)
  @ApiOperation({
    summary: 'Get a specific GitHub Check publication by ID',
    description:
      'Retrieves detailed GitHub Check publication records including attempt counts, remote Check Run IDs, and linked assessments.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiParam({ name: 'publicationId', description: 'Publication ID' })
  @ApiResponse({
    status: 200,
    description: 'GitHub Check publication retrieved',
  })
  @ApiResponse({ status: 404, description: 'Publication not found' })
  async getCheckPublicationById(
    @Param('organizationId') organizationId: string,
    @Param('publicationId') publicationId: string,
  ): Promise<GitHubCheckPublicationDto> {
    return this.persistenceService.findById(organizationId, publicationId);
  }

  @Post('changes/:changeSetId/github-check/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GITHUB_CHECK_PUBLISH)
  @ApiOperation({
    summary: 'Trigger or retry GitHub Check publication',
    description:
      'Publishes authoritative Release Safety decision and bounded signals to GitHub Pull Request commit checks.',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization tenant ID' })
  @ApiParam({ name: 'changeSetId', description: 'Change set ID' })
  @ApiResponse({
    status: 200,
    description: 'GitHub Check publication initiated or queued',
  })
  @ApiResponse({
    status: 400,
    description: 'Release safety assessment not completed or invalid state',
  })
  @ApiResponse({
    status: 404,
    description: 'Change set or assessment not found',
  })
  async publishGitHubCheck(
    @Param('organizationId') organizationId: string,
    @Param('changeSetId') changeSetId: string,
    @Body() body?: PublishGitHubCheckDto,
  ): Promise<GitHubCheckPublishResponseDto> {
    return this.publicationService.triggerPublication(
      organizationId,
      changeSetId,
      body?.assessmentId,
    );
  }
}
