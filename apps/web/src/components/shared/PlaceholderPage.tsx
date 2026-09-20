import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Card, Badge, Button } from '@impactra/ui';

interface PlaceholderPageProps {
  title: string;
  category: string;
  statusBadge?: string;
  targetPhase?: string;
  description: string;
  plannedFeatures: string[];
}

export function PlaceholderPage({
  title,
  category,
  statusBadge,
  description,
  plannedFeatures,
}: PlaceholderPageProps) {
  const badgeLabel = statusBadge || 'Module Preview';

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Overview
      </Link>

      <Card className="p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                {category}
              </span>
              <Badge variant="accent">{badgeLabel}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-xs text-[var(--text-muted)] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span>Ready for Repository Link</span>
          </div>
        </div>

        <div className="space-y-4 text-sm text-[var(--text-secondary)]">
          <p className="leading-relaxed">{description}</p>

          <div className="p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
              <ShieldCheck className="w-4 h-4 text-[var(--info)]" />
              Key Capabilities & Analysis Workflow:
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {plannedFeatures.map((feat) => (
                <li key={feat} className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="text-[var(--accent)] font-bold">•</span>
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] pt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--info)]" />
            <span>
              This intelligence module activates automatically once a software repository is connected to the workspace.
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border)] flex justify-end">
          <Link href="/">
            <Button variant="secondary" size="sm">
              Return to Overview
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
