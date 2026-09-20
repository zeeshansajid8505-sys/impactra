import React from 'react';
import { GitPullRequest, GitFork, ArrowUpRight } from 'lucide-react';
import { ExplanatoryModalType } from '../shared/ExplanatoryModal';

interface RecentChangesSectionProps {
  onOpenModal: (type: ExplanatoryModalType) => void;
}

export function RecentChangesSection({ onOpenModal }: RecentChangesSectionProps) {
  return (
    <section className="space-y-6 pt-4">
      <div className="pb-2 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Recent Changes
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Pull requests, diff ingestion stream, and active blast-radius evaluations.
          </p>
        </div>

        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          0 Changes Ingested
        </span>
      </div>

      {/* Spacious, Elegant Empty State */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8 sm:p-12 text-center shadow-2xs flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--surface-raised)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)]">
          <GitPullRequest className="w-5 h-5 stroke-1" />
        </div>

        <div className="space-y-1.5 max-w-md">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            No repository connected yet
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            Once a repository is connected, pull requests, analyzed changes, and release decisions will appear here in real time.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenModal('connect')}
          className="inline-flex items-center gap-2 text-xs font-medium px-4 py-2 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <GitFork className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          <span>Connect Repository</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        </button>

        <p className="text-[11px] text-[var(--text-muted)] font-mono pt-2">
          Supports GitHub App, GitHub Actions, and GitLab Webhook integrations
        </p>
      </div>
    </section>
  );
}
