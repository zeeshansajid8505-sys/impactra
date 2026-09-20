import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shared/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Digital Twin Map',
};

export default function SystemMapPage() {
  return (
    <PlaceholderPage
      title="System Map"
      category="Digital Twin"
      statusBadge="Topology Engine"
      description="Interactive dynamic graph representation of your software architecture. Unifies code symbols, microservices, databases, messaging queues, and network boundaries."
      plannedFeatures={[
        'Interactive zoomable graph canvas for services and packages',
        'Filtering by entity type: API, DB, Service, Worker, Queue',
        'Real-time projection of active change blast radiuses',
        'Cross-repository boundary and contract visualization',
      ]}
    />
  );
}
