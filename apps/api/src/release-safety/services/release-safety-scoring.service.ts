import { Injectable, Logger } from '@nestjs/common';
import {
  ReleaseRiskLevel,
  ReleaseSafetyDecision,
} from '@impactra/shared';
import {
  ComputedSignal,
  RISK_SCORE_BOUNDARIES,
  RELEASE_SAFETY_POLICY_VERSION,
  computeRiskLevel,
  computeReleaseDecision,
} from '../policy/release-safety-policy';

export interface ScoringResult {
  score: number;
  rawScore: number;
  riskLevel: ReleaseRiskLevel;
  decision: ReleaseSafetyDecision;
  totalSignals: number;
  blockingSignalsCount: number;
  reviewSignalsCount: number;
  summary: string;
  explanation: Record<string, unknown>;
}

@Injectable()
export class ReleaseSafetyScoringService {
  private readonly logger = new Logger(ReleaseSafetyScoringService.name);

  /**
   * Deterministically calculates release risk score, risk level, decision, and explanation.
   */
  calculateScore(signals: ComputedSignal[]): ScoringResult {
    const rawScore = signals.reduce((sum, s) => sum + s.scoreDelta, 0);
    const score = Math.max(
      RISK_SCORE_BOUNDARIES.MIN,
      Math.min(RISK_SCORE_BOUNDARIES.MAX, Math.round(rawScore)),
    );

    const riskLevel = computeRiskLevel(score);
    const decision = computeReleaseDecision(score, signals);

    const blockingSignalsCount = signals.filter((s) => s.blocking).length;
    const reviewSignalsCount = signals.filter((s) => s.requiresReview).length;

    let decisionReason: string;
    if (decision === 'BLOCKED') {
      if (blockingSignalsCount > 0) {
        decisionReason = `Release BLOCKED due to ${blockingSignalsCount} critical blocking rule signal(s).`;
      } else {
        decisionReason = `Release BLOCKED: risk score (${score}) meets or exceeds critical threshold (>= 75).`;
      }
    } else if (decision === 'REVIEW_REQUIRED') {
      if (reviewSignalsCount > 0) {
        decisionReason = `Review REQUIRED due to ${reviewSignalsCount} review-mandating rule signal(s).`;
      } else {
        decisionReason = `Review REQUIRED: risk score (${score}) exceeds low-risk threshold (> 39).`;
      }
    } else {
      decisionReason = `Release PASSED: risk score (${score}) is within safe boundary and no blocking signals were found.`;
    }

    const categoryBreakdown: Record<string, number> = {
      CHANGE_SIZE: 0,
      BLAST_RADIUS: 0,
      DEPENDENCY: 0,
      ARCHITECTURE: 0,
      ANALYSIS_QUALITY: 0,
    };

    for (const signal of signals) {
      if (categoryBreakdown[signal.category] !== undefined) {
        categoryBreakdown[signal.category]++;
      }
    }

    const summary = `${decision}: Risk Score ${score}/100 (${riskLevel}) with ${signals.length} signal(s) evaluated. ${decisionReason}`;

    const explanation: Record<string, unknown> = {
      policyVersion: RELEASE_SAFETY_POLICY_VERSION,
      score,
      rawScore,
      riskLevel,
      decision,
      decisionReason,
      totalSignals: signals.length,
      blockingSignalsCount,
      reviewSignalsCount,
      categoryBreakdown,
      signalsEvaluated: signals.map((s) => ({
        ruleId: s.ruleId,
        category: s.category,
        severity: s.severity,
        scoreDelta: s.scoreDelta,
        blocking: s.blocking,
        requiresReview: s.requiresReview,
        title: s.title,
      })),
    };

    return {
      score,
      rawScore,
      riskLevel,
      decision,
      totalSignals: signals.length,
      blockingSignalsCount,
      reviewSignalsCount,
      summary,
      explanation,
    };
  }
}
