import { Injectable } from '@nestjs/common';
import {
  DigitalTwinEdgeType,
  DigitalTwinNodeType,
  BlastRadiusCategory,
} from '@impactra/database';

export interface EdgeTraversalRule {
  readonly propagates: boolean;
  readonly direction: 'REVERSE_DEPENDENCY' | 'DIRECT' | 'NONE';
  readonly reasonCode: string;
  readonly reasonSummary: string;
}

/**
 * Centralized deterministic policy defining dependency propagation semantics
 * for Digital Twin edges and node classification in Blast Radius analysis.
 */
@Injectable()
export class BlastRadiusEdgePolicy {
  /**
   * Deterministic edge traversal rules.
   *
   * In the Digital Twin graph:
   * - IMPORTS: A -(IMPORTS)-> B means A imports B (A depends on B).
   *   When B changes, dependent A is in the blast radius. Traversal direction is REVERSE (Target -> Source).
   *
   * - WORKSPACE_DEPENDS_ON: A -(WORKSPACE_DEPENDS_ON)-> B means package A depends on package B.
   *   When B changes, dependent A is in the blast radius. Traversal direction is REVERSE (Target -> Source).
   *
   * - DECLARES_DEPENDENCY: A -(DECLARES_DEPENDENCY)-> B means file/package A declares dependency B.
   *   When external dependency B is altered, dependent A is in the blast radius. Traversal direction is REVERSE (Target -> Source).
   *
   * - CONTAINS: R -(CONTAINS)-> F represents hierarchical containment (e.g. repo contains file).
   *   Containment is structural, not an executable dependency relationship. Non-propagating.
   */
  private readonly rules: Record<DigitalTwinEdgeType, EdgeTraversalRule> = {
    IMPORTS: {
      propagates: true,
      direction: 'REVERSE_DEPENDENCY',
      reasonCode: 'REVERSE_IMPORT_DEPENDENCY',
      reasonSummary: 'Component imports the changed entity or a dependent entity in the call chain.',
    },
    WORKSPACE_DEPENDS_ON: {
      propagates: true,
      direction: 'REVERSE_DEPENDENCY',
      reasonCode: 'WORKSPACE_PACKAGE_DEPENDENCY',
      reasonSummary: 'Workspace package declares a dependency upon the changed package.',
    },
    DECLARES_DEPENDENCY: {
      propagates: true,
      direction: 'REVERSE_DEPENDENCY',
      reasonCode: 'DECLARED_DEPENDENCY',
      reasonSummary: 'Component declares a direct dependency upon the changed entity.',
    },
    CONTAINS: {
      propagates: false,
      direction: 'NONE',
      reasonCode: 'STRUCTURAL_CONTAINMENT',
      reasonSummary: 'Structural containment edges do not propagate behavioral blast radius.',
    },
  };

  /**
   * Evaluates traversal rules for a given DigitalTwin edge type.
   */
  getEdgeRule(edgeType: DigitalTwinEdgeType | string): EdgeTraversalRule {
    const rule = this.rules[edgeType as DigitalTwinEdgeType];
    if (!rule) {
      return {
        propagates: false,
        direction: 'NONE',
        reasonCode: 'UNSUPPORTED_EDGE_TYPE',
        reasonSummary: `Edge type '${edgeType}' is not supported for blast radius propagation.`,
      };
    }
    return rule;
  }

  /**
   * Returns true if the edge type propagates changes to dependents.
   */
  isPropagatingEdge(edgeType: DigitalTwinEdgeType | string): boolean {
    return this.getEdgeRule(edgeType).propagates;
  }

  /**
   * Returns the traversal direction ('REVERSE_DEPENDENCY', 'DIRECT', 'NONE').
   */
  getTraversalDirection(edgeType: DigitalTwinEdgeType | string): 'REVERSE_DEPENDENCY' | 'DIRECT' | 'NONE' {
    return this.getEdgeRule(edgeType).direction;
  }

  /**
   * Deterministically maps a DigitalTwinNodeType to its corresponding BlastRadiusCategory.
   * Strictly grounded in observed Digital Twin evidence without speculation.
   */
  mapNodeCategory(nodeType: DigitalTwinNodeType | string): BlastRadiusCategory {
    switch (nodeType) {
      case 'REPOSITORY':
        return BlastRadiusCategory.REPOSITORY;
      case 'FILE':
        return BlastRadiusCategory.FILE;
      case 'WORKSPACE_PACKAGE':
        return BlastRadiusCategory.WORKSPACE_PACKAGE;
      case 'EXTERNAL_DEPENDENCY':
        return BlastRadiusCategory.EXTERNAL_DEPENDENCY;
      case 'CONFIG':
        return BlastRadiusCategory.CONFIG;
      default:
        return BlastRadiusCategory.OTHER;
    }
  }

  /**
   * Generates a deterministic human-readable summary of the finding based on node details and edge rule.
   */
  buildReasonSummary(
    rule: EdgeTraversalRule,
    depth: number,
    rootStableKey: string,
    affectedStableKey: string,
  ): string {
    const orderStr = depth === 1 ? 'First-order dependent' : `Transitive dependent (depth ${depth})`;
    return `${orderStr}: ${rule.reasonSummary} Root change '${rootStableKey}' reaches '${affectedStableKey}'.`;
  }
}
