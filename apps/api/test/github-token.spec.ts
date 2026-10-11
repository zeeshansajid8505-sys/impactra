import * as crypto from 'crypto';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { GitHubConfigService } from '../src/github/config/github-config.service';
import { GitHubClientService } from '../src/github/services/github-client.service';
import { GitHubInstallationService } from '../src/github/services/github-installation.service';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

jest.mock('@octokit/auth-app');
jest.mock('@octokit/rest');

describe('GitHubToken & Config Services', () => {
  const mockCreateAppAuth = createAppAuth as jest.MockedFunction<typeof createAppAuth>;
  const mockOctokit = Octokit as jest.MockedClass<typeof Octokit>;

  // Generate a temporary 2048-bit RSA key pair for testing
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const base64PrivateKey = Buffer.from(privateKey, 'utf8').toString('base64');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GitHubConfigService', () => {
    it('should report unconfigured when environment variables are missing', () => {
      const mockConfig: any = {
        get: jest.fn().mockReturnValue(undefined),
      };
      const service = new GitHubConfigService(mockConfig);

      const status = service.getStatus();
      expect(status.configured).toBe(false);
      expect(status.installationsEnabled).toBe(false);
      expect(status.appIdConfigured).toBe(false);
      expect(status.slugConfigured).toBe(false);
      expect(status.privateKeyConfigured).toBe(false);
    });

    it('should report configured when app ID, slug, and private key are present', () => {
      const mockConfig: any = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'app.github.appId') return '12345';
          if (key === 'app.github.appSlug') return 'impactra-app';
          if (key === 'app.github.privateKeyBase64') return base64PrivateKey;
          if (key === 'app.github.webhookSecret') return 'test_secret';
          return undefined;
        }),
      };
      const service = new GitHubConfigService(mockConfig);

      const status = service.getStatus();
      expect(status.configured).toBe(true);
      expect(status.installationsEnabled).toBe(true);
      expect(status.appIdConfigured).toBe(true);
      expect(status.slugConfigured).toBe(true);
      expect(status.privateKeyConfigured).toBe(true);
      expect(status.webhookSecretConfigured).toBe(true);
      expect(status.installUrl).toBe('https://github.com/apps/impactra-app/installations/new');
    });

    it('should decode base64 PEM private key accurately', () => {
      const mockConfig: any = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'app.github.privateKeyBase64') return base64PrivateKey;
          return undefined;
        }),
      };
      const service = new GitHubConfigService(mockConfig);

      const decoded = service.getPrivateKey();
      expect(decoded).toBeDefined();
      expect(decoded).toContain('-----BEGIN PRIVATE KEY-----');
      expect(decoded).toContain('-----END PRIVATE KEY-----');
    });

    it('should build proper installUrl with state query param', () => {
      const mockConfig: any = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'app.github.appSlug') return 'impactra-test-slug';
          return undefined;
        }),
      };
      const service = new GitHubConfigService(mockConfig);

      const state = 'state_hex_token_123456';
      const url = service.buildInstallUrl(state);
      expect(url).toBe('https://github.com/apps/impactra-test-slug/installations/new?state=state_hex_token_123456');
    });
  });

  describe('GitHubClientService & Official Auth Boundary', () => {
    it('official auth factory receives the correct App ID and private-key configuration', () => {
      const mockConfigService = {
        appId: '98765',
        apiUrl: 'https://api.github.com',
        getPrivateKey: jest.fn().mockReturnValue(privateKey),
      };

      const clientService = new GitHubClientService(
        mockConfigService as unknown as GitHubConfigService,
      );

      clientService.getAppAuth();
      expect(mockCreateAppAuth).toHaveBeenCalledWith({
        appId: '98765',
        privateKey,
        baseUrl: 'https://api.github.com',
      });
    });

    it('installation auth receives the exact GitHub installation ID', async () => {
      const mockAuthFn = jest.fn().mockResolvedValue({
        token: 'ghs_test_token_abc',
        expiresAt: '2026-10-11T12:00:00.000Z',
        permissions: { contents: 'read' },
        repositorySelection: 'all',
      });
      mockCreateAppAuth.mockReturnValue(mockAuthFn as any);

      const mockConfigService = {
        appId: '98765',
        apiUrl: 'https://api.github.com',
        getPrivateKey: jest.fn().mockReturnValue(privateKey),
      };

      const clientService = new GitHubClientService(
        mockConfigService as unknown as GitHubConfigService,
      );

      const result = await clientService.createInstallationToken('889900');
      expect(mockAuthFn).toHaveBeenCalledWith({
        type: 'installation',
        installationId: 889900,
      });
      expect(result.token).toBe('ghs_test_token_abc');
      expect(result.expires_at).toBe('2026-10-11T12:00:00.000Z');
    });

    it('application boots and throws clean configuration error when credentials are intentionally missing', () => {
      const mockConfigService = {
        appId: undefined,
        apiUrl: 'https://api.github.com',
        getPrivateKey: jest.fn().mockReturnValue(null),
      };

      const clientService = new GitHubClientService(
        mockConfigService as unknown as GitHubConfigService,
      );

      expect(() => clientService.getAppAuth()).toThrow(InternalServerErrorException);
      expect(() => clientService.getAppOctokit()).toThrow(InternalServerErrorException);
    });

    it('authentication failure is safely mapped without leaking credentials or private keys', async () => {
      const mockAuthFn = jest.fn().mockRejectedValue(new Error('Bad credentials'));
      mockCreateAppAuth.mockReturnValue(mockAuthFn as any);

      const mockConfigService = {
        appId: '98765',
        apiUrl: 'https://api.github.com',
        getPrivateKey: jest.fn().mockReturnValue(privateKey),
      };

      const clientService = new GitHubClientService(
        mockConfigService as unknown as GitHubConfigService,
      );

      await expect(clientService.createInstallationToken('777')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('Installation Token Caching & Safety Margin', () => {
    let mockClientService: any;
    let mockCacheService: any;
    let mockDbService: any;
    let mockConfigService: any;
    let mockStateService: any;
    let installationService: GitHubInstallationService;
    let redisStore: Map<string, { value: string; ttl: number }>;

    beforeEach(() => {
      redisStore = new Map();
      mockClientService = {
        createInstallationToken: jest.fn(),
      };
      mockCacheService = {
        redisClient: {
          status: 'ready',
          get: jest.fn().mockImplementation(async (key: string) => {
            const item = redisStore.get(key);
            return item ? item.value : null;
          }),
          setex: jest.fn().mockImplementation(async (key: string, ttl: number, val: string) => {
            redisStore.set(key, { value: val, ttl });
            return 'OK';
          }),
          del: jest.fn().mockImplementation(async (key: string) => {
            redisStore.delete(key);
            return 1;
          }),
        },
      };
      mockDbService = { client: { gitHubInstallation: {}, repositoryConnection: {} } };
      mockConfigService = {};
      mockStateService = {};

      installationService = new GitHubInstallationService(
        mockDbService,
        mockCacheService,
        mockConfigService,
        mockClientService,
        mockStateService,
      );
    });

    it('returned provider token is cached in Redis with safety margin below provider expiresAt', async () => {
      const now = Date.now();
      const expiresAt = new Date(now + 3600 * 1000).toISOString(); // 1 hour = 3600s
      mockClientService.createInstallationToken.mockResolvedValue({
        token: 'ghs_provider_token_123',
        expires_at: expiresAt,
      });

      const token = await installationService.getInstallationToken('inst-42');
      expect(token).toBe('ghs_provider_token_123');

      const cacheKey = 'impactra:github:inst-token:inst-42';
      expect(mockCacheService.redisClient.setex).toHaveBeenCalledWith(
        cacheKey,
        expect.any(Number),
        'ghs_provider_token_123',
      );

      const cachedItem = redisStore.get(cacheKey);
      expect(cachedItem).toBeDefined();
      // TTL should be providerTtl - 90s safety margin: approximately 3600 - 90 = 3510
      expect(cachedItem!.ttl).toBeLessThanOrEqual(3510);
      expect(cachedItem!.ttl).toBeGreaterThanOrEqual(3505);
    });

    it('existing valid cached token is reused without requesting a new provider token', async () => {
      const cacheKey = 'impactra:github:inst-token:inst-42';
      redisStore.set(cacheKey, { value: 'ghs_cached_existing_token', ttl: 1800 });

      const token = await installationService.getInstallationToken('inst-42');
      expect(token).toBe('ghs_cached_existing_token');
      expect(mockClientService.createInstallationToken).not.toHaveBeenCalled();
    });

    it('cache miss gets a new provider token and updates cache', async () => {
      const expiresAt = new Date(Date.now() + 1800 * 1000).toISOString();
      mockClientService.createInstallationToken.mockResolvedValue({
        token: 'ghs_fresh_minted_token',
        expires_at: expiresAt,
      });

      const token = await installationService.getInstallationToken('inst-99');
      expect(token).toBe('ghs_fresh_minted_token');
      expect(mockClientService.createInstallationToken).toHaveBeenCalledWith('inst-99');
      expect(redisStore.get('impactra:github:inst-token:inst-99')?.value).toBe('ghs_fresh_minted_token');
    });

    it('malformed provider expiry cannot create an unsafe long-lived cache value', async () => {
      mockClientService.createInstallationToken.mockResolvedValue({
        token: 'ghs_token_bad_expiry',
        expires_at: 'not-a-valid-date-string',
      });

      const token = await installationService.getInstallationToken('inst-bad-date');
      expect(token).toBe('ghs_token_bad_expiry');
      expect(redisStore.has('impactra:github:inst-token:inst-bad-date')).toBe(false);
    });

    it('evictInstallationToken invalidates cached token on disconnect or suspend', async () => {
      const cacheKey = 'impactra:github:inst-token:inst-evict';
      redisStore.set(cacheKey, { value: 'ghs_token_to_evict', ttl: 2000 });

      await installationService.evictInstallationToken('inst-evict');
      expect(mockCacheService.redisClient.del).toHaveBeenCalledWith(cacheKey);
      expect(redisStore.has(cacheKey)).toBe(false);
    });
  });
});
