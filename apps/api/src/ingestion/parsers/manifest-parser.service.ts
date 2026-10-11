import { Injectable, Logger } from '@nestjs/common';
import { ExtractedFileEntry } from '../tar/tar-reader.service';

export interface DiscoveredPackage {
  name: string;
  version: string;
  manifestPath: string;
  packageDirectory: string;
  isPrivate: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface WorkspaceDependencyLink {
  sourcePackageName: string;
  sourcePackageDir: string;
  targetPackageName: string;
  versionSpecifier: string;
  kind: 'dependency' | 'devDependency' | 'peerDependency';
}

export interface ExternalDependencyDecl {
  packageName: string;
  versionSpecifier: string;
  declaredByPackage: string;
  kind: 'dependency' | 'devDependency' | 'peerDependency';
}

export interface ManifestAnalysisResult {
  isMonorepo: boolean;
  workspacePackages: DiscoveredPackage[];
  workspaceLinks: WorkspaceDependencyLink[];
  externalDependencies: ExternalDependencyDecl[];
}

@Injectable()
export class ManifestParserService {
  private readonly logger = new Logger(ManifestParserService.name);

  /**
   * Analyzes all package manifest files in the repository.
   */
  parse(files: ExtractedFileEntry[]): ManifestAnalysisResult {
    const packageJsonFiles = files.filter((f) => f.path.endsWith('package.json'));
    const pnpmWorkspaceFile = files.find((f) => f.path === 'pnpm-workspace.yaml');

    const discoveredPackages: DiscoveredPackage[] = [];

    for (const file of packageJsonFiles) {
      try {
        const text = file.content.toString('utf8');
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') continue;

        const name = parsed.name || this.fallbackPackageName(file.path);
        const version = parsed.version || '0.0.0';
        const isPrivate = Boolean(parsed.private);
        const scripts = typeof parsed.scripts === 'object' && parsed.scripts ? parsed.scripts : {};
        const dependencies =
          typeof parsed.dependencies === 'object' && parsed.dependencies ? parsed.dependencies : {};
        const devDependencies =
          typeof parsed.devDependencies === 'object' && parsed.devDependencies
            ? parsed.devDependencies
            : {};
        const peerDependencies =
          typeof parsed.peerDependencies === 'object' && parsed.peerDependencies
            ? parsed.peerDependencies
            : {};

        const packageDirectory =
          file.path === 'package.json'
            ? '.'
            : file.path.substring(0, file.path.lastIndexOf('/'));

        discoveredPackages.push({
          name,
          version,
          manifestPath: file.path,
          packageDirectory,
          isPrivate,
          scripts,
          dependencies,
          devDependencies,
          peerDependencies,
        });
      } catch (err: unknown) {
        this.logger.debug(`Could not parse package.json at ${file.path}: ${err}`);
      }
    }

    const packageNames = new Set(discoveredPackages.map((p) => p.name));
    const isMonorepo = Boolean(pnpmWorkspaceFile) || discoveredPackages.length > 1;

    const workspaceLinks: WorkspaceDependencyLink[] = [];
    const externalDependencies: ExternalDependencyDecl[] = [];

    for (const pkg of discoveredPackages) {
      // 1. dependencies
      for (const [depName, spec] of Object.entries(pkg.dependencies)) {
        if (packageNames.has(depName) || spec.startsWith('workspace:')) {
          workspaceLinks.push({
            sourcePackageName: pkg.name,
            sourcePackageDir: pkg.packageDirectory,
            targetPackageName: depName,
            versionSpecifier: spec,
            kind: 'dependency',
          });
        } else {
          externalDependencies.push({
            packageName: depName,
            versionSpecifier: spec,
            declaredByPackage: pkg.name,
            kind: 'dependency',
          });
        }
      }

      // 2. devDependencies
      for (const [depName, spec] of Object.entries(pkg.devDependencies)) {
        if (packageNames.has(depName) || spec.startsWith('workspace:')) {
          workspaceLinks.push({
            sourcePackageName: pkg.name,
            sourcePackageDir: pkg.packageDirectory,
            targetPackageName: depName,
            versionSpecifier: spec,
            kind: 'devDependency',
          });
        } else {
          externalDependencies.push({
            packageName: depName,
            versionSpecifier: spec,
            declaredByPackage: pkg.name,
            kind: 'devDependency',
          });
        }
      }

      // 3. peerDependencies
      for (const [depName, spec] of Object.entries(pkg.peerDependencies)) {
        if (packageNames.has(depName) || spec.startsWith('workspace:')) {
          workspaceLinks.push({
            sourcePackageName: pkg.name,
            sourcePackageDir: pkg.packageDirectory,
            targetPackageName: depName,
            versionSpecifier: spec,
            kind: 'peerDependency',
          });
        } else {
          externalDependencies.push({
            packageName: depName,
            versionSpecifier: spec,
            declaredByPackage: pkg.name,
            kind: 'peerDependency',
          });
        }
      }
    }

    return {
      isMonorepo,
      workspacePackages: discoveredPackages,
      workspaceLinks,
      externalDependencies,
    };
  }

  private fallbackPackageName(manifestPath: string): string {
    if (manifestPath === 'package.json') return 'root';
    const parts = manifestPath.split('/');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return manifestPath;
  }
}
