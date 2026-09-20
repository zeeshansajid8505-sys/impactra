import React from 'react';
import {
  Boxes,
  Shield,
  Code2,
  Database,
  Server,
  CheckCircle2,
} from 'lucide-react';

const CAPABILITIES = [
  {
    name: 'Architecture',
    icon: Boxes,
    summary: 'Detect circular dependencies, coupling spikes, and service boundary violations.',
  },
  {
    name: 'Security',
    icon: Shield,
    summary: 'Identify auth bypasses, token exposures, sensitive routes, and attack surface expansion.',
  },
  {
    name: 'APIs',
    icon: Code2,
    summary: 'Detect contract drift, parameter removals, and breaking schema changes.',
  },
  {
    name: 'Database',
    icon: Database,
    summary: 'Flag table locks, destructive column drops, and incompatible migrations.',
  },
  {
    name: 'Infrastructure',
    icon: Server,
    summary: 'Inspect container configs, environment variables, and network policy drift.',
  },
  {
    name: 'Tests',
    icon: CheckCircle2,
    summary: 'Pinpoint affected test suites and surface untested code paths before merge.',
  },
];

export function AnalysisCapabilities() {
  return (
    <section className="space-y-6 pt-4">
      <div className="pb-2 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Continuous Change Analyzers
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Specialized deterministic inspection engines operating on AST diffs.
          </p>
        </div>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          6 Engines Active
        </span>
      </div>

      {/* Elegant Responsive Grid with Minimal Separators (No boxed cards everywhere) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <div
              key={cap.name}
              className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors flex items-start gap-3.5"
            >
              <div className="p-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--accent)] shrink-0">
                <Icon className="w-4 h-4" />
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {cap.name}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {cap.summary}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
