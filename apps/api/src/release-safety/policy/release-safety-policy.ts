import {
  ReleaseRiskLevel,
  ReleaseSafetyDecision,
  ReleaseSafetySignalCategory,
  ReleaseSafetySignalSeverity,
  ChangedFileStatus,
  DependencyDeltaType,
  DigitalTwinNodeType,
  BlastRadiusCategory,
  BlastRadiusImpactClass,
} from '@impactra/database';

export const RELEASE_SAFETY_POLICY_VERSION = 'impactra-release-safety-v1';

export const RISK_SCORE_BOUNDARIES = {
  MIN: 0,
  MAX: 100,
} as const;

export const RISK_LEVEL_THRESHOLDS = {
  LOW_MAX: 24,
  MEDIUM_MAX: 49,
  HIGH_MAX: 74,
  CRITICAL_MIN: 75,
} as const;

export const DECISION_THRESHOLDS = {
  PASS_MAX_SCORE: 39,
  REVIEW_REQUIRED_MAX_SCORE: 74,
  BLOCKED_MIN_SCORE: 75,
} as const;

export interface EvaluationEvidenceInput {
  changeRevision: {
    id: string;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed: number;
  };
  changedFiles: Array<{
    id: string;
    newPath: string | null;
    oldPath: string | null;
    status: ChangedFileStatus;
    additions: number;
    deletions: number;
    changes: number;
  }>;
  dependencyDeltas: Array<{
    id: string;
    deltaType: DependencyDeltaType;
    sourceStableKey: string;
    targetStableKey: string;
    edgeType: string;
  }>;
  blastRadiusAnalysis: {
    id: string;
    maxDepth: number;
    rootCount: number;
    affectedNodeCount: number;
    firstOrderCount: number;
    transitiveCount: number;
    truncated: boolean;
  };
  blastRadiusFindings: Array<{
    id: string;
    stableKey: string;
    nodeName: string;
    nodePath: string | null;
    nodeType: DigitalTwinNodeType;
    category: BlastRadiusCategory;
    impactClass: BlastRadiusImpactClass;
    depth: number;
  }>;
}

export interface ComputedSignal {
  ruleId: string;
  ruleVersion: string;
  category: ReleaseSafetySignalCategory;
  severity: ReleaseSafetySignalSeverity;
  scoreDelta: number;
  blocking: boolean;
  requiresReview: boolean;
  title: string;
  description: string;
  evidenceType: string;
  evidenceReferenceId: string | null;
  evidenceStableKey: string | null;
  evidenceJson: Record<string, unknown>;
}

export function computeRiskLevel(score: number): ReleaseRiskLevel {
  const clamped = Math.max(RISK_SCORE_BOUNDARIES.MIN, Math.min(RISK_SCORE_BOUNDARIES.MAX, Math.round(score)));
  if (clamped <= RISK_LEVEL_THRESHOLDS.LOW_MAX) return 'LOW';
  if (clamped <= RISK_LEVEL_THRESHOLDS.MEDIUM_MAX) return 'MEDIUM';
  if (clamped <= RISK_LEVEL_THRESHOLDS.HIGH_MAX) return 'HIGH';
  return 'CRITICAL';
}

export function computeReleaseDecision(
  score: number,
  signals: ComputedSignal[],
): ReleaseSafetyDecision {
  const clamped = Math.max(RISK_SCORE_BOUNDARIES.MIN, Math.min(RISK_SCORE_BOUNDARIES.MAX, Math.round(score)));

  // Blocking signal or critical score overrides everything
  const hasBlockingSignal = signals.some((s) => s.blocking);
  if (hasBlockingSignal || clamped >= DECISION_THRESHOLDS.BLOCKED_MIN_SCORE) {
    return 'BLOCKED';
  }

  // Mandatory review signal or review score threshold
  const hasReviewSignal = signals.some((s) => s.requiresReview);
  if (hasReviewSignal || clamped > DECISION_THRESHOLDS.PASS_MAX_SCORE) {
    return 'REVIEW_REQUIRED';
  }

  return 'PASS';
}

const SEVERITY_RANK: Record<ReleaseSafetySignalSeverity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export function sortSignalsDeterministically(signals: ComputedSignal[]): ComputedSignal[] {
  return [...signals].sort((a, b) => {
    // 1. Blocking first
    if (a.blocking !== b.blocking) {
      return a.blocking ? -1 : 1;
    }
    // 2. Severity descending
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;

    // 3. ScoreDelta descending
    if (b.scoreDelta !== a.scoreDelta) {
      return b.scoreDelta - a.scoreDelta;
    }

    // 4. Rule ID ascending
    return a.ruleId.localeCompare(b.ruleId);
  });
}
