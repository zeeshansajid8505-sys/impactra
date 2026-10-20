import {
  GitHubCheckClientService,
  GitHubCheckError,
} from './github-check-client.service';
import { GitHubInstallationService } from '../../github/services/github-installation.service';
import { GitHubClientService } from '../../github/services/github-client.service';
import { GitHubCheckWirePayload } from './github-check-payload-builder.service';

describe('GitHubCheckClientService', () => {
  let service: GitHubCheckClientService;
  let mockInstallationService: jest.Mocked<Partial<GitHubInstallationService>>;
  let mockClientService: jest.Mocked<Partial<GitHubClientService>>;
  let mockOctokit: any;

  const samplePayload: GitHubCheckWirePayload = {
    name: 'Impactra / Release Safety',
    head_sha: '1234567890abcdef1234567890abcdef12345678',
    status: 'completed',
    conclusion: 'success',
    completed_at: new Date().toISOString(),
    external_id: 'impactra:release-safety:repo-1:1234567890abcdef1234567890abcdef12345678',
    output: {
      title: 'Impactra Release Safety: PASS',
      summary: 'All checks passed',
      text: 'No signals',
    },
  };

  beforeEach(() => {
    mockOctokit = {
      rest: {
        checks: {
          create: jest.fn().mockResolvedValue({
            data: { id: 987654, html_url: 'https://github.com/org/repo/runs/987654' },
          }),
          update: jest.fn().mockResolvedValue({
            data: { id: 987654, html_url: 'https://github.com/org/repo/runs/987654' },
          }),
        },
      },
    };

    mockInstallationService = {
      getInstallationToken: jest.fn().mockResolvedValue('ghs_secret_installation_token_xyz'),
    };

    mockClientService = {
      getInstallationOctokit: jest.fn().mockReturnValue(mockOctokit),
    };

    service = new GitHubCheckClientService(
      mockInstallationService as GitHubInstallationService,
      mockClientService as GitHubClientService,
    );
  });

  describe('createCheckRun', () => {
    it('calls octokit.rest.checks.create and returns result', async () => {
      const result = await service.createCheckRun(
        'inst-1',
        'my-org',
        'my-repo',
        samplePayload,
      );

      expect(mockInstallationService.getInstallationToken).toHaveBeenCalledWith('inst-1');
      expect(mockClientService.getInstallationOctokit).toHaveBeenCalledWith('ghs_secret_installation_token_xyz');
      expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith({
        owner: 'my-org',
        repo: 'my-repo',
        name: samplePayload.name,
        head_sha: samplePayload.head_sha,
        status: samplePayload.status,
        conclusion: samplePayload.conclusion,
        completed_at: samplePayload.completed_at,
        external_id: samplePayload.external_id,
        details_url: undefined,
        output: samplePayload.output,
      });

      expect(result).toEqual({
        id: 987654,
        html_url: 'https://github.com/org/repo/runs/987654',
      });
    });
  });

  describe('updateCheckRun', () => {
    it('calls octokit.rest.checks.update and returns result', async () => {
      const result = await service.updateCheckRun(
        'inst-1',
        'my-org',
        'my-repo',
        987654,
        samplePayload,
      );

      expect(mockOctokit.rest.checks.update).toHaveBeenCalledWith({
        owner: 'my-org',
        repo: 'my-repo',
        check_run_id: 987654,
        name: samplePayload.name,
        status: samplePayload.status,
        conclusion: samplePayload.conclusion,
        completed_at: samplePayload.completed_at,
        external_id: samplePayload.external_id,
        details_url: undefined,
        output: samplePayload.output,
      });

      expect(result).toEqual({
        id: 987654,
        html_url: 'https://github.com/org/repo/runs/987654',
      });
    });
  });

  describe('error sanitization', () => {
    it('sanitizes 401/403 into GITHUB_CHECK_PERMISSION_DENIED without token exposure', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce({
        status: 403,
        message: 'Resource not accessible by integration token ghs_secret_installation_token_xyz',
      });

      try {
        await service.createCheckRun('inst-1', 'my-org', 'my-repo', samplePayload);
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubCheckError);
        const ghErr = err as GitHubCheckError;
        expect(ghErr.code).toBe('GITHUB_CHECK_PERMISSION_DENIED');
        expect(ghErr.statusCode).toBe(403);
        expect(ghErr.message).not.toContain('ghs_secret_installation_token_xyz');
      }
    });

    it('sanitizes 404 into GITHUB_CHECK_NOT_FOUND', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce({
        status: 404,
        message: 'Not Found',
      });

      try {
        await service.createCheckRun('inst-1', 'my-org', 'my-repo', samplePayload);
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubCheckError);
        const ghErr = err as GitHubCheckError;
        expect(ghErr.code).toBe('GITHUB_CHECK_NOT_FOUND');
        expect(ghErr.statusCode).toBe(404);
      }
    });

    it('sanitizes 422 into GITHUB_CHECK_VALIDATION_FAILED', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce({
        status: 422,
        message: 'Invalid head_sha format',
      });

      try {
        await service.createCheckRun('inst-1', 'my-org', 'my-repo', samplePayload);
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubCheckError);
        const ghErr = err as GitHubCheckError;
        expect(ghErr.code).toBe('GITHUB_CHECK_VALIDATION_FAILED');
        expect(ghErr.statusCode).toBe(422);
      }
    });

    it('sanitizes 429 into GITHUB_RATE_LIMITED', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce({
        status: 429,
        message: 'API rate limit exceeded',
      });

      try {
        await service.createCheckRun('inst-1', 'my-org', 'my-repo', samplePayload);
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubCheckError);
        const ghErr = err as GitHubCheckError;
        expect(ghErr.code).toBe('GITHUB_RATE_LIMITED');
        expect(ghErr.statusCode).toBe(429);
      }
    });

    it('sanitizes 500 into GITHUB_API_ERROR', async () => {
      mockOctokit.rest.checks.create.mockRejectedValueOnce({
        status: 500,
        message: 'Internal Server Error',
      });

      try {
        await service.createCheckRun('inst-1', 'my-org', 'my-repo', samplePayload);
        fail('Expected error to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubCheckError);
        const ghErr = err as GitHubCheckError;
        expect(ghErr.code).toBe('GITHUB_API_ERROR');
        expect(ghErr.statusCode).toBe(500);
      }
    });
  });
});
