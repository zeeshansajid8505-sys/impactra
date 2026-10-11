import { ImportParserService } from './import-parser.service';
import { ExtractedFileEntry } from '../tar/tar-reader.service';

describe('ImportParserService', () => {
  let parser: ImportParserService;

  beforeEach(() => {
    parser = new ImportParserService();
  });

  it('extracts static and relative imports correctly', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'src/main.ts',
        byteSize: 200,
        content: Buffer.from(`
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { helper } from './utils/helper';
import 'reflect-metadata';

async function bootstrap() {}
        `),
        contentSha256: 'h1',
      },
      {
        path: 'src/app.module.ts',
        byteSize: 100,
        content: Buffer.from('export class AppModule {}'),
        contentSha256: 'h2',
      },
      {
        path: 'src/utils/helper.ts',
        byteSize: 100,
        content: Buffer.from('export const helper = () => {};'),
        contentSha256: 'h3',
      },
    ];

    const workspacePackages = new Set<string>();
    const imports = parser.parseImports(files, workspacePackages);

    // 1. External @nestjs/core
    const nestImport = imports.find((i) => i.resolvedTarget === '@nestjs/core');
    expect(nestImport).toBeDefined();
    expect(nestImport?.kind).toBe('EXTERNAL_DEPENDENCY');

    // 2. Relative ./app.module -> src/app.module.ts
    const appModuleImport = imports.find((i) => i.resolvedTarget === 'src/app.module.ts');
    expect(appModuleImport).toBeDefined();
    expect(appModuleImport?.kind).toBe('FILE');

    // 3. Relative ./utils/helper -> src/utils/helper.ts
    const helperImport = imports.find((i) => i.resolvedTarget === 'src/utils/helper.ts');
    expect(helperImport).toBeDefined();
    expect(helperImport?.kind).toBe('FILE');

    // 4. Side effect 'reflect-metadata'
    const polyfillImport = imports.find((i) => i.resolvedTarget === 'reflect-metadata');
    expect(polyfillImport).toBeDefined();
    expect(polyfillImport?.kind).toBe('EXTERNAL_DEPENDENCY');
  });

  it('distinguishes workspace packages from external npm packages', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'apps/api/src/index.ts',
        byteSize: 150,
        content: Buffer.from(`
import { RiskLevel } from '@impactra/shared';
import express from 'express';
export * from './types';
        `),
        contentSha256: 'h4',
      },
      {
        path: 'apps/api/src/types.ts',
        byteSize: 50,
        content: Buffer.from('export interface Config {}'),
        contentSha256: 'h5',
      },
    ];

    const workspacePackages = new Set(['@impactra/shared', '@impactra/api']);
    const imports = parser.parseImports(files, workspacePackages);

    const sharedImport = imports.find((i) => i.specifier === '@impactra/shared');
    expect(sharedImport?.kind).toBe('WORKSPACE_PACKAGE');
    expect(sharedImport?.resolvedTarget).toBe('@impactra/shared');

    const expressImport = imports.find((i) => i.specifier === 'express');
    expect(expressImport?.kind).toBe('EXTERNAL_DEPENDENCY');

    const exportFrom = imports.find((i) => i.statementKind === 'export_from');
    expect(exportFrom?.resolvedTarget).toBe('apps/api/src/types.ts');
    expect(exportFrom?.kind).toBe('FILE');
  });

  it('extracts CommonJS require statements and dynamic imports', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'src/legacy.js',
        byteSize: 100,
        content: Buffer.from(`
const lodash = require('lodash');
const config = require('./config');
async function load() {
  const dynamic = await import('zod');
}
        `),
        contentSha256: 'h6',
      },
      {
        path: 'src/config.json',
        byteSize: 30,
        content: Buffer.from('{}'),
        contentSha256: 'h7',
      },
    ];

    const imports = parser.parseImports(files, new Set());

    const lodashRequire = imports.find((i) => i.specifier === 'lodash');
    expect(lodashRequire?.statementKind).toBe('require');
    expect(lodashRequire?.kind).toBe('EXTERNAL_DEPENDENCY');

    const configRequire = imports.find((i) => i.specifier === './config');
    expect(configRequire?.resolvedTarget).toBe('src/config.json');

    const zodDynamic = imports.find((i) => i.specifier === 'zod');
    expect(zodDynamic?.statementKind).toBe('dynamic_import');
  });

  it('resolves tsconfig.json path aliases correctly to internal files', () => {
    const files: ExtractedFileEntry[] = [
      {
        path: 'tsconfig.json',
        byteSize: 200,
        content: Buffer.from(`
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}
        `),
        contentSha256: 'h-ts',
      },
      {
        path: 'src/components/Button.tsx',
        byteSize: 50,
        content: Buffer.from('export const Button = () => null;'),
        contentSha256: 'h-btn',
      },
      {
        path: 'src/utils/math.ts',
        byteSize: 50,
        content: Buffer.from('export const add = (a: number, b: number) => a + b;'),
        contentSha256: 'h-math',
      },
      {
        path: 'src/main.ts',
        byteSize: 150,
        content: Buffer.from(`
import { Button } from '@/components/Button';
import { add } from '@/utils/math';
import { Other } from '@components/Button';
import { Missing } from '@/missing/module';
        `),
        contentSha256: 'h-main',
      },
    ];

    const imports = parser.parseImports(files, new Set());

    // 1. @/components/Button -> src/components/Button.tsx
    const btnImport = imports.find((i) => i.specifier === '@/components/Button');
    expect(btnImport).toBeDefined();
    expect(btnImport?.kind).toBe('FILE');
    expect(btnImport?.resolvedTarget).toBe('src/components/Button.tsx');

    // 2. @/utils/math -> src/utils/math.ts
    const mathImport = imports.find((i) => i.specifier === '@/utils/math');
    expect(mathImport).toBeDefined();
    expect(mathImport?.kind).toBe('FILE');
    expect(mathImport?.resolvedTarget).toBe('src/utils/math.ts');

    // 3. @components/Button -> src/components/Button.tsx
    const directCompImport = imports.find((i) => i.specifier === '@components/Button');
    expect(directCompImport).toBeDefined();
    expect(directCompImport?.kind).toBe('FILE');
    expect(directCompImport?.resolvedTarget).toBe('src/components/Button.tsx');

    // 4. @/missing/module (does not resolve to file) falls back to external
    const missingImport = imports.find((i) => i.specifier === '@/missing/module');
    expect(missingImport).toBeDefined();
    expect(missingImport?.kind).toBe('EXTERNAL_DEPENDENCY');
  });

  it('safely parses arbitrary code without executing commands or code side-effects', () => {
    const maliciousCode = `
      // Dangerous commands that must never run:
      require('child_process').execSync('rm -rf /');
      eval('process.exit(1)');
      import dangerous from 'malicious-package';
    `;

    const files: ExtractedFileEntry[] = [
      {
        path: 'src/payload.ts',
        byteSize: maliciousCode.length,
        content: Buffer.from(maliciousCode),
        contentSha256: 'h-dangerous',
      },
    ];

    // Execution would crash the test process; static parsing only inspects specifier tokens
    const imports = parser.parseImports(files, new Set());
    expect(imports).toBeDefined();
    expect(imports.some((i) => i.specifier === 'child_process')).toBe(true);
    expect(imports.some((i) => i.specifier === 'malicious-package')).toBe(true);
  });
});
