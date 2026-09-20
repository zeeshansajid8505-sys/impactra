import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Security Intelligence',
};

export default function SecurityPage() {
  return (
    <PlaceholderPage
      title="Security Analyzer"
      category="Intelligence"
      statusBadge="Security Perimeter"
      description="Static security perimeter analysis detecting authentication bypasses, sensitive endpoint exposure, privilege escalation, and token leakage."
      plannedFeatures={[
        'AST-level detection of sensitive auth middleware removals',
        'Route exposure and perimeter boundary changes',
        'Deterministic secret and credential leak scanning',
        'Dependency vulnerability cross-referencing',
      ]}
    />
  );
}
