'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  GitPullRequest,
  RefreshCw,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  GitBranch,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FolderGit2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiListChangeSets, apiListRepositories } from '@/lib/api-client';
import { ChangeSetDto, RepositoryConnectionDto } from '@impactra/shared';

export default function WorkspaceChangesPage() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;

  const [changes, setChanges] = useState<ChangeSetDto[]>([]);
  const [repositories, setRepositories] = useState<RepositoryConnectionDto[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    Promise.all([
      apiListChangeSets(organizationId, {
        repositoryId: selectedRepoId || undefined,
        status: statusFilter || undefined,
        search: searchQuery || undefined,
        limit: 50,
      }),
      apiListRepositories(organizationId, { limit: 100 }),
    ])
      .then(([changesRes, reposRes]) => {
        if (cancelled) return;
        setChanges(changesRes.items);
        setRepositories(reposRes.repositories);
        setError(null);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load change sets: ${msg}`);
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, selectedRepoId, statusFilter, searchQuery]);

  const handleRefresh = useCallback(async () => {
    if (!organizationId) return;
    setRefreshing(true);
    try {
      const [changesRes, reposRes] = await Promise.all([
        apiListChangeSets(organizationId, {
          repositoryId: selectedRepoId || undefined,
          status: statusFilter || undefined,
          search: searchQuery || undefined,
          limit: 50,
        }),
        apiListRepositories(organizationId, { limit: 100 }),
      ]);
      setChanges(changesRes.items);
      setRepositories(reposRes.repositories);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load change sets: ${msg}`);
    } finally {
      setRefreshing(false);
    }
  }, [organizationId, selectedRepoId, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = changes.length;
    const open = changes.filter((c) => c.state === 'open').length;
    const merged = changes.filter((c) => c.isMerged || c.state === 'merged').length;
    const analyzed = changes.filter(
      (c) => c.latestRevision && c.latestRevision.status === 'SUCCEEDED',
    ).length;
    return { total, open, merged, analyzed };
  }, [changes]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Pull Requests & Changes
            </h1>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              Phase 06
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Deterministic PR change ingestion, immutable commit revision history, and Digital Twin change mapping.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/workspace/repositories"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            Connected Repositories
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <div className="text-xs font-medium text-[var(--text-muted)]">Tracked Changes</div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.total}</div>
        </div>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <div className="text-xs font-medium text-[var(--text-muted)]">Open Pull Requests</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.open}</div>
        </div>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <div className="text-xs font-medium text-[var(--text-muted)]">Merged Changes</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.merged}</div>
        </div>
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-1">
          <div className="text-xs font-medium text-[var(--text-muted)]">Twin Analyzed</div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.analyzed}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search by pull request title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
          />
        </div>

        <select
          value={selectedRepoId}
          onChange={(e) => setSelectedRepoId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Repositories</option>
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="merged">Merged</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-16 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm">Loading change sets...</p>
        </div>
      ) : changes.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)]/50 space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <GitPullRequest className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              No pull requests recorded yet
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
              Pull requests will appear here automatically via GitHub App webhooks, or you can manually sync a pull request from a connected repository page.
            </p>
          </div>
          <div>
            <Link
              href="/workspace/repositories"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Go to Connected Repositories
            </Link>
          </div>
        </div>
      ) : (
        /* Changes List Table */
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                  <th className="py-3 px-4">Pull Request</th>
                  <th className="py-3 px-4">Repository & Branches</th>
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Status & Analysis</th>
                  <th className="py-3 px-4">Diff & Twin Deltas</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {changes.map((item) => {
                  const rev = item.latestRevision;
                  const isMerged = item.isMerged || item.state === 'merged';
                  const isClosed = item.state === 'closed' && !isMerged;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[var(--surface-raised)]/60 transition-colors group"
                    >
                      {/* Pull Request */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/workspace/changes/${item.id}`}
                          className="font-semibold text-[var(--text-primary)] hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                        >
                          <GitPullRequest
                            className={`w-4 h-4 flex-shrink-0 ${
                              isMerged
                                ? 'text-purple-500'
                                : isClosed
                                ? 'text-gray-400'
                                : 'text-emerald-500'
                            }`}
                          />
                          <span className="truncate max-w-xs">{item.title}</span>
                          <span className="text-xs font-mono text-[var(--text-muted)]">
                            #{item.pullRequestNumber}
                          </span>
                        </Link>
                      </td>

                      {/* Repository & Branches */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div className="text-xs font-medium text-[var(--text-secondary)]">
                          {item.repository?.fullName || 'Repository'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] truncate max-w-[100px]">
                            {item.headRef}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                          <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] truncate max-w-[100px]">
                            {item.baseRef}
                          </span>
                        </div>
                      </td>

                      {/* Author */}
                      <td className="py-3.5 px-4 text-xs text-[var(--text-secondary)]">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span>{item.authorLogin}</span>
                        </div>
                      </td>

                      {/* Status & Analysis */}
                      <td className="py-3.5 px-4 space-y-1">
                        <div>
                          {isMerged ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              Merged
                            </span>
                          ) : isClosed ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-500/10 text-gray-500 border border-gray-500/20">
                              Closed
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Open
                            </span>
                          )}
                        </div>

                        <div>
                          {rev ? (
                            rev.status === 'SUCCEEDED' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Twin Mapped
                              </span>
                            ) : rev.status === 'FAILED' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
                                <AlertCircle className="w-3 h-3" />
                                Failed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-500">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                {rev.stage}
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-[var(--text-muted)]">No revision</span>
                          )}
                        </div>
                      </td>

                      {/* Diff & Twin Deltas */}
                      <td className="py-3.5 px-4 space-y-1 font-mono text-xs">
                        {rev ? (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{rev.filesAdded}
                              </span>
                              <span className="text-amber-600 dark:text-amber-400">
                                ~{rev.filesModified}
                              </span>
                              <span className="text-red-500">
                                -{rev.filesDeleted}
                              </span>
                              <span className="text-[var(--text-muted)] text-[11px]">files</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                              <span>
                                {rev.nodesAdded + rev.nodesModified + rev.nodesRemoved} nodes
                              </span>
                              <span>·</span>
                              <span>
                                {rev.edgesAdded + rev.edgesRemoved} edge deltas
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/workspace/changes/${item.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] transition-colors"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
