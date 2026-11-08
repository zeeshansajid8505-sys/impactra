import { Injectable, Logger } from '@nestjs/common';
import {
  ReleasePolicyAction,
  ReleasePolicyRuleType,
  ReleasePolicyScope,
  ReleaseRiskLevel,
  ReleaseSafetyDecision,
  ReleaseSafetySignalSeverity,
} from '@impactra/database';
import {
  ReleasePolicyRuleDto,
  ReleasePolicyRuleEvaluationDto,
  ReleasePolicySnapshotDto,
} from '@impactra/shared';
import {
  POLICY_ENGINE_VERSION,
  BUILT_IN_THRESHOLDS,
  BUILT_IN_POLICY_RULES,
} from '../policy/built-in-release-policy';

export interface EvaluatorSignalInput {
  ruleId: string;
  category: string;
  severity: ReleaseSafetySignalSeverity;
  scoreDelta: number;
  blocking: boolean;
  requiresReview: boolean;
  title: string;
}

export interface EvaluatorBlastRadiusInput {
  affectedNodeCount: number;
  maxDepth: number;
  rootCount?: number;
}

export interface EvaluatorContextInput {
  riskScore: number;
  riskLevel: ReleaseRiskLevel;
  signals: EvaluatorSignalInput[];
  blastRadius: EvaluatorBlastRadiusInput;
  changedPaths: string[];
}

export interface PolicyMetadataInput {
  policyId?: string | null;
  policyName: string;
  policyVersion: number;
  scope: ReleasePolicyScope;
  targetBranchPattern?: string | null;
}

export interface RuleEvaluationInput {
  id?: string;
  ruleKey: string;
  ruleType: ReleasePolicyRuleType;
  enabled: boolean;
  severity?: ReleaseSafetySignalSeverity | null;
  action: ReleasePolicyAction;
  thresholdNumeric?: number | null;
  thresholdText?: string | null;
  configuration?: Record<string, unknown> | null;
  order: number;
}

const RISK_LEVEL_RANK: Record<ReleaseRiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

@Injectable()
export class ReleasePolicyEvaluatorService {
  private readonly logger = new Logger(ReleasePolicyEvaluatorService.name);

