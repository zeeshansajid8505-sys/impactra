import { ReleaseSafetyRuleEngineService } from './release-safety-rule-engine.service';
import { EvaluationEvidenceInput } from '../policy/release-safety-policy';

describe('ReleaseSafetyRuleEngineService', () => {
  let ruleEngine: ReleaseSafetyRuleEngineService;

  beforeEach(() => {
    ruleEngine = new ReleaseSafetyRuleEngineService();
  });

  const createMinimalEvidence = (
    overrides: Partial<EvaluationEvidenceInput> = {},
  ): EvaluationEvidenceInput => ({
    changeRevision: {
      id: 'rev-1',
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      filesRenamed: 0,
    },
    changedFiles: [],
    dependencyDeltas: [],
    blastRadiusAnalysis: {
      id: 'bra-1',
      maxDepth: 0,
      rootCount: 0,
      affectedNodeCount: 0,
      firstOrderCount: 0,
      transitiveCount: 0,
      truncated: false,
    },
    blastRadiusFindings: [],
    ...overrides,
  });

  it('should return empty signals list for clean empty evidence', () => {
    const evidence = createMinimalEvidence();
    const signals = ruleEngine.evaluateRules(evidence);
    expect(signals).toEqual([]);
  });

  it('should fire RS-BLAST-001 for first-order impact', () => {
    const evidence = createMinimalEvidence({
      blastRadiusAnalysis: {
        id: 'bra-1',
        maxDepth: 1,
        rootCount: 1,
        affectedNodeCount: 6,
        firstOrderCount: 6,
        transitiveCount: 0,
        truncated: false,
      },
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-BLAST-001');
    expect(signal).toBeDefined();
    expect(signal?.severity).toBe('MEDIUM');
    expect(signal?.scoreDelta).toBe(12);
  });

  it('should fire RS-BLAST-003 critical blocking signal when affectedNodeCount >= 30', () => {
    const evidence = createMinimalEvidence({
      blastRadiusAnalysis: {
        id: 'bra-1',
        maxDepth: 4,
        rootCount: 2,
        affectedNodeCount: 35,
        firstOrderCount: 15,
        transitiveCount: 20,
        truncated: false,
      },
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-BLAST-003');
    expect(signal).toBeDefined();
    expect(signal?.severity).toBe('CRITICAL');
    expect(signal?.blocking).toBe(true);
    expect(signal?.requiresReview).toBe(true);
    expect(signal?.scoreDelta).toBe(30);
  });

  it('should fire RS-ARCH-001 when CONFIG node is affected in findings', () => {
    const evidence = createMinimalEvidence({
      blastRadiusFindings: [
        {
          id: 'find-1',
          stableKey: 'config-key',
          nodeName: 'tsconfig.json',
          nodePath: 'tsconfig.json',
          nodeType: 'CONFIG',
          category: 'CONFIG',
          impactClass: 'FIRST_ORDER',
          depth: 1,
        },
      ],
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-ARCH-001');
    expect(signal).toBeDefined();
    expect(signal?.category).toBe('ARCHITECTURE');
    expect(signal?.severity).toBe('HIGH');
    expect(signal?.requiresReview).toBe(true);
    expect(signal?.scoreDelta).toBe(15);
  });

  it('should fire RS-ARCH-002 when WORKSPACE_PACKAGE node is affected', () => {
    const evidence = createMinimalEvidence({
      blastRadiusFindings: [
        {
          id: 'find-2',
          stableKey: 'pkg-core',
          nodeName: '@impactra/shared',
          nodePath: 'packages/shared',
          nodeType: 'WORKSPACE_PACKAGE',
          category: 'WORKSPACE_PACKAGE',
          impactClass: 'TRANSITIVE',
          depth: 2,
        },
      ],
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-ARCH-002');
    expect(signal).toBeDefined();
    expect(signal?.category).toBe('ARCHITECTURE');
    expect(signal?.scoreDelta).toBe(15);
  });

  it('should fire RS-DEP-001 when a dependency edge is removed', () => {
    const evidence = createMinimalEvidence({
      dependencyDeltas: [
        {
          id: 'dep-1',
          deltaType: 'EDGE_REMOVED',
          sourceStableKey: 'src-1',
          targetStableKey: 'target-1',
          edgeType: 'CONTAINS',
        },
      ],
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-DEP-001');
    expect(signal).toBeDefined();
    expect(signal?.category).toBe('DEPENDENCY');
    expect(signal?.requiresReview).toBe(true);
    expect(signal?.scoreDelta).toBe(20);
  });

  it('should fire RS-QUALITY-001 when traversal was truncated', () => {
    const evidence = createMinimalEvidence({
      blastRadiusAnalysis: {
        id: 'bra-1',
        maxDepth: 5,
        rootCount: 1,
        affectedNodeCount: 50,
        firstOrderCount: 10,
        transitiveCount: 40,
        truncated: true,
      },
    });

    const signals = ruleEngine.evaluateRules(evidence);
    const signal = signals.find((s) => s.ruleId === 'RS-QUALITY-001');
    expect(signal).toBeDefined();
    expect(signal?.category).toBe('ANALYSIS_QUALITY');
    expect(signal?.scoreDelta).toBe(25);
  });
});
