import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Change Analyses',
};

export default function AnalysesPage() {
  return (
    <PlaceholderPage
      title="Change Analyses"
      category="Changes"
      statusBadge="Integration Ready"
      description="Historical and running change evaluations. Track analyzer runtimes, AST parsing execution, and deterministic decision results."
      plannedFeatures={[
        'Full historical audit log of pull request analyses',
        'Detailed pipeline timeline & execution metrics',
        'Analyzer breakdown per commit SHA',
        'Comparison of successive commit iterations',
      ]}
    />
  );
}
