import React from 'react';
import { ArrowRight, GitFork } from 'lucide-react';
import { Button } from '@impactra/ui';
import { ExplanatoryModalType } from '../shared/ExplanatoryModal';

interface HeroSectionProps {
  onOpenModal: (type: ExplanatoryModalType) => void;
}

export function HeroSection({ onOpenModal }: HeroSectionProps) {
  return (
    <section className="text-center max-w-3xl mx-auto space-y-6 pt-4 pb-2">
      {/* Product Context Tag */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] text-xs text-[var(--text-secondary)] shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        <span className="font-semibold tracking-wide text-[var(--text-primary)]">
          IMPACTRA
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-secondary)]">Software Change Intelligence</span>
      </div>

      {/* Large Refined Display Headline */}
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.12]">
        Understand the impact <br />
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent)] via-indigo-500 to-[var(--accent-hover)]">
          before you ship.
        </span>
      </h1>

      {/* Supporting Copy */}
      <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto font-normal">
        Analyze software changes across architecture, security, APIs, databases,
        infrastructure, and tests before they reach production.
      </p>

      {/* Action Buttons */}
      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={() => onOpenModal('analyze')}
          className="gap-2 shadow-sm font-medium px-6"
        >
          <span>Analyze a Change</span>
          <ArrowRight className="w-4 h-4" />
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={() => onOpenModal('connect')}
          className="gap-2 px-6"
        >
          <GitFork className="w-4 h-4 text-[var(--text-muted)]" />
          <span>Connect Repository</span>
        </Button>
      </div>

      {/* Small Honest Status */}
      <div className="pt-1 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]" />
        <span>Local workspace · No repository connected</span>
      </div>
    </section>
  );
}
