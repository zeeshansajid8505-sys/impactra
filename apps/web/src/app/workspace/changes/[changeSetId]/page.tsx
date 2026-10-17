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
  Target,
  Route,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Play,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiGetChangeSet,
  apiListChangedFiles,
  apiListTwinChangeMappings,
  apiListDependencyDeltas,
  apiSyncPullRequest,
  apiGetLatestBlastRadius,
  apiTriggerBlastRadiusAnalysis,
  apiListBlastRadiusFindings,
  apiListBlastRadiusEvidencePaths,
  apiGetLatestReleaseSafetyAssessment,
  apiTriggerReleaseSafetyEvaluation,
  apiListReleaseSafetySignals,
} from '@/lib/api-client';
import {
  ChangeSetDto,
  ChangeRevisionDto,
  ChangedFileDto,
  TwinChangeMappingDto,
  DependencyDeltaDto,
  BlastRadiusAnalysisDto,
  BlastRadiusFindingDto,
  BlastRadiusEvidencePathDto,
  BlastRadiusImpactClass,
  ReleaseSafetyAssessmentDto,
  ReleaseSafetySignalDto,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
} from '@impactra/shared';

type TabKey = 'overview' | 'files' | 'twin' | 'deltas' | 'blast-radius' | 'release-safety';

async function fetchBlastFindingsData(
  organizationId: string,
  changeSetId: string,
  analysisId: string,
  filter?: BlastRadiusImpactClass,
  search?: string,
) {
  return apiListBlastRadiusFindings(organizationId, changeSetId, analysisId, {
    limit: 100,
    impactClass: filter,
    search: search || undefined,
  });
}

