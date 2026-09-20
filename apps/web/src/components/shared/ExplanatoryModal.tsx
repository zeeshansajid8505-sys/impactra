'use client';

import React, { useEffect, useRef } from 'react';
import { X, GitBranch, Layers, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@impactra/ui';

export type ExplanatoryModalType = 'analyze' | 'connect' | null;

interface ExplanatoryModalProps {
  type: ExplanatoryModalType;
  isOpen: boolean;
  onClose: () => void;
}

export function ExplanatoryModal({ type, isOpen, onClose }: ExplanatoryModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !type) return null;

  const isAnalyze = type === 'analyze';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-6 text-left overflow-hidden"
      >
        {/* Subtle top indicator line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--accent)] to-[var(--info)]" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--accent)]">
              {isAnalyze ? <Layers className="w-5 h-5" /> : <GitBranch className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                {isAnalyze ? 'Analysis Pipeline' : 'Repository Integration'}
              </span>
              <h3 id="modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                {isAnalyze ? 'Change Analysis Ingestion' : 'Connect Software Repository'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="space-y-4 text-sm text-[var(--text-secondary)]">
          <p>
            {isAnalyze
              ? 'Real-time change intelligence requires an active repository connection. Connect a GitHub or GitLab repository to ingest commit diffs, construct the Software Digital Twin, and calculate blast radius impacts.'
              : 'Repository connectivity authenticates via dedicated GitHub App or GitLab webhook integrations to ingest pull requests, commit trees, and configuration files in real time.'}
          </p>

          <div className="p-3.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-primary)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--info)]" />
              Key capabilities enabled upon repository connection:
            </div>
            <ul className="text-xs space-y-1.5 text-[var(--text-secondary)] pl-1">
              {isAnalyze ? (
                <>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>AST & Git Diff Delta:</strong> Parse incoming pull requests down to AST syntax changes.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>Software Digital Twin:</strong> Traverse caller and consumer graphs across service boundaries.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>Deterministic Decision Engine:</strong> Evaluate policy thresholds for safe release.</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>Automated Webhook Sync:</strong> Real-time listener for PR opened and synchronize events.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>Granular Permissions:</strong> Strict read-only access for code metadata and AST inspection.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                    <span><strong>Status Check Reporting:</strong> Inline PR status checks and automated safety commentary.</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span>Local Workspace · Ready to link software repository</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Got it
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              window.open('https://github.com', '_blank', 'noopener,noreferrer');
            }}
            className="gap-1"
          >
            Learn about GitHub App
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
