/**
 * Test double for @octokit/rest to satisfy Jest CommonJS environment.
 * Production runtime and TypeScript build use the official @octokit/rest ESM package directly.
 */

export class Octokit {
  public paginate: jest.Mock;
  public rest: {
    apps: {
      getInstallation: jest.Mock;
      createInstallationAccessToken: jest.Mock;
      listReposAccessibleToInstallation: jest.Mock;
    };
    repos: {
      get: jest.Mock;
      downloadTarballArchive: jest.Mock;
    };
    pulls: {
      get: jest.Mock;
      listFiles: jest.Mock;
    };
    checks: {
      create: jest.Mock;
      update: jest.Mock;
      get: jest.Mock;
    };
  };

  constructor(public options: any = {}) {
    this.paginate = jest.fn().mockImplementation(async (method: any, args: any) => {
      const res = await method(args);
      return res?.data?.repositories || res?.data || [];
    });
    this.rest = {
      apps: {
        getInstallation: jest.fn().mockResolvedValue({
          data: {
            id: 1,
            account: { id: 1, login: 'test-org', type: 'Organization' },
            repository_selection: 'all',
            permissions: { contents: 'read', pull_requests: 'read' },
            events: ['pull_request'],
          },
        }),
        createInstallationAccessToken: jest.fn().mockResolvedValue({
          data: {
            token: 'ghs_mock_test_token',
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        }),
        listReposAccessibleToInstallation: jest.fn().mockResolvedValue({
          data: {
            repositories: [],
          },
        }),
      },
      repos: {
        get: jest.fn().mockResolvedValue({
          data: {
            id: 1,
            name: 'test-repo',
            full_name: 'test-org/test-repo',
            private: false,
            default_branch: 'main',
          },
        }),
        downloadTarballArchive: jest.fn().mockResolvedValue({
          data: Buffer.from([]),
          headers: {},
        }),
      },
      pulls: {
        get: jest.fn().mockResolvedValue({
          data: {
            number: 1,
            title: 'Test PR',
            body: 'Test body',
            state: 'open',
            merged_at: null,
            base: { ref: 'main', sha: 'base-sha-1' },
            head: { ref: 'feature', sha: 'head-sha-1' },
            user: { login: 'test-user', avatar_url: null },
            html_url: 'https://github.com/test-org/test-repo/pull/1',
            additions: 10,
            deletions: 2,
            changed_files: 1,
          },
        }),
        listFiles: jest.fn().mockResolvedValue({
          data: [],
        }),
      },
      checks: {
        create: jest.fn().mockResolvedValue({
          data: {
            id: 123456789,
            html_url: 'https://github.com/test-org/test-repo/runs/123456789',
            status: 'completed',
            conclusion: 'success',
          },
        }),
        update: jest.fn().mockResolvedValue({
          data: {
            id: 123456789,
            html_url: 'https://github.com/test-org/test-repo/runs/123456789',
            status: 'completed',
            conclusion: 'success',
          },
        }),
        get: jest.fn().mockResolvedValue({
          data: {
            id: 123456789,
            html_url: 'https://github.com/test-org/test-repo/runs/123456789',
            status: 'completed',
            conclusion: 'success',
          },
        }),
      },
    };
  }
}
