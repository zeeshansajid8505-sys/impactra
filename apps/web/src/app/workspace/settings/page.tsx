import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Workspace Settings',
};

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Workspace Settings"
      category="Workspace"
      statusBadge="Configuration"
      description="Configure workspace preferences, notification hooks (Slack, Discord), deterministic threshold policies, and API keys."
      plannedFeatures={[
        'Organization and workspace profile management',
        'Notification routing per severity level (Slack / Webhooks)',
        'Default gating policy selection and team access control',
        'API key generation for external CI/CD pipeline triggers',
      ]}
    />
  );
}
