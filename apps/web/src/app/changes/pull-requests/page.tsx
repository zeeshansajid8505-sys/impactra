import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Pull Requests',
};

export default function PullRequestsPage() {
  return (
    <PlaceholderPage
      title="Pull Requests"
      category="Changes"
      statusBadge="Integration Ready"
      description="Live pull request ingestion stream connected to GitHub and GitLab repositories. Displays incoming diffs, changed files, and associated author metadata."
      plannedFeatures={[
        'Webhook receiver for pull request open and synchronize events',
        'Direct diff breakdown & commit history visualization',
        'Automatic trigger of change intelligence pipeline',
        'Interactive change inspection and AST review',
      ]}
    />
  );
}
