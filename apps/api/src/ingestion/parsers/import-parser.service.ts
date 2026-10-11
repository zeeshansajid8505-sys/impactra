import { Injectable } from '@nestjs/common';
import { ExtractedFileEntry } from '../tar/tar-reader.service';

export interface DiscoveredImport {
  sourceFilePath: string;
  specifier: string;
  kind: 'FILE' | 'WORKSPACE_PACKAGE' | 'EXTERNAL_DEPENDENCY';
  resolvedTarget: string; // file path, package name, or external dependency name
  lineNumber: number;
  statementKind: 'static_import' | 'dynamic_import' | 'require' | 'export_from';
}

interface TsConfigAlias {
  prefix: string;
  targetPrefix: string;
}

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']);

// Regex patterns for ES import/export and CommonJS require
const STATIC_IMPORT_REGEX =
  /(?:^|\n)\s*import\s+(?:(?:(?:[a-zA-Z0-9_{}\s*,*]+)\s+from\s+)|(?:\*\s+as\s+[a-zA-Z0-9_]+\s+from\s+))?['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_REGEX = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
const EXPORT_FROM_REGEX = /(?:^|\n)\s*export\s+(?:[a-zA-Z0-9_{}\s*,*]+)\s+from\s+['"]([^'"]+)['"]/g;
const REQUIRE_REGEX = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_IMPORT_REGEX = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

@Injectable()
export class ImportParserService {
  /**
   * Statically parses code files in repository and extracts import dependencies.
   */
  parseImports(
    files: ExtractedFileEntry[],
    workspacePackageNames: Set<string>,
  ): DiscoveredImport[] {
    const knownFilePaths = new Set(files.map((f) => f.path));
    const pathAliases = this.extractPathAliases(files);
    const imports: DiscoveredImport[] = [];

    for (const file of files) {
      const ext = this.getExtension(file.path);
      if (!CODE_EXTENSIONS.has(ext)) continue;

      const contentStr = file.content.toString('utf8');
      const lines = contentStr.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        // 1. Static import
        this.extractMatches(
          line,
          STATIC_IMPORT_REGEX,
          file.path,
          lineNumber,
          'static_import',
          knownFilePaths,
          pathAliases,
          workspacePackageNames,
          imports,
        );

        // 2. Side effect import (import 'polyfill')
        this.extractMatches(
          line,
          SIDE_EFFECT_IMPORT_REGEX,
          file.path,
          lineNumber,
          'static_import',
          knownFilePaths,
          pathAliases,
          workspacePackageNames,
          imports,
        );

        // 3. Export from
        this.extractMatches(
          line,
          EXPORT_FROM_REGEX,
          file.path,
          lineNumber,
          'export_from',
          knownFilePaths,
          pathAliases,
          workspacePackageNames,
          imports,
        );

        // 4. Require
        this.extractMatches(
          line,
          REQUIRE_REGEX,
          file.path,
          lineNumber,
          'require',
          knownFilePaths,
          pathAliases,
          workspacePackageNames,
          imports,
        );

        // 5. Dynamic import
        this.extractMatches(
          line,
          DYNAMIC_IMPORT_REGEX,
          file.path,
          lineNumber,
          'dynamic_import',
          knownFilePaths,
          pathAliases,
          workspacePackageNames,
          imports,
        );
      }
    }

    return imports;
  }

  private extractMatches(
    line: string,
    regex: RegExp,
    sourceFilePath: string,
    lineNumber: number,
    statementKind: 'static_import' | 'dynamic_import' | 'require' | 'export_from',
    knownFilePaths: Set<string>,
    pathAliases: TsConfigAlias[],
    workspacePackageNames: Set<string>,
    results: DiscoveredImport[],
  ): void {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      const specifier = match[1]?.trim();
      if (!specifier) continue;

      if (specifier.startsWith('.')) {
        // Relative file import
        const resolvedPath = this.resolveRelativeImport(
          sourceFilePath,
          specifier,
          knownFilePaths,
        );
        results.push({
          sourceFilePath,
          specifier,
          kind: 'FILE',
          resolvedTarget: resolvedPath || specifier,
          lineNumber,
          statementKind,
        });
      } else {
        // Check for path alias match (e.g. @/* -> src/*)
        const aliasTarget = this.resolveAliasImport(specifier, pathAliases, knownFilePaths);
        if (aliasTarget) {
          results.push({
            sourceFilePath,
            specifier,
            kind: 'FILE',
            resolvedTarget: aliasTarget,
            lineNumber,
            statementKind,
          });
          continue;
        }

        // Package import: external or workspace package
        const basePkgName = this.extractPackageName(specifier);
        if (workspacePackageNames.has(basePkgName)) {
          results.push({
            sourceFilePath,
            specifier,
            kind: 'WORKSPACE_PACKAGE',
            resolvedTarget: basePkgName,
            lineNumber,
            statementKind,
          });
        } else {
          results.push({
            sourceFilePath,
            specifier,
            kind: 'EXTERNAL_DEPENDENCY',
            resolvedTarget: basePkgName,
            lineNumber,
            statementKind,
          });
        }
      }
    }
  }

  /**
   * Extracts path alias definitions from repository tsconfig.json files.
   */
  private extractPathAliases(files: ExtractedFileEntry[]): TsConfigAlias[] {
    const aliases: TsConfigAlias[] = [];

    for (const file of files) {
      const isTsConfig =
        file.path === 'tsconfig.json' ||
        file.path.endsWith('/tsconfig.json') ||
        file.path.endsWith('tsconfig.base.json');

      if (!isTsConfig) continue;

      try {
        const raw = file.content.toString('utf8');
        // Strip single and multi-line comments
        const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
        const json = JSON.parse(cleaned);
        const compilerOptions = json?.compilerOptions;

        if (compilerOptions?.paths) {
          const dir = file.path.includes('/')
            ? file.path.substring(0, file.path.lastIndexOf('/') + 1)
            : '';
          const baseUrl = compilerOptions.baseUrl
            ? compilerOptions.baseUrl.replace(/^\.\/?/, '').replace(/\/+$/, '')
            : '';
          const baseDir = [dir.replace(/\/+$/, ''), baseUrl].filter(Boolean).join('/');

          for (const [key, targetList] of Object.entries<string[]>(compilerOptions.paths)) {
            if (!Array.isArray(targetList) || targetList.length === 0) continue;
            const target = targetList[0].replace(/^\.\/?/, '');

            const keyHasStar = key.endsWith('/*');
            const targetHasStar = target.endsWith('/*');

            const prefix = keyHasStar ? key.slice(0, -1) : key;
            let targetPrefix = targetHasStar ? target.slice(0, -1) : target;
            if (baseDir) {
              targetPrefix = `${baseDir}/${targetPrefix}`.replace(/\/+/g, '/');
            }

            aliases.push({ prefix, targetPrefix });
          }
        }
      } catch {
        // Silently tolerate unparseable tsconfig comments or invalid json
      }
    }

    // Sort aliases by prefix length descending so more specific aliases match first
    return aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /**
   * Resolves an import specifier against configured tsconfig path aliases.
   */
  private resolveAliasImport(
    specifier: string,
    aliases: TsConfigAlias[],
    knownFilePaths: Set<string>,
  ): string | null {
    for (const alias of aliases) {
      if (specifier.startsWith(alias.prefix) || specifier === alias.prefix) {
        const remaining = specifier.slice(alias.prefix.length);
        const mapped = `${alias.targetPrefix}${remaining}`.replace(/\/+/g, '/');
        const resolved = this.resolvePathWithExtensions(mapped, knownFilePaths);
        if (resolved) {
          return resolved;
        }
      }
    }
    return null;
  }

  /**
   * Resolves a relative import path against the known inventory files.
   */
  private resolveRelativeImport(
    sourceFilePath: string,
    specifier: string,
    knownFilePaths: Set<string>,
  ): string | null {
    const sourceDirParts = sourceFilePath.split('/');
    sourceDirParts.pop(); // Remove filename, leave folder

    const specifierParts = specifier.split('/');
    const resolvedParts = [...sourceDirParts];

    for (const part of specifierParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        resolvedParts.pop();
      } else {
        resolvedParts.push(part);
      }
    }

    const basePath = resolvedParts.join('/');
    return this.resolvePathWithExtensions(basePath, knownFilePaths);
  }

  /**
   * Resolves a file path candidate against known file paths trying common extensions and index files.
   */
  private resolvePathWithExtensions(
    basePath: string,
    knownFilePaths: Set<string>,
  ): string | null {
    // 1. Direct match
    if (knownFilePaths.has(basePath)) return basePath;

    // 2. Direct with extension
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs'];
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (knownFilePaths.has(candidate)) return candidate;
    }

    // 3. Index file in folder
    for (const ext of extensions) {
      const candidate = `${basePath}/index${ext}`;
      if (knownFilePaths.has(candidate)) return candidate;
    }

    return null;
  }

  /**
   * Extracts base npm package name from an import specifier (e.g. '@nestjs/common/http' -> '@nestjs/common', 'lodash/get' -> 'lodash').
   */
  private extractPackageName(specifier: string): string {
    const parts = specifier.split('/');
    if (specifier.startsWith('@') && parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
  }

  private getExtension(path: string): string {
    const fileName = path.split('/').pop() || path;
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex === -1 || dotIndex === 0) return '';
    return fileName.substring(dotIndex + 1).toLowerCase();
  }
}
