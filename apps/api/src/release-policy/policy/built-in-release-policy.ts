import {
  ReleasePolicyAction,
  ReleasePolicyRuleType,
  ReleasePolicyScope,
  ReleaseSafetyDecision,
  ReleaseSafetySignalSeverity,
} from '@impactra/database';
import {
  ReleasePolicyRuleDto,
  ReleasePolicyRuleEvaluationDto,
  ReleasePolicySnapshotDto,
} from '@impactra/shared';

export const POLICY_ENGINE_VERSION = 'impactra-release-policy-engine-v1';
export const BUILT_IN_POLICY_NAME = 'Impactra Default Release Safety Policy';
export const BUILT_IN_POLICY_VERSION = 1;
export const BUILT_IN_POLICY_VERSION_KEY = 'impactra-release-safety-v1';

export const BUILT_IN_THRESHOLDS = {
  PASS_MAX_SCORE: 39,
  REVIEW_REQUIRED_MAX_SCORE: 74,
  BLOCKED_MIN_SCORE: 75,
} as const;

export interface BuiltInRuleDefinition {
  ruleKey: string;
  ruleType: ReleasePolicyRuleType;
  action: ReleasePolicyAction;
  enabled: boolean;
  thresholdNumeric?: number | null;
  thresholdText?: string | null;
  severity?: ReleaseSafetySignalSeverity | null;
  configuration?: Record<string, unknown>;
  order: number;
}

export const BUILT_IN_POLICY_RULES: BuiltInRuleDefinition[] = [
  {
    ruleKey: 'builtin_critical_signal_block',
    ruleType: 'CRITICAL_SIGNAL_PRESENT',
    action: 'BLOCK',
    enabled: true,
    order: 0,
  },
  {
    ruleKey: 'builtin_max_risk_score_block',
    ruleType: 'MAX_RISK_SCORE',
    action: 'BLOCK',
    thresholdNumeric: BUILT_IN_THRESHOLDS.BLOCKED_MIN_SCORE,
    enabled: true,
    order: 1,
  },
  {
    ruleKey: 'builtin_max_risk_score_review',
    ruleType: 'MAX_RISK_SCORE',
    action: 'REQUIRE_REVIEW',
    thresholdNumeric: BUILT_IN_THRESHOLDS.PASS_MAX_SCORE + 1,
    enabled: true,
    order: 2,
  },
];
