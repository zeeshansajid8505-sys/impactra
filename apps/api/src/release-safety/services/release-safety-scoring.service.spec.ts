import { ReleaseSafetyScoringService } from './release-safety-scoring.service';
import { ComputedSignal, RELEASE_SAFETY_POLICY_VERSION } from '../policy/release-safety-policy';

describe('ReleaseSafetyScoringService', () => {
  let scoringService: ReleaseSafetyScoringService;

  beforeEach(() => {
    scoringService = new ReleaseSafetyScoringService();
  });

  const createSignal = (overrides: Partial<ComputedSignal> = {}): ComputedSignal => ({
    ruleId: 'RS-TEST-001',
    ruleVersion: RELEASE_SAFETY_POLICY_VERSION,
    category: 'BLAST_RADIUS',
    severity: 'MEDIUM',
    scoreDelta: 10,
    blocking: false,
    requiresReview: false,
    title: 'Test Signal',
    description: 'Test description',
    evidenceType: 'TEST',
    evidenceReferenceId: 'ref-1',
    evidenceStableKey: null,
    evidenceJson: {},
    ...overrides,
  });

  it('should return 0 score and PASS when signals array is empty', () => {
    const result = scoringService.calculateScore([]);
    expect(result.score).toBe(0);
    expect(result.rawScore).toBe(0);
    expect(result.riskLevel).toBe('LOW');
    expect(result.decision).toBe('PASS');
    expect(result.totalSignals).toBe(0);
    expect(result.blockingSignalsCount).toBe(0);
    expect(result.reviewSignalsCount).toBe(0);
  });

  it('should correctly sum score deltas and classify LOW risk', () => {
    const signals = [
      createSignal({ scoreDelta: 5 }),
      createSignal({ scoreDelta: 10 }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(15);
    expect(result.rawScore).toBe(15);
    expect(result.riskLevel).toBe('LOW');
    expect(result.decision).toBe('PASS');
  });

  it('should classify MEDIUM risk and REVIEW_REQUIRED for score >= 40', () => {
    const signals = [
      createSignal({ scoreDelta: 20 }),
      createSignal({ scoreDelta: 25 }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(45);
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.decision).toBe('REVIEW_REQUIRED');
  });

  it('should classify HIGH risk for score between 50 and 74', () => {
    const signals = [
      createSignal({ scoreDelta: 30 }),
      createSignal({ scoreDelta: 30 }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(60);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.decision).toBe('REVIEW_REQUIRED');
  });

  it('should classify CRITICAL risk and BLOCKED for score >= 75', () => {
    const signals = [
      createSignal({ scoreDelta: 40 }),
      createSignal({ scoreDelta: 40 }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(80);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.decision).toBe('BLOCKED');
  });

  it('should clamp scores over 100 to 100', () => {
    const signals = [
      createSignal({ scoreDelta: 70 }),
      createSignal({ scoreDelta: 80 }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(100);
    expect(result.rawScore).toBe(150);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.decision).toBe('BLOCKED');
  });

  it('should immediately produce BLOCKED decision if any signal is blocking', () => {
    const signals = [
      createSignal({ scoreDelta: 5, blocking: true, severity: 'CRITICAL' }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(5);
    expect(result.riskLevel).toBe('LOW');
    expect(result.decision).toBe('BLOCKED');
    expect(result.blockingSignalsCount).toBe(1);
    expect(result.summary).toContain('BLOCKED');
  });

  it('should produce REVIEW_REQUIRED decision if any signal requires review', () => {
    const signals = [
      createSignal({ scoreDelta: 10, requiresReview: true, severity: 'HIGH' }),
    ];
    const result = scoringService.calculateScore(signals);
    expect(result.score).toBe(10);
    expect(result.riskLevel).toBe('LOW');
    expect(result.decision).toBe('REVIEW_REQUIRED');
    expect(result.reviewSignalsCount).toBe(1);
  });

  it('is completely deterministic across repeated evaluations', () => {
    const signals = [
      createSignal({ ruleId: 'RS-BLAST-001', scoreDelta: 12 }),
      createSignal({ ruleId: 'RS-ARCH-001', scoreDelta: 15, requiresReview: true }),
    ];

    const run1 = scoringService.calculateScore(signals);
    const run2 = scoringService.calculateScore(signals);

    expect(run1).toEqual(run2);
  });
});
