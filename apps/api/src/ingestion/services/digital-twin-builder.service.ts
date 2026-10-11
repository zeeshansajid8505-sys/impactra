import { Injectable } from '@nestjs/common';
import {
  DigitalTwinNodeTypeEnum,
  DigitalTwinEdgeType,
} from '@impactra/shared';
import { ExtractedFileEntry } from '../tar/tar-reader.service';
import { FileClassification } from '../parsers/file-classifier.service';
import { ManifestAnalysisResult } from '../parsers/manifest-parser.service';
import { DiscoveredImport } from '../parsers/import-parser.service';

export interface TwinNodeDraft {
  stableKey: string;
  type: DigitalTwinNodeTypeEnum;
  name: string;
  path: string | null;
  metadata: Record<string, unknown>;
}

export interface TwinEdgeDraft {
  sourceStableKey: string;
  targetStableKey: string;
  type: DigitalTwinEdgeType;
  evidence: Record<string, unknown>;
}

export interface BuiltDigitalTwinGraph {
  nodes: TwinNodeDraft[];
  edges: TwinEdgeDraft[];
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

@Injectable()
export class DigitalTwinBuilderService {
  /**
   * Constructs the architectural Digital Twin graph deterministically.
   */
  buildGraph(params: {
    repositoryId: string;
    repositoryFullName: string;
    defaultBranch: string;
    files: ExtractedFileEntry[];
    classifications: Map<string, FileClassification>;
    manifestAnalysis: ManifestAnalysisResult;
    discoveredImports: DiscoveredImport[];
  }): BuiltDigitalTwinGraph {
    const {
      repositoryId,
      repositoryFullName,
      defaultBranch,
      files,
      classifications,
      manifestAnalysis,
      discoveredImports,
    } = params;

    const nodeMap = new Map<string, TwinNodeDraft>();
    const edgeMap = new Map<string, TwinEdgeDraft>();

    // 1. Root REPOSITORY Node
    const repoStableKey = `repo:${repositoryId}`;
    nodeMap.set(repoStableKey, {
      stableKey: repoStableKey,
      type: 'REPOSITORY',
      name: repositoryFullName,
      path: null,
      metadata: {
        repositoryId,
        fullName: repositoryFullName,
        defaultBranch,
      },
    });

    // 2. WORKSPACE_PACKAGE Nodes
    const packageByDir = new Map<string, TwinNodeDraft>();
    for (const pkg of manifestAnalysis.workspacePackages) {
      const pkgStableKey = `pkg:${pkg.name}`;
      const node: TwinNodeDraft = {
        stableKey: pkgStableKey,
        type: 'WORKSPACE_PACKAGE',
        name: pkg.name,
        path: pkg.packageDirectory,
        metadata: {
          version: pkg.version,
          manifestPath: pkg.manifestPath,
          isPrivate: pkg.isPrivate,
          scriptsCount: Object.keys(pkg.scripts).length,
        },
      };
      nodeMap.set(pkgStableKey, node);
      packageByDir.set(pkg.packageDirectory, node);

      // Edge: REPOSITORY CONTAINS WORKSPACE_PACKAGE
      this.addEdge(edgeMap, repoStableKey, pkgStableKey, 'CONTAINS', {
        relationship: 'workspace_package',
      });
    }

    // 3. EXTERNAL_DEPENDENCY Nodes
    const externalDepVersions = new Map<string, Set<string>>();
    for (const dep of manifestAnalysis.externalDependencies) {
      if (!externalDepVersions.has(dep.packageName)) {
        externalDepVersions.set(dep.packageName, new Set());
      }
      externalDepVersions.get(dep.packageName)!.add(dep.versionSpecifier);
    }
    for (const imp of discoveredImports) {
      if (imp.kind === 'EXTERNAL_DEPENDENCY') {
        if (!externalDepVersions.has(imp.resolvedTarget)) {
          externalDepVersions.set(imp.resolvedTarget, new Set());
        }
      }
    }

    for (const [depName, versions] of externalDepVersions.entries()) {
      const depStableKey = `dep:${depName}`;
      nodeMap.set(depStableKey, {
        stableKey: depStableKey,
        type: 'EXTERNAL_DEPENDENCY',
        name: depName,
        path: null,
        metadata: {
          packageName: depName,
          versions: Array.from(versions),
        },
      });
    }

    // 4. FILE & CONFIG Nodes
    for (const file of files) {
      const classification = classifications.get(file.path) || {
        language: null,
        category: 'SOURCE_CODE',
        isBinary: false,
      };

      const isConfig = classification.category === 'CONFIGURATION';
      const nodeType: DigitalTwinNodeTypeEnum = isConfig ? 'CONFIG' : 'FILE';
      const fileStableKey = isConfig ? `cfg:${file.path}` : `file:${file.path}`;
      const fileName = file.path.split('/').pop() || file.path;

      nodeMap.set(fileStableKey, {
        stableKey: fileStableKey,
        type: nodeType,
        name: fileName,
        path: file.path,
        metadata: {
          byteSize: file.byteSize,
          language: classification.language,
          category: classification.category,
          isBinary: classification.isBinary,
          contentSha256: file.contentSha256,
        },
      });

      // Find enclosing package or link to repository root
      const enclosingPkg = this.findEnclosingPackage(file.path, manifestAnalysis.workspacePackages);
      if (enclosingPkg) {
        this.addEdge(edgeMap, `pkg:${enclosingPkg.name}`, fileStableKey, 'CONTAINS', {
          enclosingDirectory: enclosingPkg.packageDirectory,
        });
      } else {
        this.addEdge(edgeMap, repoStableKey, fileStableKey, 'CONTAINS', {
          scope: 'repository_root',
        });
      }
    }

    // 5. WORKSPACE_DEPENDS_ON Edges
    for (const link of manifestAnalysis.workspaceLinks) {
      const srcKey = `pkg:${link.sourcePackageName}`;
      const tgtKey = `pkg:${link.targetPackageName}`;
      if (nodeMap.has(srcKey) && nodeMap.has(tgtKey)) {
        this.addEdge(edgeMap, srcKey, tgtKey, 'WORKSPACE_DEPENDS_ON', {
          versionSpecifier: link.versionSpecifier,
          dependencyKind: link.kind,
        });
      }
    }

    // 6. DECLARES_DEPENDENCY Edges
    for (const decl of manifestAnalysis.externalDependencies) {
      const srcKey = `pkg:${decl.declaredByPackage}`;
      const tgtKey = `dep:${decl.packageName}`;
      if (nodeMap.has(srcKey) && nodeMap.has(tgtKey)) {
        this.addEdge(edgeMap, srcKey, tgtKey, 'DECLARES_DEPENDENCY', {
          versionSpecifier: decl.versionSpecifier,
          dependencyKind: decl.kind,
        });
      }
    }

    // 7. IMPORTS Edges
    for (const imp of discoveredImports) {
      const srcCls = classifications.get(imp.sourceFilePath);
      const isSrcConfig = srcCls?.category === 'CONFIGURATION';
      const srcKey = isSrcConfig ? `cfg:${imp.sourceFilePath}` : `file:${imp.sourceFilePath}`;

      let tgtKey: string | null = null;
      if (imp.kind === 'FILE') {
        const tgtCls = classifications.get(imp.resolvedTarget);
        const isTgtConfig = tgtCls?.category === 'CONFIGURATION';
        tgtKey = isTgtConfig ? `cfg:${imp.resolvedTarget}` : `file:${imp.resolvedTarget}`;
      } else if (imp.kind === 'WORKSPACE_PACKAGE') {
        tgtKey = `pkg:${imp.resolvedTarget}`;
      } else if (imp.kind === 'EXTERNAL_DEPENDENCY') {
        tgtKey = `dep:${imp.resolvedTarget}`;
      }

      if (srcKey && tgtKey && nodeMap.has(srcKey) && nodeMap.has(tgtKey) && srcKey !== tgtKey) {
        this.addEdge(edgeMap, srcKey, tgtKey, 'IMPORTS', {
          specifier: imp.specifier,
          lineNumber: imp.lineNumber,
          statementKind: imp.statementKind,
        });
      }
    }

    const nodes = Array.from(nodeMap.values());
    const edges = Array.from(edgeMap.values());

    const nodesByType: Record<string, number> = {};
    for (const n of nodes) {
      nodesByType[n.type] = (nodesByType[n.type] || 0) + 1;
    }

    const edgesByType: Record<string, number> = {};
    for (const e of edges) {
      edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
    }

    return {
      nodes,
      edges,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodesByType,
      edgesByType,
    };
  }

  private addEdge(
    edgeMap: Map<string, TwinEdgeDraft>,
    sourceStableKey: string,
    targetStableKey: string,
    type: DigitalTwinEdgeType,
    evidence: Record<string, unknown>,
  ): void {
    const key = `${sourceStableKey}-->${targetStableKey}::${type}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        sourceStableKey,
        targetStableKey,
        type,
        evidence,
      });
    }
  }

  private findEnclosingPackage(
    filePath: string,
    packages: { name: string; packageDirectory: string }[],
  ): { name: string; packageDirectory: string } | null {
    let longestMatch: { name: string; packageDirectory: string } | null = null;

    for (const pkg of packages) {
      if (pkg.packageDirectory === '.' || !pkg.packageDirectory) continue;
      const prefix = `${pkg.packageDirectory}/`;
      if (filePath.startsWith(prefix)) {
        if (!longestMatch || pkg.packageDirectory.length > longestMatch.packageDirectory.length) {
          longestMatch = pkg;
        }
      }
    }

    return longestMatch;
  }
}
