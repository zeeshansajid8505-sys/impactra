'use client';

import { useState, type ElementType } from 'react';
import {
  Boxes,
  Database,
  Layers,
  Server,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';

interface ModuleEntity {
  id: string;
  name: string;
  category: string;
  tech: string;
  icon: ElementType;
  dependencies: string[];
  role: string;
}

const MODULES: ModuleEntity[] = [
  {
    id: 'web',
    name: 'Web Application',
    category: 'Client Layer',
    tech: 'Next.js · React 19',
    icon: Layers,
    dependencies: ['api'],
    role: 'Frontend customer experience & change intelligence workspace.',
  },
  {
    id: 'api',
    name: 'API Gateway',
    category: 'Application Layer',
    tech: 'NestJS · TypeScript',
    icon: Server,
    dependencies: ['auth', 'worker'],
    role: 'Central request routing, authorization check, and change ingestion handler.',
  },
  {
    id: 'auth',
    name: 'Authentication',
    category: 'Security Perimeter',
    tech: 'OAuth · JWT · RBAC',
    icon: ShieldCheck,
    dependencies: ['db'],
    role: 'Identity verification, token signing, and security boundary isolation.',
  },
  {
    id: 'worker',
    name: 'Analysis Workers',
    category: 'Processing Layer',
    tech: 'BullMQ · AST Engine',
    icon: Zap,
    dependencies: ['queue', 'db'],
    role: 'Asynchronous AST code parsing and blast radius graph computation.',
  },
  {
    id: 'queue',
    name: 'Event Queue',
    category: 'Messaging Layer',
    tech: 'Redis Pub/Sub',
    icon: Boxes,
    dependencies: [],
    role: 'High-throughput asynchronous job distribution and task scheduling.',
  },
  {
    id: 'db',
    name: 'Primary Database',
    category: 'Persistence Layer',
    tech: 'PostgreSQL · Schema Graph',
    icon: Database,
    dependencies: [],
    role: 'Relational data models, migration tracking, and code graph entities.',
  },
];

export function DigitalTwinMap() {
  const [selectedId, setSelectedId] = useState<string>('api');
  const selectedModule = MODULES.find((m) => m.id === selectedId) || MODULES[0];

  return (
    <section className="space-y-6 pt-4">
      {/* Header with Concept Preview tag */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Software Digital Twin
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent-border)] font-medium">
              Concept Preview
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Living architectural model correlating code symbols, services, APIs, and data boundaries.
          </p>
        </div>

        <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
          6 System Nodes Illustrated
        </span>
      </div>

      {/* Main Architectural Dependency Canvas */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-8 shadow-2xs space-y-6">
        {/* Module Tiles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod) => {
            const isSelected = mod.id === selectedId;
            const isDownstream = selectedModule.dependencies.includes(mod.id);
            const isUpstream = mod.dependencies.includes(selectedId);
            const Icon = mod.icon;

            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setSelectedId(mod.id)}
                className={`p-5 rounded-xl border text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                  isSelected
                    ? 'bg-[var(--surface-raised)] border-[var(--accent)] shadow-xs ring-1 ring-[var(--accent)]'
                    : isDownstream
                    ? 'bg-[var(--surface)] border-[var(--info-border)] hover:border-[var(--info)]'
                    : isUpstream
                    ? 'bg-[var(--surface)] border-[var(--accent-border)] hover:border-[var(--accent)]'
                    : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-primary)]'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    {mod.category}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {mod.name}
                </h3>
                <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                  {mod.tech}
                </p>

                {/* Status indicator tag */}
                <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-mono">
                  {isSelected ? (
                    <span className="text-[var(--accent)] font-semibold">Active Selection</span>
                  ) : isDownstream ? (
                    <span className="text-[var(--info)]">↓ Direct Dependency</span>
                  ) : isUpstream ? (
                    <span className="text-[var(--accent)]">↑ Upstream Caller</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">System Entity</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Module Detail Horizon */}
        <div className="p-4 sm:p-5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Selected: {selectedModule.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                {selectedModule.category}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {selectedModule.role}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-muted)] shrink-0">
            <span>Dependencies: {selectedModule.dependencies.length > 0 ? selectedModule.dependencies.join(', ') : 'None (Leaf)'}</span>
          </div>
        </div>

        {/* Subtle Concept Disclaimer */}
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] pt-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Illustrative software dependency topology. Connect a repository to populate live code symbols, dependency graphs, and AST nodes.
          </span>
        </div>
      </div>
    </section>
  );
}
