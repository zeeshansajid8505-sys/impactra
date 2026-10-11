/**
 * Test double for @octokit/auth-app to satisfy Jest CommonJS environment.
 * Production runtime and TypeScript build use the official @octokit/auth-app ESM package directly.
 */

export interface AppAuthOptions {
  appId: string | number;
  privateKey: string;
  baseUrl?: string;
  request?: any;
}

export interface InstallationAuthOptions {
  type: 'installation';
  installationId: number | string;
  repositoryIds?: number[];
  permissions?: Record<string, string>;
  refresh?: boolean;
}

export interface AppAuthResult {
  type: 'app';
  token: string;
}

export interface InstallationAuthResult {
  type: 'installation';
  token: string;
  expiresAt: string;
  permissions?: Record<string, string>;
  repositorySelection?: string;
}

export const createAppAuth = jest.fn((options: AppAuthOptions) => {
  const auth = jest.fn(async (authOptions: any) => {
    if (authOptions?.type === 'app') {
      return {
        type: 'app',
        token: 'mock-app-jwt-token',
      };
    }
    return {
      type: 'installation',
      token: 'ghs_mock_installation_token',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      permissions: { contents: 'read' },
      repositorySelection: 'all',
    };
  });

  (auth as any).hook = jest.fn((request: any, route: any, parameters: any) => {
    return request(route, parameters);
  });

  return auth;
});
