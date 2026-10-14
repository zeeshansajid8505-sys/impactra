'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Target,
  RefreshCw,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Layers,
  FolderGit2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiListOrganizationBlastRadiusAnalyses, apiListRepositories } from '@/lib/api-client';
import { BlastRadiusAnalysisDto, RepositoryConnectionDto } from '@impactra/shared';

export default function BlastRadiusIntelligencePage() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;

  const [analyses, setAnalyses] = useState<BlastRadiusAnalysisDto[]>([]);
  const [repositories, setRepositories] = useState<RepositoryConnectionDto[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [analysesRes, reposRes] = await Promise.all([
        apiListOrganizationBlastRadiusAnalyses(organizationId, {
          repositoryId: selectedRepoId || undefined,
          status: statusFilter || undefined,
          limit: 50,
        }),
        apiListRepositories(organizationId, { limit: 100 }),
      ]);
      setAnalyses(analysesRes.items);
      setRepositories(reposRes.repositories);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load blast-radius intelligence: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, selectedRepoId, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return;

    Promise.all([
      apiListOrganizationBlastRadiusAnalyses(organizationId, {
        repositoryId: selectedRepoId || undefined,
        status: statusFilter || undefined,
        limit: 50,
      }),
      apiListRepositories(organizationId, { limit: 100 }),
    ])
      .then(([analysesRes, reposRes]) => {
        if (cancelled) return;
        setAnalyses(analysesRes.items);
        setRepositories(reposRes.repositories);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load blast-radius intelligence: ${msg}`);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedRepoId, statusFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const stats = useMemo(() => {
    const total = analyses.length;
    const succeeded = analyses.filter((a) => a.status === 'SUCCEEDED').length;
    const running = analyses.filter((a) => a.status === 'RUNNING' || a.status === 'QUEUED').length;
    const totalAffected = analyses.reduce((acc, a) => acc + (a.totalAffectedNodes || 0), 0);
    const maxDepth = analyses.reduce((max, a) => Math.max(max, a.maxDepth || 0), 0);
    return { total, succeeded, running, totalAffected, maxDepth };
  }, [analyses]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Blast Radius Intelligence
            </h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Deterministic dependency traversal, shortest-path calculation, and ripple effect analysis across repository changes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Total Analyses</span>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">{stats.total}</div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Completed</span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {stats.succeeded}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">In Flight</span>
          <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {stats.running}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Impacted Nodes</span>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.totalAffected}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <span className="text-xs font-medium text-[var(--text-muted)]">Max Depth Reached</span>
          <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
            {stats.maxDepth}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-[var(--text-muted)]" />
          <select
            value={selectedRepoId}
            onChange={(e) => setSelectedRepoId(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Repositories</option>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="RUNNING">Running</option>
          <option value="QUEUED">Queued</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Analyses Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
            <span>Loading blast-radius analyses...</span>
          </div>
        ) : analyses.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)] space-y-2">
            <Target className="w-8 h-8 mx-auto opacity-30 text-[var(--text-muted)]" />
            <p className="font-semibold text-[var(--text-primary)]">No blast-radius analyses recorded</p>
            <p className="text-xs">
              Blast radius analyses are triggered automatically when pull request change sets are ingested.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Change Set ID</th>
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Total Impact</th>
                  <th className="py-3 px-4">Breakdown (1st / Trans)</th>
                  <th className="py-3 px-4">Max Depth</th>
                  <th className="py-3 px-4">Completed At</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {analyses.map((analysis) => (
                  <tr
                    key={analysis.id}
                    className="hover:bg-[var(--surface-raised)]/60 transition-colors text-xs"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                          analysis.status === 'SUCCEEDED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : analysis.status === 'FAILED'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : analysis.status === 'RUNNING'
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}
                      >
                        {analysis.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[var(--text-primary)]">
                      <Link
                        href={`/workspace/changes/${analysis.changeSetId}`}
                        className="hover:underline text-indigo-600 dark:text-indigo-400"
                      >
                        {analysis.changeSetId.slice(0, 12)}...
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--text-muted)]">
                      v{analysis.analysisVersion}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)]">
                      {analysis.totalAffectedNodes} nodes
                      {analysis.truncated && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-sans">
                          truncated
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {analysis.firstOrderAffectedNodes}
                      </span>
                      <span className="text-[var(--text-muted)]"> / </span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        {analysis.transitiveAffectedNodes}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                      {analysis.maxDepth}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">
                      {analysis.completedAt
                        ? new Date(analysis.completedAt).toLocaleString()
                        : analysis.startedAt
                        ? `Started ${new Date(analysis.startedAt).toLocaleTimeString()}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/workspace/changes/${analysis.changeSetId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>View Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
