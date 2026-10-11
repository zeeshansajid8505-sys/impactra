'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldAlert, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiCreateOrganization } from '@/lib/api-client';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refresh, setActiveOrgId } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customSlug, setCustomSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!customSlug) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
      );
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setError(null);
    setLoading(true);

    try {
      const result = await apiCreateOrganization({
        name: name.trim(),
        slug: slug.trim() || undefined,
      });

      await refresh();
      setActiveOrgId(result.organization.id);
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create organization.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-8 bg-[var(--surface)] p-8 rounded-xl border border-[var(--border-strong)] shadow-sm">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-indigo-600 mb-2 shadow-2xs">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Create Your Engineering Organization
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Welcome, <span className="font-semibold text-[var(--text-primary)]">{user?.name || 'Engineer'}</span>. Set up your team&apos;s workspace boundary.
          </p>
        </div>

        {/* Multi-Tenancy Security Callout */}
        <div className="p-3.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] space-y-1.5 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
            <span>Multi-Tenant Isolation Guarantee</span>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            Organizations establish strict tenant boundaries. Repositories, Digital Twin architectures, pull requests, AST analyses, and release evaluations remain cryptographically isolated within your organization.
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="orgName"
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5"
            >
              Organization Name
            </label>
            <input
              id="orgName"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Engineering"
              className="w-full px-3.5 py-2 rounded-lg text-sm bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="orgSlug"
                className="block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Workspace URL Identifier (Slug)
              </label>
              {!customSlug && (
                <button
                  type="button"
                  onClick={() => setCustomSlug(true)}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  Customize
                </button>
              )}
            </div>
            <div className="flex items-center rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] font-mono text-xs">
              <span className="select-none">impactra.local/org/</span>
              <input
                id="orgSlug"
                type="text"
                required
                readOnly={!customSlug}
                value={slug}
                onChange={(e) => {
                  setCustomSlug(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                }}
                placeholder="acme-engineering"
                className="w-full bg-transparent text-[var(--text-primary)] font-mono text-xs focus:outline-none ml-0.5"
              />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 font-mono">
              Unique immutable tenant identifier for API routes and CLI triggers.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full flex justify-center items-center gap-2 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[var(--text-primary)] hover:opacity-90 active:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent)] disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Provisioning organization...</span>
                </span>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Establish Organization & Enter Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