async function fetchEvidencePathsData(
  organizationId: string,
  changeSetId: string,
  analysisId: string,
  findingId: string,
) {
  return apiListBlastRadiusEvidencePaths(organizationId, changeSetId, analysisId, {
    findingId,
    limit: 50,
  });
}

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
  const canAnalyzeBlastRadius = canSync;

  const [changeSet, setChangeSet] = useState<ChangeSetDto | null>(null);
  const [changedFiles, setChangedFiles] = useState<ChangedFileDto[]>([]);
  const [twinMappings, setTwinMappings] = useState<TwinChangeMappingDto[]>([]);
  const [dependencyDeltas, setDependencyDeltas] = useState<DependencyDeltaDto[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Blast radius state
  const [blastAnalysis, setBlastAnalysis] = useState<BlastRadiusAnalysisDto | null>(null);
  const [blastFindings, setBlastFindings] = useState<BlastRadiusFindingDto[]>([]);
  const [blastFindingsTotal, setBlastFindingsTotal] = useState<number>(0);
  const [findingFilter, setFindingFilter] = useState<'ALL' | BlastRadiusImpactClass>('ALL');
  const [findingSearch, setFindingSearch] = useState<string>('');
  const [selectedFinding, setSelectedFinding] = useState<BlastRadiusFindingDto | null>(null);
  const [evidencePaths, setEvidencePaths] = useState<BlastRadiusEvidencePathDto[]>([]);
  const [loadingBlast, setLoadingBlast] = useState<boolean>(false);
  const [loadingPaths, setLoadingPaths] = useState<boolean>(false);
  const [triggeringBlast, setTriggeringBlast] = useState<boolean>(false);

  // Release safety state
  const [releaseSafetyAssessment, setReleaseSafetyAssessment] = useState<ReleaseSafetyAssessmentDto | null>(null);
  const [releaseSafetySignals, setReleaseSafetySignals] = useState<ReleaseSafetySignalDto[]>([]);
  const [loadingReleaseSafety, setLoadingReleaseSafety] = useState<boolean>(false);
  const [triggeringReleaseSafety, setTriggeringReleaseSafety] = useState<boolean>(false);

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

        try {
          const blastSummary = await apiGetLatestBlastRadius(organizationId, changeSetId);
          setBlastAnalysis(blastSummary.analysis);
          if (blastSummary.analysis?.status === 'SUCCEEDED') {
            const filter = findingFilter === 'ALL' ? undefined : findingFilter;
            const res = await fetchBlastFindingsData(
              organizationId,
              changeSetId,
              blastSummary.analysis.id,
              filter,
              findingSearch,
            );
            setBlastFindings(res.items);
            setBlastFindingsTotal(res.total);
          }
        } catch {
          // Blast analysis may not be created yet
        }

        try {
          const rsSummary = await apiGetLatestReleaseSafetyAssessment(organizationId, changeSetId);
          setReleaseSafetyAssessment(rsSummary.assessment);
          if (rsSummary.assessment?.id) {
            const sigsRes = await apiListReleaseSafetySignals(
              organizationId,
              rsSummary.assessment.id,
              { limit: 100 },
            );
            setReleaseSafetySignals(sigsRes.items);
          }
        } catch {
          // Release safety assessment may not be created yet
        }
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load change intelligence details: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [organizationId, changeSetId, findingFilter, findingSearch]);

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

          try {
            const blastSummary = await apiGetLatestBlastRadius(organizationId, changeSetId);
            if (!cancelled) {
              setBlastAnalysis(blastSummary.analysis);
              if (blastSummary.analysis?.status === 'SUCCEEDED') {
                const filter = findingFilter === 'ALL' ? undefined : findingFilter;
                const findingsRes = await fetchBlastFindingsData(
                  organizationId,
                  changeSetId,
                  blastSummary.analysis.id,
                  filter,
                  findingSearch,
                );
                if (!cancelled) {
                  setBlastFindings(findingsRes.items);
                  setBlastFindingsTotal(findingsRes.total);
                }
              }
            }
          } catch {
            // Blast analysis may not be created yet
          }

          try {
            const rsSummary = await apiGetLatestReleaseSafetyAssessment(organizationId, changeSetId);
            if (!cancelled) {
              setReleaseSafetyAssessment(rsSummary.assessment);
              if (rsSummary.assessment?.id) {
                const sigsRes = await apiListReleaseSafetySignals(
                  organizationId,
                  rsSummary.assessment.id,
                  { limit: 100 },
                );
                if (!cancelled) {
                  setReleaseSafetySignals(sigsRes.items);
                }
              }
            }
          } catch {
            // Release safety assessment may not be created yet
          }
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
  }, [organizationId, changeSetId, findingFilter, findingSearch]);

  // Safe polling: poll while active revision or blast analysis is in non-terminal state
  const isAnalyzing = useMemo(() => {
    const rev = changeSet?.latestRevision;
    const isRevRunning = rev
      ? ['QUEUED', 'FETCHING', 'WAITING_FOR_SNAPSHOTS', 'ANALYZING', 'MAPPING_TWIN', 'STORING'].includes(
          rev.status,
        )
      : false;
    const isBlastRunning = blastAnalysis
      ? ['QUEUED', 'RUNNING'].includes(blastAnalysis.status)
      : false;
    return isRevRunning || isBlastRunning;
  }, [changeSet, blastAnalysis]);

  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      refreshChangeData();
    }, 4000);
    return () => clearInterval(interval);
  }, [isAnalyzing, refreshChangeData]);

  // Load findings when filter or search changes
  useEffect(() => {
    if (
      !organizationId ||
      !changeSetId ||
      !blastAnalysis?.id ||
      blastAnalysis.status !== 'SUCCEEDED'
    ) {
      return;
    }

    const orgId = organizationId;
    const currentChangeSetId = changeSetId;
    const analysisId = blastAnalysis.id;

    let cancelled = false;

    async function run() {
      try {
        const filter = findingFilter === 'ALL' ? undefined : findingFilter;
        const res = await fetchBlastFindingsData(
          orgId,
          currentChangeSetId,
          analysisId,
          filter,
          findingSearch,
        );
        if (!cancelled) {
          setBlastFindings(res.items);
          setBlastFindingsTotal(res.total);
          setLoadingBlast(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load blast radius findings', err);
          setLoadingBlast(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [organizationId, changeSetId, blastAnalysis?.id, blastAnalysis?.status, findingFilter, findingSearch]);

  // Load paths when a finding is selected
  useEffect(() => {
    if (
      !organizationId ||
      !changeSetId ||
      !blastAnalysis?.id ||
      !selectedFinding?.id
    ) {
      return;
    }

    const orgId = organizationId;
    const currentChangeSetId = changeSetId;
    const analysisId = blastAnalysis.id;
    const findingId = selectedFinding.id;

    let cancelled = false;

    async function run() {
      try {
        const res = await fetchEvidencePathsData(
          orgId,
          currentChangeSetId,
          analysisId,
          findingId,
        );
        if (!cancelled) {
          setEvidencePaths(res.items);
          setLoadingPaths(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to load evidence paths', err);
          setLoadingPaths(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [organizationId, changeSetId, blastAnalysis?.id, selectedFinding?.id]);

  const handleSelectFinding = (finding: BlastRadiusFindingDto | null) => {
    setSelectedFinding(finding);
    if (!finding) {
      setEvidencePaths([]);
      setLoadingPaths(false);
    } else {
      setLoadingPaths(true);
    }
  };

  const handleTriggerBlastRadius = async () => {
    if (!organizationId || !changeSetId) return;
    try {
      setTriggeringBlast(true);
      setError(null);
      await apiTriggerBlastRadiusAnalysis(organizationId, changeSetId, { force: true });
      await refreshChangeData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to trigger blast radius analysis: ${msg}`);
    } finally {
      setTriggeringBlast(false);
    }
  };

  const handleTriggerReleaseSafety = async () => {
    if (!organizationId || !changeSetId) return;
    try {
      setTriggeringReleaseSafety(true);
      setError(null);
      const res = await apiTriggerReleaseSafetyEvaluation(organizationId, changeSetId, { force: true });
      setReleaseSafetyAssessment(res);
      await refreshChangeData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to evaluate release safety: ${msg}`);
    } finally {
      setTriggeringReleaseSafety(false);
    }
  };

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

        <button
          type="button"
          onClick={() => setActiveTab('blast-radius')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'blast-radius'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Target className="w-4 h-4" />
          Blast Radius {blastAnalysis ? `(${blastAnalysis.totalAffectedNodes})` : ''}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('release-safety')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'release-safety'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Release Safety {releaseSafetyAssessment ? `(${releaseSafetyAssessment.decision})` : ''}
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

          {/* Release Safety Overview Card */}
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Release Safety Decision & Policy Score
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('release-safety')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 self-start sm:self-auto"
              >
                Inspect All Signals
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {releaseSafetyAssessment ? (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
                <div className="space-y-1">
                  <div className="text-xs text-[var(--text-muted)] font-medium">Decision</div>
                  <div className="pt-0.5">
                    {releaseSafetyAssessment.decision === 'PASS' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </span>
                    )}
                    {releaseSafetyAssessment.decision === 'REVIEW_REQUIRED' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <AlertTriangle className="w-3.5 h-3.5" /> REVIEW REQUIRED
                      </span>
                    )}
                    {releaseSafetyAssessment.decision === 'BLOCKED' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5" /> BLOCKED
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-[var(--text-muted)] font-medium">Risk Score</div>
                  <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
                    {releaseSafetyAssessment.riskScore}/100{' '}
                    <span className="text-xs font-normal text-[var(--text-muted)] font-sans">
                      ({releaseSafetyAssessment.riskLevel})
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-[var(--text-muted)] font-medium">Evaluated Signals</div>
                  <div className="text-lg font-bold font-mono text-[var(--text-primary)]">
                    {releaseSafetyAssessment.signalCount}{' '}
                    <span className="text-xs font-normal text-[var(--text-muted)] font-sans">
                      ({releaseSafetyAssessment.blockingSignalCount} blocking)
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-[var(--text-muted)] font-medium">Policy Engine</div>
                  <div className="text-xs font-mono text-[var(--text-secondary)] pt-1">
                    {releaseSafetyAssessment.policyVersion}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between py-2 text-xs text-[var(--text-muted)]">
                <span>No release safety evaluation recorded yet.</span>
                {canAnalyzeBlastRadius && (
                  <button
                    type="button"
                    onClick={handleTriggerReleaseSafety}
                    disabled={triggeringReleaseSafety}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                  >
                    {triggeringReleaseSafety ? 'Evaluating...' : 'Evaluate Release Safety'}
                  </button>
                )}
              </div>
            )}
          </div>
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

      {/* 5. BLAST RADIUS ANALYSIS */}
      {activeTab === 'blast-radius' && (
        <div className="space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" />
                <h3 className="font-semibold text-base text-[var(--text-primary)]">
                  Deterministic Blast-Radius Analysis
                </h3>
                {blastAnalysis && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      blastAnalysis.status === 'SUCCEEDED'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : blastAnalysis.status === 'FAILED'
                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                        : blastAnalysis.status === 'RUNNING'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}
                  >
                    {blastAnalysis.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                BFS dependency traversal grounded strictly in digital twin imports and workspace dependencies.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {canAnalyzeBlastRadius && (
                <button
                  type="button"
                  onClick={handleTriggerBlastRadius}
                  disabled={triggeringBlast || isAnalyzing}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${triggeringBlast ? 'animate-spin' : ''}`} />
                  {triggeringBlast ? 'Triggering...' : blastAnalysis ? 'Re-run Analysis' : 'Run Analysis'}
                </button>
              )}
            </div>
          </div>

          {!blastAnalysis ? (
            <div className="p-12 text-center rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <Target className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-40" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">No Blast-Radius Analysis Yet</h4>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Blast radius analysis runs automatically after digital twin mapping completes, or you can trigger it manually.
              </p>
              {canAnalyzeBlastRadius && (
                <button
                  type="button"
                  onClick={handleTriggerBlastRadius}
                  disabled={triggeringBlast}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Analyze Blast Radius Now
                </button>
              )}
            </div>
          ) : blastAnalysis.status === 'RUNNING' || blastAnalysis.status === 'QUEUED' ? (
            <div className="p-12 text-center rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                {blastAnalysis.status === 'QUEUED' ? 'Analysis Queued...' : 'Traversing Dependency Graph...'}
              </h4>
              <p className="text-xs text-[var(--text-muted)]">
                Computing deterministic shortest paths and consumer impact for modified symbols.
              </p>
            </div>
          ) : blastAnalysis.status === 'FAILED' ? (
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Blast Radius Traversal Failed</span>
              </div>
              <p className="text-xs font-mono">{blastAnalysis.failureMessage || 'Unknown error during analysis traversal.'}</p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)]">Affected Nodes</div>
                  <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                    {blastAnalysis.totalAffectedNodes}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">Total impacted</div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)]">First-Order</div>
                  <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                    {blastAnalysis.firstOrderAffectedNodes}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">Direct consumers (depth 1)</div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)]">Transitive</div>
                  <div className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {blastAnalysis.transitiveAffectedNodes}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">Indirect callers (depth 2+)</div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)]">Max Depth</div>
                  <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                    {blastAnalysis.maxDepth}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">Traversed hops</div>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-1">
                  <div className="text-xs font-medium text-[var(--text-muted)]">Roots Analyzed</div>
                  <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                    {blastAnalysis.rootCount}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">Change roots</div>
                </div>
              </div>

              {/* Truncation warning if limits exceeded */}
              {blastAnalysis.truncated && (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Traversal Truncated by Safety Limit</p>
                    <p>Traversal limits were reached; results may be truncated.</p>
                  </div>
                </div>
              )}

              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFindingFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      findingFilter === 'ALL'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    All Findings ({blastFindingsTotal})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFindingFilter('FIRST_ORDER')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      findingFilter === 'FIRST_ORDER'
                        ? 'bg-amber-600 text-white'
                        : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    First-Order ({blastAnalysis.firstOrderAffectedNodes})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFindingFilter('TRANSITIVE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      findingFilter === 'TRANSITIVE'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Transitive ({blastAnalysis.transitiveAffectedNodes})
                  </button>
                </div>

                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    value={findingSearch}
                    onChange={(e) => setFindingSearch(e.target.value)}
                    placeholder="Search node or key..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Findings Table & Evidence Paths Split */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className={selectedFinding ? 'lg:col-span-7' : 'lg:col-span-12'}>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
                    {loadingBlast ? (
                      <div className="p-8 text-center text-sm text-[var(--text-muted)] flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>Loading findings...</span>
                      </div>
                    ) : blastFindings.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                        No blast radius findings matching current filter.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] font-medium text-xs">
                              <th className="py-3 px-4">Impact</th>
                              <th className="py-3 px-4">Affected Node</th>
                              <th className="py-3 px-4">Category</th>
                              <th className="py-3 px-4">Depth</th>
                              <th className="py-3 px-4 text-right">Evidence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {blastFindings.map((finding) => {
                              const isSelected = selectedFinding?.id === finding.id;
                              return (
                                <tr
                                  key={finding.id}
                                  onClick={() => handleSelectFinding(isSelected ? null : finding)}
                                  className={`cursor-pointer transition-colors text-xs ${
                                    isSelected
                                      ? 'bg-indigo-500/10'
                                      : 'hover:bg-[var(--surface-raised)]/60'
                                  }`}
                                >
                                  <td className="py-3 px-4">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                        finding.impactClass === 'FIRST_ORDER'
                                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                                      }`}
                                    >
                                      {finding.impactClass === 'FIRST_ORDER' ? '1st Order' : 'Transitive'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-[var(--text-primary)]">
                                      {finding.nodeName}
                                    </div>
                                    <div className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[280px]">
                                      {finding.stableKey}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-secondary)]">
                                      {finding.category}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-semibold text-[var(--text-primary)]">
                                    {finding.depth}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectFinding(isSelected ? null : finding);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                      <Route className="w-3 h-3 text-indigo-500" />
                                      <span>Paths</span>
                                      {isSelected ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Evidence Paths Panel */}
                {selectedFinding && (
                  <div className="lg:col-span-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">
                          <Route className="w-3.5 h-3.5" />
                          <span>Evidence Paths</span>
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mt-1">
                          {selectedFinding.nodeName}
                        </h4>
                        <div className="font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[320px]">
                          {selectedFinding.stableKey}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectFinding(null)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        Close
                      </button>
                    </div>

                    {loadingPaths ? (
                      <div className="py-8 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                        <span>Loading evidence paths...</span>
                      </div>
                    ) : evidencePaths.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-4">No evidence paths found for this node.</p>
                    ) : (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                        {evidencePaths.map((path, idx) => (
                          <div
                            key={path.id || idx}
                            className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                              <span className="font-semibold uppercase tracking-wide">
                                Path #{idx + 1} ({path.hopCount} {path.hopCount === 1 ? 'hop' : 'hops'})
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-mono">
                                Side: {path.snapshotSide}
                              </span>
                            </div>

                            <div className="space-y-1.5 font-mono text-[11px] pl-2 border-l-2 border-indigo-500/40">
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span className="truncate max-w-[280px]">{path.rootStableKey}</span>
                                <span className="text-[10px] uppercase font-sans text-[var(--text-muted)]">(Root)</span>
                              </div>

                              {path.pathEdges && path.pathEdges.length > 0 ? (
                                path.pathEdges.map((edge, eIdx) => (
                                  <div key={eIdx} className="space-y-1 py-1">
                                    <div className="text-[10px] text-indigo-500 font-sans flex items-center gap-1 pl-3">
                                      <span>↓</span>
                                      <span className="font-semibold">{edge.edgeType}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[var(--text-primary)] pl-3">
                                      <span className="truncate max-w-[280px]">{edge.targetStableKey}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[11px] text-[var(--text-secondary)] pl-3">
                                  Direct impact (1 hop) → <span className="font-semibold">{path.affectedStableKey}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. RELEASE SAFETY */}
      {activeTab === 'release-safety' && (
        <div className="space-y-6">
          {/* Header Controls & Summary */}
          <div className="p-6 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Deterministic Release Safety Gate</span>
                </div>
                <h3 className="text-xl font-bold text-[var(--text-primary)] mt-1">
                  Policy Evaluation & Release Decision
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Explainable safety score derived from graph blast-radius, code churn breadth, and dependency severance.
                </p>
              </div>

              {canAnalyzeBlastRadius && (
                <button
                  type="button"
                  onClick={handleTriggerReleaseSafety}
                  disabled={triggeringReleaseSafety}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50 self-start md:self-auto"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${triggeringReleaseSafety ? 'animate-spin' : ''}`} />
                  {triggeringReleaseSafety ? 'Evaluating Policy...' : 'Re-evaluate Release Safety'}
                </button>
              )}
            </div>

            {/* Assessment Status / Score Card */}
            {releaseSafetyAssessment ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-1">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Release Decision</div>
                    <div className="pt-1">
                      {releaseSafetyAssessment.decision === 'PASS' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="w-4 h-4" /> PASS
                        </span>
                      )}
                      {releaseSafetyAssessment.decision === 'REVIEW_REQUIRED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-4 h-4" /> REVIEW REQUIRED
                        </span>
                      )}
                      {releaseSafetyAssessment.decision === 'BLOCKED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          <ShieldX className="w-4 h-4" /> BLOCKED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-1">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Risk Score & Level</div>
                    <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                      {releaseSafetyAssessment.riskScore}
                      <span className="text-xs font-normal text-[var(--text-muted)] font-sans">/100</span>
                    </div>
                    <div className="text-xs font-medium text-[var(--text-secondary)] font-mono">
                      Level: {releaseSafetyAssessment.riskLevel}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-1">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Rule Signals</div>
                    <div className="text-xl font-bold font-mono text-[var(--text-primary)]">
                      {releaseSafetyAssessment.signalCount}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {releaseSafetyAssessment.blockingSignalCount} blocking · {releaseSafetyAssessment.reviewSignalCount} review
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-1">
                    <div className="text-xs font-medium text-[var(--text-muted)]">Policy Engine</div>
                    <div className="text-xs font-mono text-[var(--text-secondary)] pt-1 truncate">
                      {releaseSafetyAssessment.policyVersion}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Updated: {new Date(releaseSafetyAssessment.updatedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                {/* Progress bar showing score relative to thresholds */}
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                  <div className="flex justify-between items-center text-xs font-medium">
                    <span className="text-[var(--text-muted)]">Safety Policy Spectrum</span>
                    <span className="font-mono text-[var(--text-primary)]">
                      Score: {releaseSafetyAssessment.riskScore} / 100
                    </span>
                  </div>
                  <div className="w-full bg-[var(--surface-raised)] rounded-full h-2.5 overflow-hidden border border-[var(--border)] relative">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        releaseSafetyAssessment.riskScore >= 75
                          ? 'bg-rose-500'
                          : releaseSafetyAssessment.riskScore >= 40
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(5, releaseSafetyAssessment.riskScore))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                    <span>0: Safe (Pass)</span>
                    <span>39: Review Boundary</span>
                    <span>74: Block Boundary</span>
                    <span>100: Critical</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-[var(--text-muted)] space-y-3">
                <ShieldCheck className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
                <p>No Release Safety assessment has been run for this revision yet.</p>
                {canAnalyzeBlastRadius && (
                  <button
                    type="button"
                    onClick={handleTriggerReleaseSafety}
                    disabled={triggeringReleaseSafety}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs"
                  >
                    {triggeringReleaseSafety ? 'Evaluating Policy...' : 'Run Release Safety Evaluation'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Signals Table */}
          {releaseSafetyAssessment && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm space-y-4 p-5">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)]">
                    Contributing Rule Signals ({releaseSafetySignals.length})
                  </h4>
                  <span className="text-xs text-[var(--text-muted)]">
                    Sorted by blocking priority, severity, and score delta
                  </span>
                </div>
              </div>

              {releaseSafetySignals.length === 0 ? (
                <div className="p-8 text-center text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold">Zero Risk Signals Detected</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    This change revision is fully compliant with all release safety policies.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                    <thead className="bg-[var(--surface-raised)] uppercase tracking-wider text-[11px] text-[var(--text-muted)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Rule ID</th>
                        <th className="px-4 py-3 font-semibold">Severity</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Impact</th>
                        <th className="px-4 py-3 font-semibold">Score Δ</th>
                        <th className="px-4 py-3 font-semibold">Description</th>
                        <th className="px-4 py-3 font-semibold">Evidence Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {releaseSafetySignals.map((signal) => (
                        <tr key={signal.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">
                            {signal.ruleId}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                signal.severity === 'CRITICAL'
                                  ? 'bg-rose-500/20 text-rose-500'
                                  : signal.severity === 'HIGH'
                                  ? 'bg-orange-500/20 text-orange-500'
                                  : signal.severity === 'MEDIUM'
                                  ? 'bg-amber-500/20 text-amber-500'
                                  : 'bg-slate-500/20 text-slate-400'
                              }`}
                            >
                              {signal.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px]">
                            {signal.category}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {signal.blocking && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold text-[10px]">
                                  BLOCKING
                                </span>
                              )}
                              {signal.requiresReview && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold text-[10px]">
                                  REVIEW
                                </span>
                              )}
                              {!signal.blocking && !signal.requiresReview && (
                                <span className="text-[var(--text-muted)] text-[11px]">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-[var(--text-primary)]">
                            +{signal.scoreDelta}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[var(--text-primary)]">
                              {signal.title}
                            </div>
                            <div className="text-[var(--text-muted)] mt-0.5 max-w-sm truncate">
                              {signal.description}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)] truncate max-w-[200px]">
                            {signal.evidenceStableKey || signal.evidenceReferenceId || signal.evidenceType}
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
      )}
    </div>
  );
}
