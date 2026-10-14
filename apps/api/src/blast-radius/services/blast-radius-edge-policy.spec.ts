import { BlastRadiusEdgePolicy } from './blast-radius-edge-policy';
import {
  DigitalTwinEdgeType,
  DigitalTwinNodeType,
  BlastRadiusCategory,
} from '@impactra/database';

describe('BlastRadiusEdgePolicy', () => {
  let policy: BlastRadiusEdgePolicy;

  beforeEach(() => {
    policy = new BlastRadiusEdgePolicy();
  });

  describe('isPropagatingEdge', () => {
    it('returns true for IMPORTS', () => {
      expect(policy.isPropagatingEdge(DigitalTwinEdgeType.IMPORTS)).toBe(true);
    });

    it('returns true for WORKSPACE_DEPENDS_ON', () => {
      expect(policy.isPropagatingEdge(DigitalTwinEdgeType.WORKSPACE_DEPENDS_ON)).toBe(true);
    });

    it('returns true for DECLARES_DEPENDENCY', () => {
      expect(policy.isPropagatingEdge(DigitalTwinEdgeType.DECLARES_DEPENDENCY)).toBe(true);
    });

    it('returns false for CONTAINS', () => {
      expect(policy.isPropagatingEdge(DigitalTwinEdgeType.CONTAINS)).toBe(false);
    });

    it('returns false for unsupported edge types', () => {
      expect(policy.isPropagatingEdge('UNSUPPORTED' as any)).toBe(false);
    });
  });

  describe('getTraversalDirection', () => {
    it('returns REVERSE_DEPENDENCY for propagating edge types', () => {
      expect(policy.getTraversalDirection(DigitalTwinEdgeType.IMPORTS)).toBe('REVERSE_DEPENDENCY');
      expect(policy.getTraversalDirection(DigitalTwinEdgeType.WORKSPACE_DEPENDS_ON)).toBe('REVERSE_DEPENDENCY');
      expect(policy.getTraversalDirection(DigitalTwinEdgeType.DECLARES_DEPENDENCY)).toBe('REVERSE_DEPENDENCY');
    });

    it('returns NONE for non-propagating edge types', () => {
      expect(policy.getTraversalDirection(DigitalTwinEdgeType.CONTAINS)).toBe('NONE');
    });

    it('returns NONE for unsupported edge types', () => {
      expect(policy.getTraversalDirection('UNSUPPORTED' as any)).toBe('NONE');
    });
  });

  describe('mapNodeCategory', () => {
    it('maps REPOSITORY to REPOSITORY', () => {
      expect(policy.mapNodeCategory(DigitalTwinNodeType.REPOSITORY)).toBe(BlastRadiusCategory.REPOSITORY);
    });

    it('maps FILE to FILE', () => {
      expect(policy.mapNodeCategory(DigitalTwinNodeType.FILE)).toBe(BlastRadiusCategory.FILE);
    });

    it('maps WORKSPACE_PACKAGE to WORKSPACE_PACKAGE', () => {
      expect(policy.mapNodeCategory(DigitalTwinNodeType.WORKSPACE_PACKAGE)).toBe(BlastRadiusCategory.WORKSPACE_PACKAGE);
    });

    it('maps EXTERNAL_DEPENDENCY to EXTERNAL_DEPENDENCY', () => {
      expect(policy.mapNodeCategory(DigitalTwinNodeType.EXTERNAL_DEPENDENCY)).toBe(BlastRadiusCategory.EXTERNAL_DEPENDENCY);
    });

    it('maps CONFIG to CONFIG', () => {
      expect(policy.mapNodeCategory(DigitalTwinNodeType.CONFIG)).toBe(BlastRadiusCategory.CONFIG);
    });

    it('defaults unknown types to OTHER', () => {
      expect(policy.mapNodeCategory('UNKNOWN' as any)).toBe(BlastRadiusCategory.OTHER);
    });
  });

  describe('buildReasonSummary', () => {
    it('builds clear reason summary for first-order dependent', () => {
      const rule = policy.getEdgeRule(DigitalTwinEdgeType.IMPORTS);
      const summary = policy.buildReasonSummary(rule, 1, 'file:src/util.ts', 'file:src/service.ts');
      expect(summary).toContain('First-order dependent');
      expect(summary).toContain("Root change 'file:src/util.ts' reaches 'file:src/service.ts'");
    });

    it('builds clear reason summary for transitive dependent', () => {
      const rule = policy.getEdgeRule(DigitalTwinEdgeType.WORKSPACE_DEPENDS_ON);
      const summary = policy.buildReasonSummary(rule, 2, 'pkg:core', 'pkg:app');
      expect(summary).toContain('Transitive dependent (depth 2)');
      expect(summary).toContain("Root change 'pkg:core' reaches 'pkg:app'");
    });
  });
});
