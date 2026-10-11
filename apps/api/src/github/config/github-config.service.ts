import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitHubConfigStatus } from '@impactra/shared';

@Injectable()
export class GitHubConfigService {
  private readonly logger = new Logger(GitHubConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  get appId(): string | undefined {
    return this.configService.get<string>('app.github.appId') || process.env.GITHUB_APP_ID;
  }

  get appSlug(): string | undefined {
    return this.configService.get<string>('app.github.appSlug') || process.env.GITHUB_APP_SLUG;
  }

  get privateKeyBase64(): string | undefined {
    return (
      this.configService.get<string>('app.github.privateKeyBase64') ||
      process.env.GITHUB_APP_PRIVATE_KEY_BASE64
    );
  }

  get webhookSecret(): string | undefined {
    return (
      this.configService.get<string>('app.github.webhookSecret') ||
      process.env.GITHUB_WEBHOOK_SECRET
    );
  }

  get apiUrl(): string {
    return (
      this.configService.get<string>('app.github.apiUrl') ||
      process.env.GITHUB_API_URL ||
      'https://api.github.com'
    ).replace(/\/$/, '');
  }

  get webUrl(): string {
    return (
      this.configService.get<string>('app.github.webUrl') ||
      process.env.GITHUB_WEB_URL ||
      'https://github.com'
    ).replace(/\/$/, '');
  }

  /**
   * Safely decodes base64-encoded private key PEM.
   * If already a PEM string with header, returns trimmed PEM.
   * Never throws; logs warning and returns null on invalid key.
   */
  getPrivateKey(): string | null {
    const raw = this.privateKeyBase64?.trim();
    if (!raw) return null;

    if (raw.startsWith('-----BEGIN')) {
      return raw;
    }

    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.includes('-----BEGIN') && decoded.includes('KEY-----')) {
        return decoded;
      }
      this.logger.warn('Decoded GITHUB_APP_PRIVATE_KEY_BASE64 does not contain valid PEM delimiters.');
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to decode GITHUB_APP_PRIVATE_KEY_BASE64: ${msg}`);
      return null;
    }
  }

  /**
   * Checks if required GitHub App credentials are configured.
   */
  isConfigured(): boolean {
    const hasAppId = Boolean(this.appId?.trim());
    const hasKey = Boolean(this.getPrivateKey());
    return hasAppId && hasKey;
  }

  /**
   * Builds the GitHub installation URL for a given CSRF state.
   */
  buildInstallUrl(state: string): string | null {
    if (!this.appSlug) return null;
    return `${this.webUrl}/apps/${this.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
  }

  /**
   * Returns a safe, non-sensitive configuration status summary.
   */
  getStatus(): GitHubConfigStatus {
    const configured = this.isConfigured();
    const appSlug = this.appSlug?.trim() || undefined;
    const hasSlug = Boolean(appSlug);
    const hasKey = Boolean(this.getPrivateKey());
    const hasSecret = Boolean(this.webhookSecret?.trim());
    const hasAppId = Boolean(this.appId?.trim());

    return {
      configured,
      appSlug,
      installationsEnabled: configured && hasSlug,
      appIdConfigured: hasAppId,
      slugConfigured: hasSlug,
      privateKeyConfigured: hasKey,
      webhookSecretConfigured: hasSecret,
      installUrl: hasSlug ? `${this.webUrl}/apps/${appSlug}/installations/new` : null,
    };
  }
}
