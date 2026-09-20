/**
 * @impactra/shared
 * Core domain contracts, enums, and types for Impactra platform.
 */

export type RiskLevel =
  | 'OBSERVED'
  | 'CHANGED'
  | 'AFFECTED'
  | 'WARNING'
  | 'CRITICAL';

export interface RiskLevelInfo {
  label: string;
  description: string;
  colorVar: string;
  badgeClass: string;
}

export const RISK_LEVEL_DEFINITIONS: Record<RiskLevel, RiskLevelInfo> = {
  OBSERVED: {
    label: 'Observed',
    description: 'Entity inspected with zero modifications or blast impact detected.',
    colorVar: 'var(--text-muted)',
    badgeClass: 'badge-neutral',
  },
  CHANGED: {
    label: 'Changed',
    description: 'Direct code, signature, or configuration modification in pull request.',
    colorVar: 'var(--info)',
    badgeClass: 'badge-info',
  },
  AFFECTED: {
    label: 'Affected',
    description: 'Downstream caller, consumer, or dependent entity within blast radius.',
    colorVar: 'var(--accent)',
    badgeClass: 'badge-accent',
  },
  WARNING: {
    label: 'Warning',
    description: 'Potential contract drift, untested path, or non-breaking risk flagged.',
    colorVar: 'var(--warning)',
    badgeClass: 'badge-warning',
  },
  CRITICAL: {
    label: 'Critical',
    description: 'Breaking change, security breach, or release-blocking violation.',
    colorVar: 'var(--danger)',
    badgeClass: 'badge-danger',
  },
};

export type AnalysisCategory =
  | 'ARCHITECTURE'
  | 'SECURITY'
  | 'APIS'
  | 'DATABASE'
  | 'INFRASTRUCTURE'
  | 'TESTS';

export interface AnalysisCategoryMetadata {
  id: AnalysisCategory;
  name: string;
  shortDescription: string;
  scope: string;
}

export const ANALYSIS_CATEGORIES: Record<AnalysisCategory, AnalysisCategoryMetadata> = {
  ARCHITECTURE: {
    id: 'ARCHITECTURE',
    name: 'Architecture',
    shortDescription: 'Service boundaries, circular dependencies, and module coupling',
    scope: 'Package & Service Graph',
  },
  SECURITY: {
    id: 'SECURITY',
    name: 'Security',
    shortDescription: 'Authentication flows, secret exposure, privilege escalation, and attack surface',
    scope: 'Auth & Perimeter Controls',
  },
  APIS: {
    id: 'APIS',
    name: 'APIs',
    shortDescription: 'REST/GraphQL/gRPC contract compatibility and breaking changes',
    scope: 'External & Internal Contracts',
  },
  DATABASE: {
    id: 'DATABASE',
    name: 'Database',
    shortDescription: 'Migration safety, destructive alterations, lock contention, and index health',
    scope: 'Persistence Layer',
  },
  INFRASTRUCTURE: {
    id: 'INFRASTRUCTURE',
    name: 'Infrastructure',
    shortDescription: 'Container configurations, environment variable drift, and network topology',
    scope: 'Deployment & Runtime',
  },
  TESTS: {
    id: 'TESTS',
    name: 'Tests',
    shortDescription: 'Affected test suites, regression vulnerability, and test coverage gaps',
    scope: 'Verification Suite',
  },
};

export type DigitalTwinNodeType =
  | 'WEB'
  | 'API'
  | 'AUTH'
  | 'WORKER'
  | 'DATABASE'
  | 'QUEUE';

export interface DigitalTwinNode {
  id: string;
  label: string;
  type: DigitalTwinNodeType;
  status: 'IDLE' | 'ANALYZING' | 'AFFECTED' | 'HEALTHY';
  dependencies: string[];
}

export type ReleaseDecision = 'PENDING' | 'APPROVED' | 'WARNED' | 'BLOCKED';

export interface ReleaseSafetyStatus {
  decision: ReleaseDecision;
  score: number | null;
  summary: string;
  activeAnalysesCount: number;
}

