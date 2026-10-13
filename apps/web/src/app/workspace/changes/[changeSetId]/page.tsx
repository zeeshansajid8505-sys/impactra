'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import Link from 'next/link';
import {
  GitPullRequest,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  GitBranch,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Network,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiGetChangeSet,
  apiListChangedFiles,
  apiListTwinChangeMappings,
  apiListDependencyDeltas,
  apiSyncPullRequest,
} from '@/lib/api-client';
import {
  ChangeSetDto,
  ChangeRevisionDto,
  ChangedFileDto,
  TwinChangeMappingDto,
  DependencyDeltaDto,
} from '@impactra/shared';

type TabKey = 'overview' | 'files' | 'twin' | 'deltas';

export default function ChangeDetailPage({
  params,
}: {
  params: Promise<{ changeSetId: string }>;
}) {
  const resolvedParams = use(params);
  const changeSetId = resolvedParams.changeSetId;

  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;
  const userRole = activeOrg?.membership.role;
  const canSync = Boolean(
    userRole && ['OWNER', 'ADMIN', 'ARCHITECT', 'DEVELOPER', 'RELEASE_MANAGER'].includes(userRole),
  );

  const [changeSet, setChangeSet] = useState<ChangeSetDto | null>(null);
  const [changedFiles, setChangedFiles] = useState<ChangedFileDto[]>([]);
  const [twinMappings, setTwinMappings] = useState<TwinChangeMappingDto[]>([]);
  const [dependencyDeltas, setDependencyDeltas] = useState<DependencyDeltaDto[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshChangeData = useCallback(async () => {
    if (!organizationId || !changeSetId) return;
    try {
      const cs = await apiGetChangeSet(organizationId, changeSetId);
      setChangeSet(cs);

      const rev = cs.latestRevision;
      if (rev) {
        const [filesRes, twinRes, deltasRes] = await Promise.all([
          apiListChangedFiles(organizationId, changeSetId, rev.id, { limit: 100 }),
          apiListTwinChangeMappings(organizationId, changeSetId, rev.id, { limit: 100 }),
          apiListDependencyDeltas(organizationId, changeSetId, rev.id, { limit: 100 }),
        ]);
        setChangedFiles(filesRes.items);
        setTwinMappings(twinRes.items);
        setDependencyDeltas(deltasRes.items);
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load change intelligence details: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [organizationId, changeSetId]);

  useEffect(() => {
    if (!organizationId || !changeSetId) return;
    let cancelled = false;

    apiGetChangeSet(organizationId, changeSetId)
      .then(async (cs) => {
        if (cancelled) return;
        setChangeSet(cs);

        const rev = cs.latestRevision;
        if (rev) {
          const [filesRes, twinRes, deltasRes] = await Promise.all([
            apiListChangedFiles(organizationId, changeSetId, rev.id, { limit: 100 }),
            apiListTwinChangeMappings(organizationId, changeSetId, rev.id, { limit: 100 }),
            apiListDependencyDeltas(organizationId, changeSetId, rev.id, { limit: 100 }),
          ]);
          if (cancelled) return;
          setChangedFiles(filesRes.items);
          setTwinMappings(twinRes.items);
          setDependencyDeltas(deltasRes.items);
        }
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load change intelligence details: ${msg}`);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, changeSetId]);

  // Safe polling: poll while active revision is in non-terminal state
  const isAnalyzing = useMemo(() => {
    const rev = changeSet?.latestRevision;
    if (!rev) return false;
    return ['QUEUED', 'FETCHING', 'WAITING_FOR_SNAPSHOTS', 'ANALYZING', 'MAPPING_TWIN', 'STORING'].includes(
      rev.status,
    );
  }, [changeSet]);

  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      refreshChangeData();
    }, 4000);
    return () => clearInterval(interval);
  }, [isAnalyzing, refreshChangeData]);

  const handleSync = async () => {
    if (!organizationId || !changeSet) return;
    try {
      setSyncing(true);
      setError(null);
      await apiSyncPullRequest(
        organizationId,
        changeSet.repositoryConnectionId,
        changeSet.pullRequestNumber,
      );
      await refreshChangeData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Sync failed: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        <p className="text-sm">Loading change analysis...</p>
      </div>
    );
  }

  if (!changeSet) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-red-500">{error || 'Change set not found.'}</p>
        <Link
          href="/workspace/changes"
          className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Pull Requests
        </Link>
      </div>
    );
  }

  const rev = changeSet.latestRevision;
  const isMerged = changeSet.isMerged || changeSet.state === 'merged';
  const isClosed = changeSet.state === 'closed' && !isMerged;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link
          href="/workspace/changes"
          className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Pull Requests
        </Link>
        <span>/</span>
        <span className="text-[var(--text-secondary)] font-medium">
          {changeSet.repository?.fullName || 'Repository'} #{changeSet.pullRequestNumber}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              {changeSet.title}
            </h1>
            <span className="text-xl font-mono text-[var(--text-muted)]">
              #{changeSet.pullRequestNumber}
            </span>

            {isMerged ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Merged
              </span>
            ) : isClosed ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-500 border border-gray-500/20">
                Closed
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Open
              </span>
            )}

            {rev && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  rev.status === 'SUCCEEDED'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : rev.status === 'FAILED'
                    ? 'bg-red-500/10 text-red-500 border-red-500/20'
                    : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                }`}
              >
                {rev.status === 'SUCCEEDED'
                  ? 'Digital Twin Mapped'
                  : rev.status === 'FAILED'
                  ? 'Analysis Failed'
                  : `Analyzing: ${rev.stage}`}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
            <div className="flex items-center gap-1.5 font-mono">
              <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                {changeSet.headRef}
              </span>
              <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)]">
                {changeSet.baseRef}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>{changeSet.authorLogin}</span>
            </div>

            {changeSet.repository && (
              <Link
                href={`/workspace/repositories/${changeSet.repository.id}`}
                className="hover:underline text-indigo-600 dark:text-indigo-400"
              >
                {changeSet.repository.fullName}
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canSync && (
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || isAnalyzing}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing || isAnalyzing ? 'animate-spin' : ''}`} />
              {syncing ? 'Triggering...' : isAnalyzing ? 'Analyzing...' : 'Re-sync Change'}
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tab Controls */}
      <div className="flex border-b border-[var(--border)] gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'files'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileCode className="w-4 h-4" />
          Changed Files ({changedFiles.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('twin')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'twin'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Network className="w-4 h-4" />
          Digital Twin Mapping ({twinMappings.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deltas')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'deltas'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <GitPullRequest className="w-4 h-4" />
          Dependency Deltas ({dependencyDeltas.length})
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Commit SHAs & Analysis Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Commit Range & Snapshots
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Base SHA:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {changeSet.currentBaseSha.slice(0, 10)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Head SHA:</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {changeSet.currentHeadSha.slice(0, 10)}
                  </span>
                </div>
                {rev && (
                  <>
                    <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                      <span className="text-[var(--text-muted)]">Base Snapshot ID:</span>
                      <span className="text-[var(--text-secondary)] truncate max-w-[200px]">
                        {rev.baseSnapshotId || 'Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1">
                      <span className="text-[var(--text-muted)]">Head Snapshot ID:</span>
                      <span className="text-[var(--text-secondary)] truncate max-w-[200px]">
                        {rev.headSnapshotId || 'Pending'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Revision Execution Details
              </h3>
              {rev ? (
                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Analysis Version:</span>
                    <span className="font-semibold text-[var(--text-primary)]">{rev.analysisVersion}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Pipeline Stage:</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{rev.stage}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-[var(--border)]">
                    <span className="text-[var(--text-muted)]">Queued At:</span>
                    <span className="text-[var(--text-secondary)]">{new Date(rev.queuedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-[var(--text-muted)]">Completed At:</span>
                    <span className="text-[var(--text-secondary)]">
                      {rev.completedAt ? new Date(rev.completedAt).toLocaleTimeString() : 'In Progress'}
                    </span>
                  </div>
                  {rev.failureMessage && (
                    <div className="p-2 rounded bg-red-500/10 text-red-500 text-xs font-sans mt-2">
                      {rev.failureMessage}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">No revision queued yet.</p>
              )}
            </div>
          </div>

          {/* Impact Intelligence Counters */}
          {rev && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                <div className="text-xs font-medium text-[var(--text-muted)]">Files Changed</div>
                <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                  {rev.filesAdded + rev.filesModified + rev.filesDeleted + rev.filesRenamed}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                  +{rev.filesAdded} ~{rev.filesModified} -{rev.filesDeleted}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                <div className="text-xs font-medium text-[var(--text-muted)]">Nodes Added</div>
                <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  +{rev.nodesAdded}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Twin graph additions</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                <div className="text-xs font-medium text-[var(--text-muted)]">Nodes Modified</div>
                <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  ~{rev.nodesModified}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Twin graph edits</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                <div className="text-xs font-medium text-[var(--text-muted)]">Nodes Removed</div>
                <div className="text-xl font-bold font-mono text-red-500">
                  -{rev.nodesRemoved}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">Twin graph deletions</div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                <div className="text-xs font-medium text-[var(--text-muted)]">Edge Deltas</div>
                <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {rev.edgesAdded + rev.edgesRemoved}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                  +{rev.edgesAdded} -{rev.edgesRemoved}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. CHANGED FILES */}
      {activeTab === 'files' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          {changedFiles.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No changed files recorded for this revision.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                    <th className="py-3 px-4">File Path</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Additions</th>
                    <th className="py-3 px-4">Deletions</th>
                    <th className="py-3 px-4">Net Changes</th>
                    <th className="py-3 px-4">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {changedFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-[var(--surface-raised)]/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-primary)]">
                        {file.status === 'RENAMED' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text-muted)]">{file.oldPath}</span>
                            <ArrowRight className="w-3 h-3 text-[var(--text-muted)]" />
                            <span className="font-semibold">{file.newPath}</span>
                          </div>
                        ) : (
                          <span>{file.newPath || file.oldPath}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            file.status === 'ADDED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : file.status === 'DELETED'
                              ? 'bg-red-500/10 text-red-500'
                              : file.status === 'RENAMED'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {file.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        +{file.additions}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-red-500">
                        -{file.deletions}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">
                        {file.changes}
                      </td>
                      <td className="py-3 px-4 flex items-center gap-1.5">
                        {file.patchAvailable && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            patch
                          </span>
                        )}
                        {file.patchTruncated && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            truncated
                          </span>
                        )}
                        {file.binary && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-500/10 text-gray-500 border border-gray-500/20">
                            binary
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. DIGITAL TWIN MAPPING */}
      {activeTab === 'twin' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          {twinMappings.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No digital twin mappings generated yet for this revision.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                    <th className="py-3 px-4">Target Path</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4">Mapping Type</th>
                    <th className="py-3 px-4">Twin Node Stable Key</th>
                    <th className="py-3 px-4">Digital Twin Node ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {twinMappings.map((mapItem) => (
                    <tr key={mapItem.id} className="hover:bg-[var(--surface-raised)]/60 transition-colors font-mono text-xs">
                      <td className="py-3 px-4 text-[var(--text-primary)] font-sans">
                        {mapItem.path}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            mapItem.side === 'BEFORE'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {mapItem.side}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans text-xs">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            mapItem.mappingType === 'EXACT_PATH'
                              ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                              : mapItem.mappingType === 'RENAMED_PATH'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : 'bg-gray-500/10 text-gray-400'
                          }`}
                        >
                          {mapItem.mappingType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {mapItem.nodeStableKey || '—'}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-muted)] truncate max-w-[150px]">
                        {mapItem.digitalTwinNodeId || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. DEPENDENCY DELTAS */}
      {activeTab === 'deltas' && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          {dependencyDeltas.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-muted)]">
              No graph dependency deltas detected (no direct edges added or removed).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                    <th className="py-3 px-4">Delta Type</th>
                    <th className="py-3 px-4">Source Stable Key</th>
                    <th className="py-3 px-4">Edge Type</th>
                    <th className="py-3 px-4">Target Stable Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {dependencyDeltas.map((delta) => (
                    <tr key={delta.id} className="hover:bg-[var(--surface-raised)]/60 transition-colors font-mono text-xs">
                      <td className="py-3 px-4 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            delta.deltaType === 'EDGE_ADDED'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-red-500/10 text-red-500'
                          }`}
                        >
                          {delta.deltaType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)] font-semibold">
                        {delta.sourceStableKey}
                      </td>
                      <td className="py-3 px-4 text-indigo-600 dark:text-indigo-400 font-semibold">
                        {delta.edgeType}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">
                        {delta.targetStableKey}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
