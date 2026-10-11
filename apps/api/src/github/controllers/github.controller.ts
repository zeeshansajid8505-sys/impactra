import {
  Controller,
  Get,
  Post,
  Query,
  Headers,
  Req,
  Res,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { GitHubConfigService } from '../config/github-config.service';
import { GitHubInstallationService } from '../services/github-installation.service';
import { GitHubWebhookService } from '../services/github-webhook.service';
import { GitHubCallbackQueryDto } from '../dto/github.dto';
import { GitHubConfigStatus, WebhookProcessingResponse } from '@impactra/shared';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '@impactra/database';

@ApiTags('GitHub Integration')
@Controller('github')
export class GitHubController {
  private readonly logger = new Logger(GitHubController.name);

  constructor(
    private readonly configService: GitHubConfigService,
    private readonly installationService: GitHubInstallationService,
    private readonly webhookService: GitHubWebhookService,
  ) {}

  @Get('config/status')
  @ApiOperation({
    summary: 'Get GitHub App integration configuration status',
    description: 'Safe check for frontend to verify if GitHub App is configured without leaking secrets.',
  })
  @ApiResponse({ status: 200, description: 'Configuration status' })
  getConfigStatus(): GitHubConfigStatus {
    return this.configService.getStatus();
  }

  @Get('installations/callback')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('impactra_session')
  @ApiOperation({
    summary: 'GitHub App installation callback URL',
    description: 'Handles the redirect from GitHub following App installation, binds the installation to tenant, and redirects to frontend.',
  })
  async handleInstallationCallback(
    @Query() query: GitHubCallbackQueryDto,
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:3000,http://impactra.local';
    const primaryFrontend = rawOrigins.split(',')[0].trim() || 'http://localhost:3000';

    const { state, installation_id } = query;

    if (!state || !installation_id) {
      this.logger.warn('Callback called with missing state or installation_id');
      const target = `${primaryFrontend}/workspace/repositories?installation=error&message=${encodeURIComponent('Missing installation ID or state')}`;
      return res.redirect(target);
    }

    try {
      await this.installationService.handleCallback(state, installation_id, user.id);
      const target = `${primaryFrontend}/workspace/repositories?installation=success&installed=true`;
      return res.redirect(target);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to complete GitHub installation.';
      this.logger.error(`Callback error: ${msg}`);
      const target = `${primaryFrontend}/workspace/repositories?installation=error&message=${encodeURIComponent(msg)}`;
      return res.redirect(target);
    }
  }

  @Post('webhooks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'GitHub Webhook endpoint',
    description: 'Receives and verifies GitHub event webhooks (installation, repositories, etc.) using HMAC-SHA256 signature.',
  })
  @ApiResponse({ status: 200, description: 'Webhook acknowledged and processed' })
  @ApiResponse({ status: 401, description: 'Invalid HMAC signature' })
  async handleWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request & { rawBody?: Buffer },
    @Body() body: Record<string, unknown>,
  ): Promise<WebhookProcessingResponse> {
    return this.webhookService.processWebhook(headers, req.rawBody, body);
  }
}
