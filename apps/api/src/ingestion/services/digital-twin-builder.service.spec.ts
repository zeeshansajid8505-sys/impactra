import { DigitalTwinBuilderService } from './digital-twin-builder.service';
import { ExtractedFileEntry } from '../tar/tar-reader.service';
import { FileClassification } from '../parsers/file-classifier.service';
import { ManifestAnalysisResult } from '../parsers/manifest-parser.service';
import { DiscoveredImport } from '../parsers/import-parser.service';

describe('DigitalTwinBuilderService', () => {
  let builder: DigitalTwinBuilderService;

  beforeEach(() => {
    builder = new DigitalTwinBuilderService();
  });

  it('builds a deterministic Digital Twin graph with accurate vertices and edges', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'package.json',
        byteSize: 100,
        content: Buffer.from('{}'),
        contentSha256: 'sha-root-pkg',
      },
      {
        path: 'packages/core/src/index.ts',
        byteSize: 200,
        content: Buffer.from('export const core = 1;'),
        contentSha256: 'sha-core',
      },
      {
        path: 'apps/web/src/app.tsx',
        byteSize: 300,
        content: Buffer.from('import { core } from "@org/core"; import React from "react";'),
        contentSha256: 'sha-app',
      },
      {
        path: 'tsconfig.json',
        byteSize: 80,
        content: Buffer.from('{}'),
        contentSha256: 'sha-tsconfig',
      },
    ];

    const classifications = new Map<string, FileClassification>([
      ['package.json', { language: 'JSON', category: 'BUILD_SYSTEM', isBinary: false }],
      ['packages/core/src/index.ts', { language: 'TypeScript', category: 'SOURCE_CODE', isBinary: false }],
      ['apps/web/src/app.tsx', { language: 'TypeScript React', category: 'SOURCE_CODE', isBinary: false }],
      ['tsconfig.json', { language: 'JSON', category: 'CONFIGURATION', isBinary: false }],
    ]);

    const manifestAnalysis: ManifestAnalysisResult = {
      isMonorepo: true,
      workspacePackages: [
        {
          name: '@org/core',
          version: '1.0.0',
          manifestPath: 'packages/core/package.json',
          packageDirectory: 'packages/core',
          isPrivate: false,
          scripts: {},
          dependencies: {},
          devDependencies: {},
          peerDependencies: {},
        },
        {
          name: '@org/web',
          version: '1.0.0',
          manifestPath: 'apps/web/package.json',
          packageDirectory: 'apps/web',
          isPrivate: true,
          scripts: {},
          dependencies: {
            '@org/core': 'workspace:*',
            react: '^19.0.0',
          },
          devDependencies: {},
          peerDependencies: {},
        },
      ],
      workspaceLinks: [
        {
          sourcePackageName: '@org/web',
          sourcePackageDir: 'apps/web',
          targetPackageName: '@org/core',
          versionSpecifier: 'workspace:*',
          kind: 'dependency',
        },
      ],
      externalDependencies: [
        {
          packageName: 'react',
          versionSpecifier: '^19.0.0',
          declaredByPackage: '@org/web',
          kind: 'dependency',
        },
      ],
    };

    const discoveredImports: DiscoveredImport[] = [
      {
        sourceFilePath: 'apps/web/src/app.tsx',
        specifier: '@org/core',
        kind: 'WORKSPACE_PACKAGE',
        resolvedTarget: '@org/core',
        lineNumber: 1,
        statementKind: 'static_import',
      },
      {
        sourceFilePath: 'apps/web/src/app.tsx',
        specifier: 'react',
        kind: 'EXTERNAL_DEPENDENCY',
        resolvedTarget: 'react',
        lineNumber: 1,
        statementKind: 'static_import',
      },
    ];

    const graph = builder.buildGraph({
      repositoryId: 'repo-123',
      repositoryFullName: 'impactra/test-repo',
      defaultBranch: 'main',
      files,
      classifications,
      manifestAnalysis,
      discoveredImports,
    });

    // 1. Check Root Node
    const repoNode = graph.nodes.find((n) => n.stableKey === 'repo:repo-123');
    expect(repoNode).toBeDefined();
    expect(repoNode?.type).toBe('REPOSITORY');

    // 2. Check Workspace Packages
    const corePkgNode = graph.nodes.find((n) => n.stableKey === 'pkg:@org/core');
    expect(corePkgNode).toBeDefined();
    expect(corePkgNode?.type).toBe('WORKSPACE_PACKAGE');

    const webPkgNode = graph.nodes.find((n) => n.stableKey === 'pkg:@org/web');
    expect(webPkgNode).toBeDefined();

    // 3. Check External Dependency
    const reactNode = graph.nodes.find((n) => n.stableKey === 'dep:react');
    expect(reactNode).toBeDefined();
    expect(reactNode?.type).toBe('EXTERNAL_DEPENDENCY');

    // 4. Check File Nodes
    const fileNode = graph.nodes.find((n) => n.stableKey === 'file:apps/web/src/app.tsx');
    expect(fileNode).toBeDefined();
    expect(fileNode?.type).toBe('FILE');

    // 5. Check Config Node
    const configNode = graph.nodes.find((n) => n.stableKey === 'cfg:tsconfig.json');
    expect(configNode).toBeDefined();
    expect(configNode?.type).toBe('CONFIG');

    // 6. Check Edges
    // CONTAINS edges
    const repoContainsCore = graph.edges.find(
      (e) => e.sourceStableKey === 'repo:repo-123' && e.targetStableKey === 'pkg:@org/core',
    );
    expect(repoContainsCore?.type).toBe('CONTAINS');

    // Package contains file
    const coreContainsFile = graph.edges.find(
      (e) =>
        e.sourceStableKey === 'pkg:@org/core' &&
        e.targetStableKey === 'file:packages/core/src/index.ts',
    );
    expect(coreContainsFile?.type).toBe('CONTAINS');

    // WORKSPACE_DEPENDS_ON
    const webDependsOnCore = graph.edges.find(
      (e) => e.sourceStableKey === 'pkg:@org/web' && e.targetStableKey === 'pkg:@org/core',
    );
    expect(webDependsOnCore?.type).toBe('WORKSPACE_DEPENDS_ON');

    // DECLARES_DEPENDENCY
    const webDeclaresReact = graph.edges.find(
      (e) => e.sourceStableKey === 'pkg:@org/web' && e.targetStableKey === 'dep:react',
    );
    expect(webDeclaresReact?.type).toBe('DECLARES_DEPENDENCY');

    // IMPORTS (File to Workspace Package & File to External Dep)
    const appImportsCore = graph.edges.find(
      (e) =>
        e.sourceStableKey === 'file:apps/web/src/app.tsx' &&
        e.targetStableKey === 'pkg:@org/core' &&
        e.type === 'IMPORTS',
    );
    expect(appImportsCore).toBeDefined();

    const appImportsReact = graph.edges.find(
      (e) =>
        e.sourceStableKey === 'file:apps/web/src/app.tsx' &&
        e.targetStableKey === 'dep:react' &&
        e.type === 'IMPORTS',
    );
    expect(appImportsReact).toBeDefined();

    // Verify deterministic counts
    expect(graph.nodeCount).toBe(graph.nodes.length);
    expect(graph.edgeCount).toBe(graph.edges.length);
  });

  it('produces identical deterministic nodes and edges across multiple invocations', () => {
    const files: ExtractedFileEntry[] = [
      { path: 'package.json', byteSize: 50, content: Buffer.from('{}'), contentSha256: 'h1' },
      { path: 'src/main.ts', byteSize: 80, content: Buffer.from('import "./util";'), contentSha256: 'h2' },
      { path: 'src/util.ts', byteSize: 40, content: Buffer.from('export const u = 1;'), contentSha256: 'h3' },
    ];
    const classifications = new Map<string, FileClassification>([
      ['package.json', { language: 'JSON', category: 'BUILD_SYSTEM', isBinary: false }],
      ['src/main.ts', { language: 'TypeScript', category: 'SOURCE_CODE', isBinary: false }],
      ['src/util.ts', { language: 'TypeScript', category: 'SOURCE_CODE', isBinary: false }],
    ]);
    const manifestAnalysis: ManifestAnalysisResult = {
      isMonorepo: false,
      workspacePackages: [],
      workspaceLinks: [],
      externalDependencies: [],
    };
    const discoveredImports: DiscoveredImport[] = [
      {
        sourceFilePath: 'src/main.ts',
        specifier: './util',
        kind: 'FILE',
        resolvedTarget: 'src/util.ts',
        lineNumber: 1,
        statementKind: 'static_import',
      },
    ];

    const params = {
      repositoryId: 'repo-det',
      repositoryFullName: 'org/repo-det',
      defaultBranch: 'main',
      files,
      classifications,
      manifestAnalysis,
      discoveredImports,
    };

    const graph1 = builder.buildGraph(params);
    const graph2 = builder.buildGraph(params);

    expect(graph1.nodeCount).toBe(graph2.nodeCount);
    expect(graph1.edgeCount).toBe(graph2.edgeCount);
    expect(graph1.nodes.map((n) => n.stableKey)).toEqual(graph2.nodes.map((n) => n.stableKey));
    expect(graph1.edges.map((e) => `${e.sourceStableKey}->${e.targetStableKey}:${e.type}`)).toEqual(
      graph2.edges.map((e) => `${e.sourceStableKey}->${e.targetStableKey}:${e.type}`),
    );
  });
});
