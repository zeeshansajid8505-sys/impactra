import React from 'react';
import { ShieldAlert } from 'lucide-react';

const EVALUATION_DOMAINS = [
  {
    name: 'Architecture',
    scope: 'Service boundaries, coupling, and circular package imports',
  },
  {
    name: 'Security',
    scope: 'Auth middleware, secrets, route exposure, and attack surfaces',
  },
  {
    name: 'API Contracts',
    scope: 'REST, GraphQL, and gRPC schema backwards-compatibility',
  },
  {
    name: 'Database',
    scope: 'Migration safety, lock contention, and destructive alterations',
  },
  {
    name: 'Infrastructure',
    scope: 'Container configs, IAM policies, and environment drift',
  },
  {
    name: 'Tests',
    scope: 'Affected test suites, coverage gaps, and regression risks',
  },
];

export function ReleaseSafetySection() {
  return (
    <section className="space-y-6 pt-4">
      <div className="pb-2 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Release Safety Engine
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1">
            Deterministic gating across six critical software dimensions.
          </p>
        </div>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          Policy: Standard Strict Gating
        </span>
      </div>

      {/* Spacious Open Section */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-8 shadow-2xs space-y-8">
        {/* Status Statement Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                  No change selected
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border)]">
                  Awaiting Input
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Connect a repository or select a change to evaluate release safety.
              </p>
            </div>
          </div>

          <div className="text-right sm:self-auto font-mono text-xs text-[var(--text-muted)]">
            <span>Score: -- / 100</span>
          </div>
        </div>

        {/* 6 Dimensions Expressed with Typography & Whitespace */}
        <div className="space-y-3">
          <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
            Evaluation Dimensions:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {EVALUATION_DOMAINS.map((domain) => (
              <div
                key={domain.name}
                className="py-2.5 border-b border-[var(--border)] flex flex-col justify-between space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {domain.name}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    Pending
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {domain.scope}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="pt-2 text-xs text-[var(--text-muted)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>Deterministic analysis evaluates hard policy gates before any optional AI summary.</span>
          <span className="font-mono text-[10px]">Zero Hallucinations Guarantee</span>
        </div>
      </div>
    </section>
  );
}
