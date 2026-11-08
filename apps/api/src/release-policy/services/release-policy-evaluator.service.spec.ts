import { ReleasePolicyEvaluatorService, EvaluatorContextInput, RuleEvaluationInput } from './release-policy-evaluator.service';
import {
  ReleasePolicyAction,
  ReleasePolicyRuleType,
  ReleasePolicyScope,
} from '@impactra/database';

describe('ReleasePolicyEvaluatorService', () => {
  let evaluator: ReleasePolicyEvaluatorService;

  beforeEach(() => {
    evaluator = new ReleasePolicyEvaluatorService();
  });

  const baseContext: EvaluatorContextInput = {
    riskScore: 50,
    riskLevel: 'MEDIUM',
    signals: [
      {
        ruleId: 'SIG_1',
        category: 'DEPENDENCY',
        severity: 'MEDIUM',
        scoreDelta: 10,
        blocking: false,
        requiresReview: false,
        title: 'Medium risk delta',
      },
    ],
    blastRadius: {
      affectedNodeCount: 5,
      maxDepth: 2,
      rootCount: 1,
    },
    changedPaths: ['apps/api/src/auth.ts', 'packages/shared/src/api.ts'],
  };

  const policyInfo = {
    policyId: 'pol-1',
    policyName: 'Test Policy',
    policyVersion: 1,
    scope: ReleasePolicyScope.ORGANIZATION_DEFAULT,
  };

  describe('Rule Types', () => {
    it('evaluates MAX_RISK_SCORE rule', () => {
      const rule: RuleEvaluationInput = {
        ruleKey: 'max_risk',
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        enabled: true,
        action: ReleasePolicyAction.BLOCK,
        thresholdNumeric: 40,
        order: 0,
      };

      const res = evaluator.evaluatePolicy(baseContext, [rule], policyInfo);
      expect(res.finalDecision).toBe('BLOCKED');
      expect(res.matchedRules.length).toBe(1);
      expect(res.matchedRules[0].matched).toBe(true);
    });

    it('evaluates MINIMUM_RISK_LEVEL rule', () => {
      const rule: RuleEvaluationInput = {
        ruleKey: 'min_level',
        ruleType: ReleasePolicyRuleType.MINIMUM_RISK_LEVEL,
        enabled: true,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        thresholdText: 'MEDIUM',
        order: 0,
      };

      const res = evaluator.evaluatePolicy(baseContext, [rule], policyInfo);
      expect(res.finalDecision).toBe('REVIEW_REQUIRED');
      expect(res.matchedRules.length).toBe(1);
    });

    it('evaluates BLAST_RADIUS_THRESHOLD rule', () => {
      const rule: RuleEvaluationInput = {
        ruleKey: 'blast_threshold',
        ruleType: ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD,
        enabled: true,
        action: ReleasePolicyAction.BLOCK,
        thresholdNumeric: 10, // actual is 5 -> should not match
        order: 0,
      };

      const res = evaluator.evaluatePolicy(baseContext, [rule], policyInfo);
      expect(res.matchedRules.length).toBe(0);
      expect(res.unmatchedRules.length).toBe(1);
    });

    it('evaluates CRITICAL_SIGNAL_PRESENT rule', () => {
      const contextWithCritical: EvaluatorContextInput = {
        ...baseContext,
        signals: [
          {
            ruleId: 'SIG_CRIT',
            category: 'SECURITY',
            severity: 'CRITICAL',
            scoreDelta: 50,
            blocking: true,
            requiresReview: true,
            title: 'Critical credential exposure',
          },
        ],
      };

      const rule: RuleEvaluationInput = {
        ruleKey: 'crit_signal',
        ruleType: ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT,
        enabled: true,
        action: ReleasePolicyAction.BLOCK,
        order: 0,
      };

      const res = evaluator.evaluatePolicy(contextWithCritical, [rule], policyInfo);
      expect(res.finalDecision).toBe('BLOCKED');
      expect(res.matchedRules.length).toBe(1);
    });

    it('evaluates HIGH_SIGNAL_COUNT rule', () => {
      const contextWithHigh: EvaluatorContextInput = {
        ...baseContext,
        signals: [
          {
            ruleId: 'H1',
            category: 'SECURITY',
            severity: 'HIGH',
            scoreDelta: 20,
            blocking: false,
            requiresReview: true,
            title: 'High 1',
          },
          {
            ruleId: 'H2',
            category: 'SCHEMA',
            severity: 'HIGH',
            scoreDelta: 20,
            blocking: false,
            requiresReview: true,
            title: 'High 2',
          },
        ],
      };

      const rule: RuleEvaluationInput = {
        ruleKey: 'high_count',
        ruleType: ReleasePolicyRuleType.HIGH_SIGNAL_COUNT,
        enabled: true,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        thresholdNumeric: 2,
        order: 0,
      };

      const res = evaluator.evaluatePolicy(contextWithHigh, [rule], policyInfo);
      expect(res.finalDecision).toBe('REVIEW_REQUIRED');
      expect(res.matchedRules.length).toBe(1);
    });

    it('evaluates PROTECTED_PATH_CHANGED rule with recursive glob', () => {
      const rule: RuleEvaluationInput = {
        ruleKey: 'protected_paths',
        ruleType: ReleasePolicyRuleType.PROTECTED_PATH_CHANGED,
        enabled: true,
        action: ReleasePolicyAction.BLOCK,
        configuration: {
          paths: ['packages/shared/**', 'infra/**'],
        },
        order: 0,
      };

      const res = evaluator.evaluatePolicy(baseContext, [rule], policyInfo);
      expect(res.finalDecision).toBe('BLOCKED');
      expect(res.matchedRules.length).toBe(1);
      expect(res.matchedRules[0].reason).toContain('packages/shared/src/api.ts');
    });

    it('evaluates REQUIRE_APPROVAL rule', () => {
      const rule: RuleEvaluationInput = {
        ruleKey: 'always_review',
        ruleType: ReleasePolicyRuleType.REQUIRE_APPROVAL,
        enabled: true,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        order: 0,
      };

      const res = evaluator.evaluatePolicy(baseContext, [rule], policyInfo);
      expect(res.finalDecision).toBe('REVIEW_REQUIRED');
      expect(res.matchedRules.length).toBe(1);
    });
  });

  describe('Precedence & Ordering', () => {
    it('BLOCK overrides REQUIRE_REVIEW and ALLOW', () => {
      const rules: RuleEvaluationInput[] = [
        {
          ruleKey: 'allow_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.ALLOW,
          thresholdNumeric: 10,
          order: 0,
        },
        {
          ruleKey: 'review_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.REQUIRE_REVIEW,
          thresholdNumeric: 20,
          order: 1,
        },
        {
          ruleKey: 'block_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.BLOCK,
          thresholdNumeric: 30,
          order: 2,
        },
      ];

      const res = evaluator.evaluatePolicy(baseContext, rules, policyInfo);
      expect(res.finalAction).toBe(ReleasePolicyAction.BLOCK);
      expect(res.finalDecision).toBe('BLOCKED');
    });

    it('REQUIRE_REVIEW overrides ALLOW', () => {
      const rules: RuleEvaluationInput[] = [
        {
          ruleKey: 'allow_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.ALLOW,
          thresholdNumeric: 10,
          order: 0,
        },
        {
          ruleKey: 'review_rule',
          ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
          enabled: true,
          action: ReleasePolicyAction.REQUIRE_REVIEW,
          thresholdNumeric: 20,
          order: 1,
        },
      ];

      const res = evaluator.evaluatePolicy(baseContext, rules, policyInfo);
      expect(res.finalAction).toBe(ReleasePolicyAction.REQUIRE_REVIEW);
      expect(res.finalDecision).toBe('REVIEW_REQUIRED');
    });
  });
});
