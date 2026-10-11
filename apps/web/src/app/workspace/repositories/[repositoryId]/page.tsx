'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import Link from 'next/link';
import {
  GitFork,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowLeft,
  Lock,
  Globe,
  Radio,
  FileCode,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiListRepositories,
  apiListIngestions,
  apiTriggerIngestion,
  apiGetLatestSnapshot,
} from '@/lib/api-client';
import {
  RepositoryConnectionDto,
  RepositoryIngestionDto,
  RepositorySnapshotDto,
} from '@impactra/shared';

export default function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const resolvedParams = use(params);
  const repositoryId = resolvedParams.repositoryId;

  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;
  const userRole = activeOrg?.membership.role;
  const canTrigger = Boolean(
    userRole && ['OWNER', 'ADMIN', 'ARCHITECT', 'DEVELOPER', 'RELEASE_MANAGER'].includes(userRole),
  );

  const [repository, setRepository] = useState<RepositoryConnectionDto | null>(null);
  const [ingestions, setIngestions] = useState<RepositoryIngestionDto[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<RepositorySnapshotDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [triggering, setTriggering] = useState<boolean>(false);
  const [targetRef, setTargetRef] = useState<string>('');
  const [targetSha, setTargetSha] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId || !repositoryId) return;

    try {
      // 1. Fetch repositories to find this one
      const repoRes = await apiListRepositories(organizationId, { limit: 100 });
      const found = repoRes.repositories.find((r) => r.id === repositoryId);
      if (found) {
        setRepository(found);
      }

      // 2. Fetch ingestions
      const ingRes = await apiListIngestions(organizationId, repositoryId, { limit: 50 });
      setIngestions(ingRes.ingestions);

      // 3. Fetch latest snapshot
      try {
        const snapRes = await apiGetLatestSnapshot(organizationId, repositoryId);
        setLatestSnapshot(snapRes);
      } catch {
        setLatestSnapshot(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: `Failed to load repository details: ${msg}` });
    } finally {
      setLoading(false);
    }
  }, [organizationId, repositoryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Safe polling: runs only while an ingestion job is actively progressing
  const hasActiveJob = useMemo(() => {
    return ingestions.some((job) =>
      ['QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING'].includes(job.status),
    );
  }, [ingestions]);

  useEffect(() => {
    if (!hasActiveJob || !organizationId || !repositoryId) return;

    const intervalId = setInterval(() => {
      loadData();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [hasActiveJob, organizationId, repositoryId, loadData]);

  const handleTrigger = async () => {
    if (!organizationId || !repositoryId) return;

    setTriggering(true);
    setFeedback(null);

    try {
      const payload: { ref?: string; commitSha?: string } = {};
      if (targetRef.trim()) payload.ref = targetRef.trim();
      if (targetSha.trim()) payload.commitSha = targetSha.trim();

      const newJob = await apiTriggerIngestion(organizationId, repositoryId, payload);
      setFeedback({
        type: 'success',
        message: `Ingestion job #${newJob.id.slice(0, 8)} queued successfully! Status: ${newJob.status}`,
      });
      setTargetRef('');
      setTargetSha('');
      setShowAdvanced(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ type: 'error', message: msg });
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Loading repository details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/workspace/repositories"
          className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Repositories</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors"
            title="Refresh repository data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <GitFork className="w-6 h-6 text-indigo-500" />
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                {repository?.fullName || 'Repository'}
              </h1>
              {repository?.htmlUrl && (
                <a
                  href={repository.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--text-muted)] hover:text-indigo-500 transition-colors"
                  title="View on GitHub"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              GitHub Repository ID: <span className="font-mono">{repository?.githubRepositoryId}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/workspace/repositories/${repositoryId}/digital-twin`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-semibold shadow-xs transition-colors"
            >
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Explore Digital Twin</span>
            </Link>

            <button
              type="button"
              onClick={handleTrigger}
              disabled={triggering || !canTrigger || !repository?.connected}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Cpu className={`w-4 h-4 ${triggering ? 'animate-spin' : ''}`} />
              <span>{triggering ? 'Queuing Ingestion...' : 'Ingest Repository'}</span>
            </button>
          </div>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border)] text-xs">
          <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">Branch:</span>
            <span className="font-mono px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
              {repository?.defaultBranch || 'main'}
            </span>
          </span>

          <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
            {repository?.isPrivate ? (
              <>
                <Lock className="w-3 h-3 text-amber-500" />
                <span>Private</span>
              </>
            ) : (
              <>
                <Globe className="w-3 h-3 text-blue-500" />
                <span>Public</span>
              </>
            )}
          </span>

          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
            <Radio className="w-2.5 h-2.5 text-emerald-500" />
            <span>{repository?.connected ? 'Connected' : 'Not Connected'}</span>
          </span>
        </div>

        {/* Advanced Target Ingestion Input Toggle */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-indigo-500 hover:underline cursor-pointer"
          >
            {showAdvanced ? 'Hide Ingestion Parameters' : 'Configure Custom Branch or Commit SHA'}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]/60 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Target Branch / Ref (defaults to default branch)
                </label>
                <input
                  type="text"
                  placeholder={repository?.defaultBranch || 'main'}
                  value={targetRef}
                  onChange={(e) => setTargetRef(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] font-mono text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                  Target Commit SHA (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 97640de..."
                  value={targetSha}
                  onChange={(e) => setTargetSha(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] font-mono text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {/* Latest Snapshot Summary Card */}
      {latestSnapshot && (
        <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Latest Repository Snapshot</span>
            </h2>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              Parser: {latestSnapshot.parserVersion}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
              <div className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-500" />
                <span>Indexed Files</span>
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)] font-mono">
                {latestSnapshot.fileCount.toLocaleString()}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
              <div className="text-[11px] text-[var(--text-muted)] mb-1 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-indigo-500" />
                <span>Extracted Size</span>
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)] font-mono">
                {(latestSnapshot.sourceBytes / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
              <div className="text-[11px] text-[var(--text-muted)] mb-1">Commit SHA</div>
              <div className="text-xs font-bold text-[var(--text-primary)] font-mono truncate">
                {latestSnapshot.commitSha.slice(0, 10)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
              <div className="text-[11px] text-[var(--text-muted)] mb-1">Ingested At</div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {new Date(latestSnapshot.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ingestion History Table */}
      <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Ingestion Pipeline History</span>
          </h2>
          <span className="text-xs text-[var(--text-muted)]">
            {ingestions.length} {ingestions.length === 1 ? 'run' : 'runs'} recorded
          </span>
        </div>

        {ingestions.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)]">
            No ingestion runs recorded yet. Click &quot;Ingest Repository&quot; to build the Digital Twin.
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase font-mono text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Ref / Commit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {ingestions.map((run) => (
                  <tr key={run.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {run.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                        {run.targetRef}
                      </span>
                      {run.commitSha && (
                        <span className="block text-[10px] text-[var(--text-muted)] font-mono">
                          {run.commitSha.slice(0, 8)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          run.status === 'SUCCEEDED'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : run.status === 'FAILED'
                              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 animate-pulse'
                        }`}
                      >
                        <span>{run.status}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {run.stage}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                      {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : 'Queued'}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                      {run.completedAt ? new Date(run.completedAt).toLocaleTimeString() : '—'}
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
