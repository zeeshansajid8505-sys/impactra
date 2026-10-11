import { ManifestParserService } from './manifest-parser.service';
import { ExtractedFileEntry } from '../tar/tar-reader.service';

describe('ManifestParserService', () => {
  let parser: ManifestParserService;

  beforeEach(() => {
    parser = new ManifestParserService();
  });

  it('correctly parses a single-package project', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'package.json',
        byteSize: 100,
        content: Buffer.from(
          JSON.stringify({
            name: 'my-service',
            version: '1.2.0',
            dependencies: {
              express: '^4.21.0',
              lodash: '^4.17.21',
            },
            devDependencies: {
              typescript: '^5.7.0',
            },
          }),
        ),
        contentSha256: 'abc',
      },
    ];

    const result = parser.parse(files);

    expect(result.isMonorepo).toBe(false);
    expect(result.workspacePackages).toHaveLength(1);
    expect(result.workspacePackages[0].name).toBe('my-service');
    expect(result.workspacePackages[0].version).toBe('1.2.0');
    expect(result.externalDependencies).toHaveLength(3);
    expect(result.workspaceLinks).toHaveLength(0);
  });

  it('correctly parses a monorepo with workspace packages and cross-package links', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'pnpm-workspace.yaml',
        byteSize: 30,
        content: Buffer.from('packages:\n  - "packages/*"\n  - "apps/*"'),
        contentSha256: 'w1',
      },
      {
        path: 'package.json',
        byteSize: 50,
        content: Buffer.from(JSON.stringify({ name: 'root', private: true })),
        contentSha256: 'r1',
      },
      {
        path: 'packages/shared/package.json',
        byteSize: 80,
        content: Buffer.from(
          JSON.stringify({
            name: '@impactra/shared',
            version: '0.1.0',
            dependencies: {
              zod: '^3.24.0',
            },
          }),
        ),
        contentSha256: 's1',
      },
      {
        path: 'apps/api/package.json',
        byteSize: 120,
        content: Buffer.from(
          JSON.stringify({
            name: '@impactra/api',
            version: '0.1.0',
            dependencies: {
              '@impactra/shared': 'workspace:*',
              '@nestjs/core': '^11.0.0',
            },
          }),
        ),
        contentSha256: 'a1',
      },
    ];

    const result = parser.parse(files);

    expect(result.isMonorepo).toBe(true);
    expect(result.workspacePackages).toHaveLength(3);

    // Verify workspace link (@impactra/api -> @impactra/shared)
    expect(result.workspaceLinks).toHaveLength(1);
    expect(result.workspaceLinks[0].sourcePackageName).toBe('@impactra/api');
    expect(result.workspaceLinks[0].targetPackageName).toBe('@impactra/shared');

    // Verify external dependencies
    const extNames = result.externalDependencies.map((d) => d.packageName);
    expect(extNames).toContain('zod');
    expect(extNames).toContain('@nestjs/core');
  });
});
