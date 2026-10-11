'use client';

import type { ReactNode } from 'react';
import { TopNav } from './TopNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-150">
      {/* Horizontal Top Product Bar */}
      <TopNav />

      {/* Spacious Main Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12 md:space-y-16">
        {children}
      </main>

      {/* Minimal Product Footer */}
      <footer className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--text-muted)] space-y-1">
        <p className="font-medium text-[var(--text-secondary)]">
          Impactra — Software Change Intelligence & Release Safety Platform
        </p>
        <p className="font-mono text-[11px]">
          Deterministic Analysis · Software Digital Twin · Release Gating
        </p>
      </footer>
    </div>
  );
}
