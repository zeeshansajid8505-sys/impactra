export interface NavItem {
  title: string;
  href: string;
  badge?: string;
  isImplemented?: boolean;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAVIGATION_CONFIG: NavGroup[] = [
  {
    group: 'Platform',
    items: [
      {
        title: 'Overview',
        href: '/',
        isImplemented: true,
      },
    ],
  },
  {
    group: 'Changes',
    items: [
      {
        title: 'Pull Requests',
        href: '/changes/pull-requests',
        isImplemented: false,
      },
      {
        title: 'Analyses',
        href: '/changes/analyses',
        isImplemented: false,
      },
    ],
  },
  {
    group: 'Digital Twin',
    items: [
      {
        title: 'System Map',
        href: '/digital-twin/system-map',
        isImplemented: false,
      },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      {
        title: 'Blast Radius',
        href: '/intelligence/blast-radius',
        isImplemented: false,
      },
      {
        title: 'Security',
        href: '/intelligence/security',
        isImplemented: false,
      },
      {
        title: 'Architecture',
        href: '/intelligence/architecture',
        isImplemented: false,
      },
    ],
  },
  {
    group: 'Release',
    items: [
      {
        title: 'Release Safety',
        href: '/release/safety',
        isImplemented: false,
      },
    ],
  },
  {
    group: 'Workspace',
    items: [
      {
        title: 'Repositories',
        href: '/workspace/repositories',
        isImplemented: false,
      },
      {
        title: 'Settings',
        href: '/workspace/settings',
        isImplemented: false,
      },
    ],
  },
];

export interface TopologyNode {
  id: string;
  label: string;
  category: 'frontend' | 'gateway' | 'service' | 'storage' | 'messaging';
  x: number;
  y: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
  label?: string;
}

export const DEMO_TOPOLOGY_NODES: TopologyNode[] = [
  { id: 'web', label: 'Web App (Next.js)', category: 'frontend', x: 70, y: 70 },
  { id: 'api', label: 'API Gateway', category: 'gateway', x: 250, y: 70 },
  { id: 'auth', label: 'Auth Service', category: 'service', x: 440, y: 40 },
  { id: 'worker', label: 'Analysis Worker', category: 'service', x: 440, y: 110 },
  { id: 'queue', label: 'BullMQ / Redis', category: 'messaging', x: 620, y: 110 },
  { id: 'db', label: 'PostgreSQL DB', category: 'storage', x: 620, y: 40 },
];

export const DEMO_TOPOLOGY_EDGES: TopologyEdge[] = [
  { from: 'web', to: 'api' },
  { from: 'api', to: 'auth' },
  { from: 'api', to: 'worker' },
  { from: 'auth', to: 'db' },
  { from: 'worker', to: 'queue' },
  { from: 'worker', to: 'db' },
];

