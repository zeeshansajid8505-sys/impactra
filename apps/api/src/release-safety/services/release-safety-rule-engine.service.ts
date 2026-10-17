import { Injectable, Logger } from '@nestjs/common';
import {
  EvaluationEvidenceInput,
  ComputedSignal,
  RELEASE_SAFETY_POLICY_VERSION,
  sortSignalsDeterministically,
} from '../policy/release-safety-policy';

@Injectable()
export class ReleaseSafetyRuleEngineService {
  private readonly logger = new Logger(ReleaseSafetyRuleEngineService.name);

  /**
   * Evaluates all deterministic release safety rules against the change evidence.
   * Returns deterministic list of signals sorted by blocking -> severity -> scoreDelta -> ruleId.
   */
  evaluateRules(evidence: EvaluationEvidenceInput): ComputedSignal[] {
    const signals: ComputedSignal[] = [];

    // RS-BLAST-001: First-Order Impact
    const firstOrder = evidence.blastRadiusAnalysis.firstOrderCount;
    if (firstOrder >= 10) {
      signals.push({
        ruleId: 'RS-BLAST-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'HIGH',
        scoreDelta: 20,
        blocking: false,
        requiresReview: true,
        title: 'Extensive First-Order Blast Radius',
        description: `${firstOrder} direct dependencies impacted by this change.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { firstOrderCount: firstOrder, threshold: 10 },
      });
    } else if (firstOrder >= 5) {
      signals.push({
        ruleId: 'RS-BLAST-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'MEDIUM',
        scoreDelta: 12,
        blocking: false,
        requiresReview: false,
        title: 'Moderate First-Order Blast Radius',
        description: `${firstOrder} direct dependencies impacted by this change.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { firstOrderCount: firstOrder, threshold: 5 },
      });
    } else if (firstOrder >= 1) {
      signals.push({
        ruleId: 'RS-BLAST-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'LOW',
        scoreDelta: 5,
        blocking: false,
        requiresReview: false,
        title: 'Direct Blast Radius Impact',
        description: `${firstOrder} direct dependency impacted by this change.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { firstOrderCount: firstOrder, threshold: 1 },
      });
    }

    // RS-BLAST-002: Transitive Impact
    const transitive = evidence.blastRadiusAnalysis.transitiveCount;
    if (transitive >= 20) {
      signals.push({
        ruleId: 'RS-BLAST-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'HIGH',
        scoreDelta: 20,
        blocking: false,
        requiresReview: true,
        title: 'High Transitive Blast Radius Propagation',
        description: `${transitive} transitive dependencies affected across the dependency graph.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { transitiveCount: transitive, threshold: 20 },
      });
    } else if (transitive >= 10) {
      signals.push({
        ruleId: 'RS-BLAST-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'MEDIUM',
        scoreDelta: 10,
        blocking: false,
        requiresReview: false,
        title: 'Moderate Transitive Blast Radius',
        description: `${transitive} transitive dependencies affected across the dependency graph.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { transitiveCount: transitive, threshold: 10 },
      });
    } else if (transitive >= 3) {
      signals.push({
        ruleId: 'RS-BLAST-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'LOW',
        scoreDelta: 5,
        blocking: false,
        requiresReview: false,
        title: 'Low Transitive Blast Radius',
        description: `${transitive} transitive dependencies affected.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { transitiveCount: transitive, threshold: 3 },
      });
    }

    // RS-BLAST-003: Critical Total Affected Entities
    const affected = evidence.blastRadiusAnalysis.affectedNodeCount;
    if (affected >= 30) {
      signals.push({
        ruleId: 'RS-BLAST-003',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'CRITICAL',
        scoreDelta: 30,
        blocking: true,
        requiresReview: true,
        title: 'Critical Blast Radius Volume Exceeded',
        description: `${affected} total entities impacted, exceeding safe autonomous release boundary (>= 30).`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { affectedNodeCount: affected, threshold: 30 },
      });
    } else if (affected >= 15) {
      signals.push({
        ruleId: 'RS-BLAST-003',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'HIGH',
        scoreDelta: 15,
        blocking: false,
        requiresReview: true,
        title: 'Elevated Blast Radius Volume',
        description: `${affected} total entities impacted in blast radius (>= 15).`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { affectedNodeCount: affected, threshold: 15 },
      });
    }

    // RS-DEPTH-001: Blast Radius Max Depth
    const depth = evidence.blastRadiusAnalysis.maxDepth;
    if (depth >= 5) {
      signals.push({
        ruleId: 'RS-DEPTH-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'HIGH',
        scoreDelta: 15,
        blocking: false,
        requiresReview: true,
        title: 'Deep Impact Chain Traversal',
        description: `Impact traverses ${depth} dependency hops away from change roots.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { maxDepth: depth, threshold: 5 },
      });
    } else if (depth >= 3) {
      signals.push({
        ruleId: 'RS-DEPTH-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'MEDIUM',
        scoreDelta: 8,
        blocking: false,
        requiresReview: false,
        title: 'Moderate Impact Chain Depth',
        description: `Impact reaches depth ${depth} in dependency graph.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { maxDepth: depth, threshold: 3 },
      });
    } else if (depth >= 2) {
      signals.push({
        ruleId: 'RS-DEPTH-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'BLAST_RADIUS',
        severity: 'LOW',
        scoreDelta: 3,
        blocking: false,
        requiresReview: false,
        title: 'Shallow Transitive Depth',
        description: `Impact reaches depth ${depth}.`,
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { maxDepth: depth, threshold: 2 },
      });
    }

    // RS-ARCH-001: Configuration Mutation
    const configFindings = evidence.blastRadiusFindings.filter(
      (f) => f.nodeType === 'CONFIG',
    );
    if (configFindings.length > 0) {
      signals.push({
        ruleId: 'RS-ARCH-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'ARCHITECTURE',
        severity: 'HIGH',
        scoreDelta: 15,
        blocking: false,
        requiresReview: true,
        title: 'Configuration Mutation in Blast Radius',
        description: `${configFindings.length} configuration file(s) affected in blast radius.`,
        evidenceType: 'BLAST_RADIUS_FINDING',
        evidenceReferenceId: configFindings[0].id,
        evidenceStableKey: configFindings[0].stableKey,
        evidenceJson: {
          configCount: configFindings.length,
          affectedConfigs: configFindings.map((c) => ({
            name: c.nodeName,
            path: c.nodePath,
            stableKey: c.stableKey,
          })),
        },
      });
    }

    // RS-ARCH-002: Cross-Package Architecture Impact
    const packageFindings = evidence.blastRadiusFindings.filter(
      (f) => f.nodeType === 'WORKSPACE_PACKAGE',
    );
    if (packageFindings.length > 0) {
      signals.push({
        ruleId: 'RS-ARCH-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'ARCHITECTURE',
        severity: 'HIGH',
        scoreDelta: 15,
        blocking: false,
        requiresReview: true,
        title: 'Cross-Package Architecture Boundary Traversed',
        description: `${packageFindings.length} workspace package boundary(s) traversed by change impact.`,
        evidenceType: 'BLAST_RADIUS_FINDING',
        evidenceReferenceId: packageFindings[0].id,
        evidenceStableKey: packageFindings[0].stableKey,
        evidenceJson: {
          packageCount: packageFindings.length,
          packages: packageFindings.map((p) => ({
            name: p.nodeName,
            path: p.nodePath,
            stableKey: p.stableKey,
          })),
        },
      });
    }

    // RS-CHANGE-001: Change Footprint Breadth
    const revisionTotalFiles =
      evidence.changeRevision.filesAdded +
      evidence.changeRevision.filesModified +
      evidence.changeRevision.filesDeleted +
      evidence.changeRevision.filesRenamed;
    const totalFiles = Math.max(
      evidence.changedFiles.length,
      revisionTotalFiles,
    );
    if (totalFiles >= 25) {
      signals.push({
        ruleId: 'RS-CHANGE-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'CHANGE_SIZE',
        severity: 'HIGH',
        scoreDelta: 20,
        blocking: false,
        requiresReview: true,
        title: 'Large File Footprint',
        description: `${totalFiles} files changed in revision (>= 25).`,
        evidenceType: 'CHANGE_REVISION',
        evidenceReferenceId: evidence.changeRevision.id,
        evidenceStableKey: null,
        evidenceJson: { totalFiles, threshold: 25 },
      });
    } else if (totalFiles >= 10) {
      signals.push({
        ruleId: 'RS-CHANGE-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'CHANGE_SIZE',
        severity: 'MEDIUM',
        scoreDelta: 10,
        blocking: false,
        requiresReview: false,
        title: 'Moderate File Footprint',
        description: `${totalFiles} files changed in revision (>= 10).`,
        evidenceType: 'CHANGE_REVISION',
        evidenceReferenceId: evidence.changeRevision.id,
        evidenceStableKey: null,
        evidenceJson: { totalFiles, threshold: 10 },
      });
    } else if (totalFiles >= 5) {
      signals.push({
        ruleId: 'RS-CHANGE-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'CHANGE_SIZE',
        severity: 'LOW',
        scoreDelta: 4,
        blocking: false,
        requiresReview: false,
        title: 'Multi-File Change Footprint',
        description: `${totalFiles} files changed in revision (>= 5).`,
        evidenceType: 'CHANGE_REVISION',
        evidenceReferenceId: evidence.changeRevision.id,
        evidenceStableKey: null,
        evidenceJson: { totalFiles, threshold: 5 },
      });
    }

    // RS-CHANGE-002: Code Churn Volume
    const totalChurn = evidence.changedFiles.reduce(
      (sum, f) => sum + (f.additions || 0) + (f.deletions || 0),
      0,
    );
    if (totalChurn >= 1000) {
      signals.push({
        ruleId: 'RS-CHANGE-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'CHANGE_SIZE',
        severity: 'HIGH',
        scoreDelta: 15,
        blocking: false,
        requiresReview: true,
        title: 'Substantial Code Churn Volume',
        description: `${totalChurn} lines added or deleted across changed files (>= 1000).`,
        evidenceType: 'CHANGE_REVISION',
        evidenceReferenceId: evidence.changeRevision.id,
        evidenceStableKey: null,
        evidenceJson: { totalChurn, threshold: 1000 },
      });
    } else if (totalChurn >= 500) {
      signals.push({
        ruleId: 'RS-CHANGE-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'CHANGE_SIZE',
        severity: 'MEDIUM',
        scoreDelta: 8,
        blocking: false,
        requiresReview: false,
        title: 'Elevated Code Churn Volume',
        description: `${totalChurn} lines added or deleted across changed files (>= 500).`,
        evidenceType: 'CHANGE_REVISION',
        evidenceReferenceId: evidence.changeRevision.id,
        evidenceStableKey: null,
        evidenceJson: { totalChurn, threshold: 500 },
      });
    }

    // RS-DEP-001: Dependency Edge Removed
    const removedDeltas = evidence.dependencyDeltas.filter(
      (d) => d.deltaType === 'EDGE_REMOVED',
    );
    if (removedDeltas.length > 0) {
      signals.push({
        ruleId: 'RS-DEP-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'DEPENDENCY',
        severity: 'HIGH',
        scoreDelta: 20,
        blocking: false,
        requiresReview: true,
        title: 'Dependency Graph Edge Removed',
        description: `${removedDeltas.length} dependency edge(s) severed or deleted.`,
        evidenceType: 'DEPENDENCY_DELTA',
        evidenceReferenceId: removedDeltas[0].id,
        evidenceStableKey: removedDeltas[0].sourceStableKey,
        evidenceJson: {
          removedCount: removedDeltas.length,
          edges: removedDeltas.map((d) => ({
            source: d.sourceStableKey,
            target: d.targetStableKey,
            type: d.edgeType,
          })),
        },
      });
    }

    // RS-DEP-002: Dependency Edge Added
    const addedDeltas = evidence.dependencyDeltas.filter(
      (d) => d.deltaType === 'EDGE_ADDED',
    );
    if (addedDeltas.length > 0) {
      signals.push({
        ruleId: 'RS-DEP-002',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'DEPENDENCY',
        severity: 'LOW',
        scoreDelta: 10,
        blocking: false,
        requiresReview: false,
        title: 'New Dependency Edge Introduced',
        description: `${addedDeltas.length} new dependency edge(s) added to the graph.`,
        evidenceType: 'DEPENDENCY_DELTA',
        evidenceReferenceId: addedDeltas[0].id,
        evidenceStableKey: addedDeltas[0].targetStableKey,
        evidenceJson: {
          addedCount: addedDeltas.length,
          edges: addedDeltas.map((d) => ({
            source: d.sourceStableKey,
            target: d.targetStableKey,
            type: d.edgeType,
          })),
        },
      });
    }

    // RS-DEP-003: External Dependency in Blast Radius
    const externalFindings = evidence.blastRadiusFindings.filter(
      (f) => f.nodeType === 'EXTERNAL_DEPENDENCY',
    );
    if (externalFindings.length > 0) {
      signals.push({
        ruleId: 'RS-DEP-003',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'DEPENDENCY',
        severity: 'MEDIUM',
        scoreDelta: 10,
        blocking: false,
        requiresReview: false,
        title: 'External Dependency in Blast Radius',
        description: `${externalFindings.length} third-party or external dependency node(s) impacted.`,
        evidenceType: 'BLAST_RADIUS_FINDING',
        evidenceReferenceId: externalFindings[0].id,
        evidenceStableKey: externalFindings[0].stableKey,
        evidenceJson: {
          externalCount: externalFindings.length,
          externalNodes: externalFindings.map((e) => ({
            name: e.nodeName,
            stableKey: e.stableKey,
          })),
        },
      });
    }

    // RS-QUALITY-001: Truncated Blast Radius Traversal
    if (evidence.blastRadiusAnalysis.truncated) {
      signals.push({
        ruleId: 'RS-QUALITY-001',
        ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
        category: 'ANALYSIS_QUALITY',
        severity: 'HIGH',
        scoreDelta: 25,
        blocking: false,
        requiresReview: true,
        title: 'Blast Radius Traversal Incomplete (Truncated)',
        description:
          'Blast-radius graph traversal reached max depth or safety limit before exhausting the graph.',
        evidenceType: 'BLAST_RADIUS_ANALYSIS',
        evidenceReferenceId: evidence.blastRadiusAnalysis.id,
        evidenceStableKey: null,
        evidenceJson: { truncated: true },
      });
    }

    return sortSignalsDeterministically(signals);
  }
}