  /**
   * Deterministically evaluates policy rules against release safety evidence.
   * Produces an explainable, immutable snapshot with zero database side effects.
   */
  evaluatePolicy(
    context: EvaluatorContextInput,
    rules: RuleEvaluationInput[],
    policyInfo: PolicyMetadataInput,
  ): {
    snapshot: ReleasePolicySnapshotDto;
    finalAction: ReleasePolicyAction;
    finalDecision: ReleaseSafetyDecision;
    evaluations: ReleasePolicyRuleEvaluationDto[];
    matchedRules: ReleasePolicyRuleEvaluationDto[];
    unmatchedRules: ReleasePolicyRuleEvaluationDto[];
  } {
    // 1. Sort enabled rules by order ascending, then ruleKey ascending
    const sortedRules = [...rules]
      .filter((r) => r.enabled !== false)
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.ruleKey.localeCompare(b.ruleKey);
      });

    // 2. Evaluate each rule deterministically
    const evaluations: ReleasePolicyRuleEvaluationDto[] = [];

    for (const rule of sortedRules) {
      const result = this.evaluateSingleRule(rule, context);
      evaluations.push(result);
    }

    const matchedRules = evaluations.filter((e) => e.matched);
    const unmatchedRules = evaluations.filter((e) => !e.matched);

    // 3. Aggregate final action using strict precedence: BLOCK > REQUIRE_REVIEW > ALLOW
    let finalAction: ReleasePolicyAction;
    let finalDecision: ReleaseSafetyDecision;

    if (matchedRules.some((r) => r.action === ReleasePolicyAction.BLOCK)) {
      finalAction = ReleasePolicyAction.BLOCK;
      finalDecision = 'BLOCKED';
    } else if (
      matchedRules.some((r) => r.action === ReleasePolicyAction.REQUIRE_REVIEW)
    ) {
      finalAction = ReleasePolicyAction.REQUIRE_REVIEW;
      finalDecision = 'REVIEW_REQUIRED';
    } else if (
      matchedRules.some((r) => r.action === ReleasePolicyAction.ALLOW)
    ) {
      finalAction = ReleasePolicyAction.ALLOW;
      finalDecision = 'PASS';
    } else {
      // Fallback: If no custom rules matched, apply canonical built-in fallback logic
      const fallback = this.evaluateBuiltInFallback(context);
      finalAction = fallback.action;
      finalDecision = fallback.decision;
    }

    const snapshot: ReleasePolicySnapshotDto = {
      policyId: policyInfo.policyId ?? null,
      policyName: policyInfo.policyName,
      policyVersion: policyInfo.policyVersion,
      policyScope: policyInfo.scope,
      targetBranchPattern: policyInfo.targetBranchPattern ?? null,
      policyEngineVersion: POLICY_ENGINE_VERSION,
      rules: sortedRules.map((r) => ({
        ruleKey: r.ruleKey,
        ruleType: r.ruleType,
        action: r.action,
        enabled: r.enabled,
        thresholdNumeric: r.thresholdNumeric ?? null,
        thresholdText: r.thresholdText ?? null,
        configuration: r.configuration ?? {},
        order: r.order,
      })),
      evaluationResults: evaluations,
      finalAction,
      finalDecision,
      resolvedAt: new Date().toISOString(),
    };

    return {
      snapshot,
      finalAction,
      finalDecision,
      evaluations,
      matchedRules,
      unmatchedRules,
    };
  }

  /**
   * Evaluates a single rule deterministically against the context.
   */
  evaluateSingleRule(
    rule: RuleEvaluationInput,
    context: EvaluatorContextInput,
  ): ReleasePolicyRuleEvaluationDto {
    switch (rule.ruleType) {
      case ReleasePolicyRuleType.MAX_RISK_SCORE: {
        const threshold = rule.thresholdNumeric ?? 100;
        const matched = context.riskScore >= threshold;
        const reason = matched
          ? `Risk score ${context.riskScore} meets or exceeds configured threshold ${threshold}.`
          : `Risk score ${context.riskScore} is below configured threshold ${threshold}.`;
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: context.riskScore,
          configuredValue: threshold,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.MINIMUM_RISK_LEVEL: {
        const rawConfig =
          rule.thresholdText?.toUpperCase() ||
          (rule.configuration?.level as string)?.toUpperCase() ||
          'HIGH';
        const configuredLevel = (
          ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(rawConfig)
            ? rawConfig
            : 'HIGH'
        ) as ReleaseRiskLevel;

        const currentRank = RISK_LEVEL_RANK[context.riskLevel] || 1;
        const targetRank = RISK_LEVEL_RANK[configuredLevel] || 3;
        const matched = currentRank >= targetRank;
        const reason = matched
          ? `Risk level ${context.riskLevel} meets or exceeds configured level ${configuredLevel}.`
          : `Risk level ${context.riskLevel} is below configured level ${configuredLevel}.`;
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: context.riskLevel,
          configuredValue: configuredLevel,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD: {
        const threshold = rule.thresholdNumeric ?? 0;
        const actualCount = context.blastRadius.affectedNodeCount;
        const matched = actualCount >= threshold;
        const reason = matched
          ? `Blast radius affected nodes (${actualCount}) meets or exceeds configured threshold ${threshold}.`
          : `Blast radius affected nodes (${actualCount}) is below configured threshold ${threshold}.`;
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: actualCount,
          configuredValue: threshold,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT: {
        const criticalSignals = context.signals.filter(
          (s) => s.severity === 'CRITICAL' || s.blocking,
        );
        const matched = criticalSignals.length > 0;
        const reason = matched
          ? `Detected ${criticalSignals.length} CRITICAL or blocking signal(s) in change assessment.`
          : 'No CRITICAL or blocking signals detected.';
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: criticalSignals.length,
          configuredValue: 1,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.HIGH_SIGNAL_COUNT: {
        const threshold = rule.thresholdNumeric ?? 1;
        const highSignals = context.signals.filter((s) => s.severity === 'HIGH');
        const matched = highSignals.length >= threshold;
        const reason = matched
          ? `Detected ${highSignals.length} HIGH severity signal(s), meeting or exceeding configured threshold ${threshold}.`
          : `Detected ${highSignals.length} HIGH severity signal(s), which is below configured threshold ${threshold}.`;
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: highSignals.length,
          configuredValue: threshold,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.PROTECTED_PATH_CHANGED: {
        const patterns: string[] = [];
        if (rule.configuration && Array.isArray(rule.configuration.paths)) {
          patterns.push(
            ...(rule.configuration.paths as string[]).map((p) => String(p).trim()),
          );
        } else if (
          rule.configuration &&
          Array.isArray(rule.configuration.protectedPaths)
        ) {
          patterns.push(
            ...(rule.configuration.protectedPaths as string[]).map((p) =>
              String(p).trim(),
            ),
          );
        } else if (rule.thresholdText) {
          patterns.push(
            ...rule.thresholdText
              .split(/[\n,;]/)
              .map((p) => p.trim())
              .filter(Boolean),
          );
        }

        const matchedPaths: string[] = [];
        let matchedPattern = '';

        for (const pattern of patterns) {
          if (!pattern) continue;
          for (const path of context.changedPaths) {
            if (this.matchGlobPattern(pattern, path)) {
              matchedPaths.push(path);
              if (!matchedPattern) matchedPattern = pattern;
            }
          }
        }

        const matched = matchedPaths.length > 0;
        const sampleFile = matchedPaths.length > 0 ? matchedPaths[0] : '';
        const reason = matched
          ? `Protected path change detected: ${matchedPaths.length} file(s) matched pattern '${matchedPattern}' (e.g. '${sampleFile}').`
          : 'No changed files matched configured protected path patterns.';

        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: rule.action,
          observedValue: matchedPaths,
          configuredValue: patterns,
          reason,
          order: rule.order,
        };
      }

      case ReleasePolicyRuleType.REQUIRE_APPROVAL: {
        const matched = true;
        const reason =
          'Policy rule explicitly mandates human review for release authorization.';
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched,
          action: ReleasePolicyAction.REQUIRE_REVIEW,
          observedValue: true,
          configuredValue: true,
          reason,
          order: rule.order,
        };
      }

      default: {
        return {
          ruleId: rule.id,
          ruleKey: rule.ruleKey,
          ruleType: rule.ruleType,
          matched: false,
          action: rule.action,
          observedValue: null,
          configuredValue: null,
          reason: `Unknown or unhandled rule type: ${rule.ruleType}`,
          order: rule.order,
        };
      }
    }
  }

  /**
   * Safe, bounded glob pattern matcher for protected paths and branch targeting.
   * Supports `**` (recursive directory wildcard) and `*` (single segment wildcard).
   */
  matchGlobPattern(pattern: string, target: string): boolean {
    if (!pattern || !target) return false;
    const cleanPattern = pattern.trim().replace(/\\/g, '/');
    const cleanTarget = target.trim().replace(/\\/g, '/');

    if (cleanPattern === cleanTarget || cleanPattern === '*') return true;

    // Convert glob pattern to safe bounded regular expression
    const regexPattern = cleanPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars except * and ?
      .replace(/\*\*/g, '§§REC§§')          // placeholder for recursive match
      .replace(/\*/g, '[^/]*')              // single segment wildcard
      .replace(/§§REC§§/g, '.*')             // recursive wildcard
      .replace(/\?/g, '.');

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(cleanTarget);
    } catch {
      return cleanTarget.startsWith(cleanPattern.replace(/\*.*$/, ''));
    }
  }

  /**
   * Evaluates canonical built-in Impactra fallback decision (Phase 08 compatibility).
   */
  private evaluateBuiltInFallback(context: EvaluatorContextInput): {
    action: ReleasePolicyAction;
    decision: ReleaseSafetyDecision;
  } {
    const hasBlocking = context.signals.some((s) => s.blocking || s.severity === 'CRITICAL');
    if (hasBlocking || context.riskScore >= BUILT_IN_THRESHOLDS.BLOCKED_MIN_SCORE) {
      return { action: ReleasePolicyAction.BLOCK, decision: 'BLOCKED' };
    }

    const hasReview = context.signals.some((s) => s.requiresReview);
    if (hasReview || context.riskScore > BUILT_IN_THRESHOLDS.PASS_MAX_SCORE) {
      return { action: ReleasePolicyAction.REQUIRE_REVIEW, decision: 'REVIEW_REQUIRED' };
    }

    return { action: ReleasePolicyAction.ALLOW, decision: 'PASS' };
  }
}
