import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Repositories',
};

export default function RepositoriesPage() {
  return (
    <PlaceholderPage
      title="Connected Repositories"
      category="Workspace"
      statusBadge="Integration Ready"
      description="Manage GitHub App connections, connected organizations, repositories, and branch tracking configurations."
      plannedFeatures={[
        'GitHub App installation and repository selector',
        'Branch tracking rules (main, staging, release branches)',
        'Monorepo sub-path filter definitions',
        'Webhook health monitoring and replay diagnostics',
      ]}
    />
  );
}
