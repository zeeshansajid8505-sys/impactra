import { GitCommit, Network, Radio, ShieldCheck } from 'lucide-react';

const STAGES = [
  {
    step: '01',
    name: 'Change',
    icon: GitCommit,
    description: 'Commit diffs and AST syntax deltas ingested from pull requests.',
    tag: 'Source Delta',
  },
  {
    step: '02',
    name: 'Dependencies',
    icon: Network,
    description: 'Projected onto the Software Digital Twin living graph model.',
    tag: 'Graph Mapping',
  },
  {
    step: '03',
    name: 'Blast Radius',
    icon: Radio,
    description: 'Transitive traversal uncovers upstream callers and downstream consumers.',
    tag: 'Impact Traversal',
  },
  {
    step: '04',
    name: 'Release Decision',
    icon: ShieldCheck,
    description: 'Deterministic multi-domain policy evaluation generates pass/fail verdict.',
    tag: 'Policy Gating',
  },
];

export function ChangePipelineVisual() {
  return (
    <section className="space-y-6 pt-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--accent)] font-semibold">
          Core Engine Pipeline
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
          How Impactra sees a change
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Moving beyond textual line diffs to full structural system intelligence.
        </p>
      </div>

      {/* Spacious 4-Stage Visual Progression */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <div
              key={stage.name}
              className="relative p-6 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-2xs hover:border-[var(--border-strong)] transition-all group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-[var(--text-muted)]">
                    {stage.step}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      {stage.name}
                    </h3>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {stage.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[var(--border)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)] font-mono">{stage.tag}</span>
                <span className="text-[10px] font-mono text-[var(--accent)]">Ready</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
