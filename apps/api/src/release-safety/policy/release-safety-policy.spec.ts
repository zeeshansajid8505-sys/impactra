import {
  computeRiskLevel,
  computeReleaseDecision,
  sortSignalsDeterministically,
  ComputedSignal,
  RISK_SCORE_BOUNDARIES,
  RISK_LEVEL_THRESHOLDS,
  DECISION_THRESHOLDS,
  RELEASE_SAFETY_POLICY_VERSION,
} from './release-safety-policy';

describe('ReleaseSafetyPolicy', () => {
  describe('computeRiskLevel', () => {
    it('should clamp scores to [0, 100]', () => {
      expect(computeRiskLevel(-50)).toBe('LOW');
      expect(computeRiskLevel(0)).toBe('LOW');
      expect(computeRiskLevel(150)).toBe('CRITICAL');
      expect(computeRiskLevel(100)).toBe('CRITICAL');
    });

    it('should correctly map boundary values according to thresholds', () => {
      expect(computeRiskLevel(0)).toBe('LOW');
      expect(computeRiskLevel(24)).toBe('LOW');
      expect(computeRiskLevel(25)).toBe('MEDIUM');
      expect(computeRiskLevel(49)).toBe('MEDIUM');
      expect(computeRiskLevel(50)).toBe('HIGH');
      expect(computeRiskLevel(74)).toBe('HIGH');
      expect(computeRiskLevel(75)).toBe('CRITICAL');
      expect(computeRiskLevel(100)).toBe('CRITICAL');
    });
  });

  describe('computeReleaseDecision', () => {
    const baseSignal = (overrides: Partial<ComputedSignal> = {}): ComputedSignal => ({
      ruleId: 'RS-TEST-001',
      ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
      category: 'BLAST_RADIUS',
      severity: 'LOW',
      scoreDelta: 5,
      blocking: false,
      requiresReview: false,
      title: 'Test Signal',
      description: 'Test description',
      evidenceType: 'TEST',
      evidenceReferenceId: null,
      evidenceStableKey: null,
      evidenceJson: {},
      ...overrides,
    });

    it('should return PASS when score <= 39 and no blocking or review signals', () => {
      expect(computeReleaseDecision(0, [])).toBe('PASS');
      expect(computeReleaseDecision(20, [baseSignal()])).toBe('PASS');
      expect(computeReleaseDecision(39, [baseSignal()])).toBe('PASS');
    });

    it('should return REVIEW_REQUIRED when score is between 40 and 74 without blocking signals', () => {
      expect(computeReleaseDecision(40, [baseSignal()])).toBe('REVIEW_REQUIRED');
      expect(computeReleaseDecision(60, [baseSignal()])).toBe('REVIEW_REQUIRED');
      expect(computeReleaseDecision(74, [baseSignal()])).toBe('REVIEW_REQUIRED');
    });

    it('should return REVIEW_REQUIRED if any signal has requiresReview=true even if score is low', () => {
      const reviewSignal = baseSignal({ requiresReview: true });
      expect(computeReleaseDecision(10, [reviewSignal])).toBe('REVIEW_REQUIRED');
    });

    it('should return BLOCKED when score >= 75', () => {
      expect(computeReleaseDecision(75, [baseSignal()])).toBe('BLOCKED');
      expect(computeReleaseDecision(95, [baseSignal()])).toBe('BLOCKED');
    });

    it('should return BLOCKED if any signal has blocking=true even if score is low', () => {
      const blockingSignal = baseSignal({ blocking: true, scoreDelta: 10 });
      expect(computeReleaseDecision(10, [blockingSignal])).toBe('BLOCKED');
    });

    it('should prioritize blocking=true over requiresReview=true', () => {
      const signals = [
        baseSignal({ requiresReview: true }),
        baseSignal({ blocking: true }),
      ];
      expect(computeReleaseDecision(20, signals)).toBe('BLOCKED');
    });
  });

  describe('sortSignalsDeterministically', () => {
    const makeSig = (
      ruleId: string,
      severity: ComputedSignal['severity'],
      scoreDelta: number,
      blocking: boolean,
    ): ComputedSignal => ({
      ruleId,
      ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
      category: 'BLAST_RADIUS',
      severity,
      scoreDelta,
      blocking,
      requiresReview: false,
      title: ruleId,
      description: ruleId,
      evidenceType: 'TEST',
      evidenceReferenceId: null,
      evidenceStableKey: null,
      evidenceJson: {},
    });

    it('should place blocking signals first', () => {
      const s1 = makeSig('RS-01', 'CRITICAL', 25, false);
      const s2 = makeSig('RS-02', 'LOW', 5, true);
      const sorted = sortSignalsDeterministically([s1, s2]);
      expect(sorted[0].ruleId).toBe('RS-02');
      expect(sorted[1].ruleId).toBe('RS-01');
    });

    it('should sort by severity descending when blocking status is identical', () => {
      const sLow = makeSig('RS-LOW', 'LOW', 10, false);
      const sHigh = makeSig('RS-HIGH', 'HIGH', 10, false);
      const sMed = makeSig('RS-MED', 'MEDIUM', 10, false);
      const sorted = sortSignalsDeterministically([sLow, sHigh, sMed]);
      expect(sorted.map((s) => s.ruleId)).toEqual(['RS-HIGH', 'RS-MED', 'RS-LOW']);
    });

    it('should sort by scoreDelta descending when severity is identical', () => {
      const s5 = makeSig('RS-5', 'HIGH', 5, false);
      const s20 = makeSig('RS-20', 'HIGH', 20, false);
      const s15 = makeSig('RS-15', 'HIGH', 15, false);
      const sorted = sortSignalsDeterministically([s5, s20, s15]);
      expect(sorted.map((s) => s.ruleId)).toEqual(['RS-20', 'RS-15', 'RS-5']);
    });

    it('should sort by ruleId ascending when all other criteria match', () => {
      const sB = makeSig('RS-B', 'MEDIUM', 10, false);
      const sA = makeSig('RS-A', 'MEDIUM', 10, false);
      const sorted = sortSignalsDeterministically([sB, sA]);
      expect(sorted.map((s) => s.ruleId)).toEqual(['RS-A', 'RS-B']);
    });
  });
});
