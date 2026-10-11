'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  GitFork,
  ExternalLink,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Unlink,
  Lock,
  Globe,
  Radio,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiGetGitHubConfigStatus,
  apiStartGitHubInstallation,
  apiGetGitHubInstallation,
  apiDisconnectGitHubInstallation,
  apiSyncRepositories,
  apiListRepositories,
  apiConnectRepository,
  apiDisconnectRepository,
} from '@/lib/api-client';
import {
  GitHubConfigStatus,
  GitHubInstallationDto,
  RepositoryConnectionDto,
} from '@impactra/shared';

function RepositoriesContent() {
  const searchParams = useSearchParams();
  const { user, activeOrg, isLoading: authLoading } = useAuth();
  const activeOrgId = activeOrg?.organization?.id;

  const [configStatus, setConfigStatus] = useState<GitHubConfigStatus | null>(null);
  const [installation, setInstallation] = useState<GitHubInstallationDto | null>(null);
  const installationId = installation?.githubInstallationId;
  const installationStatus = installation?.status;

  const [loadedInstallationOrgId, setLoadedInstallationOrgId] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryConnectionDto[]>([]);
  const [totalRepos, setTotalRepos] = useState<number>(0);
  const [loadedReposOrgId, setLoadedReposOrgId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [disconnectingApp, setDisconnectingApp] = useState<boolean>(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterState, setFilterState] = useState<'all' | 'connected' | 'unconnected'>('all');
  const [page, setPage] = useState<number>(1);
  const limit = 20;

  // Feedback notifications: Action-triggered feedback (sync, connect, disconnect, errors)
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // User dismissal flag for URL callback feedback
  const [callbackDismissed, setCallbackDismissed] = useState<boolean>(false);

  // RBAC permissions checks (OWNER and ADMIN only for Phase 04)
  const userRole = activeOrg?.membership.role;
  const canManageInstallations = Boolean(userRole && ['OWNER', 'ADMIN'].includes(userRole));
  const canManageRepositories = Boolean(userRole && ['OWNER', 'ADMIN'].includes(userRole));

  // Derive callback feedback directly from URL search parameters without setState in effect
  const callbackFeedback = useMemo<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(() => {
    if (callbackDismissed) return null;

    const installStatus = searchParams.get('installation');
    const installed = searchParams.get('installed');
    const message = searchParams.get('message');

    if (installStatus === 'success' || installed === 'true') {
      return {
        type: 'success',
        message: 'GitHub App installation was successfully connected to your organization!',
      };
    }

    if (installStatus === 'error') {
      return {
        type: 'error',
        message: message ? decodeURIComponent(message) : 'Failed to connect GitHub App installation.',
      };
    }

    return null;
  }, [searchParams, callbackDismissed]);

  // Combined active feedback banner: user action feedback takes precedence over URL callback feedback
  const feedback = actionFeedback ?? callbackFeedback;

  const handleDismissFeedback = () => {
    setActionFeedback(null);
    setCallbackDismissed(true);
  };

  // Clean URL callback search parameters in history once loaded without setting state
  useEffect(() => {
    const installStatus = searchParams.get('installation');
    const installed = searchParams.get('installed');
    if (installStatus || installed) {
      if (typeof window !== 'undefined') {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, [searchParams]);

  // Derive installation loading state from current organization identity
  const isInstallationLoading = Boolean(
    activeOrgId && loadedInstallationOrgId !== activeOrgId,
  );

  // Fetch GitHub configuration status & installation for active organization
  useEffect(() => {
    if (!activeOrgId) return;

    let cancelled = false;

    Promise.all([
      apiGetGitHubConfigStatus().catch(() => null),
      apiGetGitHubInstallation(activeOrgId).catch(() => null),
    ])
      .then(([cfg, inst]) => {
        if (cancelled) return;
        setConfigStatus(cfg);
        setInstallation(inst);
        setLoadedInstallationOrgId(activeOrgId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Error checking GitHub integration status.';
        setActionFeedback({ type: 'error', message: msg });
        setLoadedInstallationOrgId(activeOrgId);
      });

    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  // Derive repository loading availability and visible slices
  const canLoadRepositories = Boolean(
    activeOrgId &&
    installationId &&
    installationStatus &&
    installationStatus !== 'DISCONNECTED',
  );

  const visibleRepositories =
    canLoadRepositories && loadedReposOrgId === activeOrgId ? repositories : [];
  const visibleTotalRepos =
    canLoadRepositories && loadedReposOrgId === activeOrgId ? totalRepos : 0;

  // Load repositories helper for imperative user actions (e.g. sync)
  const loadRepositories = useCallback(
    async (
      orgId: string,
      pageNum: number,
      search: string,
      filter: 'all' | 'connected' | 'unconnected',
    ) => {
      try {
        const connectedParam =
          filter === 'connected' ? true : filter === 'unconnected' ? false : undefined;
        const res = await apiListRepositories(orgId, {
          page: pageNum,
          limit,
          search: search.trim() || undefined,
          connected: connectedParam,
        });
        setRepositories(res.repositories);
        setTotalRepos(res.total);
        setLoadedReposOrgId(orgId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load repositories.';
        setActionFeedback({ type: 'error', message: msg });
      }
    },
    [limit],
  );

  // Fetch repositories asynchronously when organization, installation, search, filter, or pagination changes
  useEffect(() => {
    if (!activeOrgId || !installationId || !installationStatus || installationStatus === 'DISCONNECTED') {
      return;
    }

    let cancelled = false;
    const connectedParam =
      filterState === 'connected' ? true : filterState === 'unconnected' ? false : undefined;

    const timer = setTimeout(() => {
      apiListRepositories(activeOrgId, {
        page,
        limit,
        search: searchTerm.trim() || undefined,
        connected: connectedParam,
      })
        .then((res) => {
          if (cancelled) return;
          setRepositories(res.repositories);
          setTotalRepos(res.total);
          setLoadedReposOrgId(activeOrgId);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'Failed to load repositories.';
          setActionFeedback({ type: 'error', message: msg });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    activeOrgId,
    installationId,
    installationStatus,
    page,
    searchTerm,
    filterState,
    limit,
  ]);

  // Handler: Start GitHub Installation
  const handleStartInstallation = async () => {
    if (!activeOrg) return;
    setActionFeedback(null);
    setCallbackDismissed(true);
    try {
      const res = await apiStartGitHubInstallation(activeOrg.organization.id);
      if (res.installUrl) {
        window.location.href = res.installUrl;
      } else {
        setActionFeedback({
          type: 'error',
          message: 'Unable to start installation: No installation URL returned by server.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initiate GitHub App installation.';
      setActionFeedback({ type: 'error', message: msg });
    }
  };

  // Handler: Sync Repositories
  const handleSyncRepositories = async () => {
    if (!activeOrg) return;
    setSyncing(true);
    setActionFeedback(null);
    setCallbackDismissed(true);
    try {
      const res = await apiSyncRepositories(activeOrg.organization.id);
      setActionFeedback({
        type: 'success',
        message: `Sync complete: ${res.syncedCount} repositories discovered (${res.availableCount} available, ${res.removedCount} marked unavailable).`,
      });
      await loadRepositories(activeOrg.organization.id, 1, searchTerm, filterState);
      setPage(1);
      // Refresh installation metadata (updates lastSyncedAt)
      const updatedInst = await apiGetGitHubInstallation(activeOrg.organization.id);
      setInstallation(updatedInst);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to synchronize repositories.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setSyncing(false);
    }
  };

  // Handler: Connect Repository
  const handleConnect = async (repoId: string, repoName: string) => {
    if (!activeOrg) return;
    setActionLoading((prev) => ({ ...prev, [repoId]: true }));
    setActionFeedback(null);
    setCallbackDismissed(true);
    try {
      const updated = await apiConnectRepository(activeOrg.organization.id, repoId);
      setRepositories((prev) =>
        prev.map((r) => (r.id === repoId ? { ...r, ...updated } : r)),
      );
      setActionFeedback({
        type: 'success',
        message: `Connected "${repoName}" for change intelligence and release safety.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to connect repository ${repoName}.`;
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading((prev) => ({ ...prev, [repoId]: false }));
    }
  };

  // Handler: Disconnect Repository
  const handleDisconnect = async (repoId: string, repoName: string) => {
    if (!activeOrg) return;
    setActionLoading((prev) => ({ ...prev, [repoId]: true }));
    setActionFeedback(null);
    setCallbackDismissed(true);
    try {
      const updated = await apiDisconnectRepository(activeOrg.organization.id, repoId);
      setRepositories((prev) =>
        prev.map((r) => (r.id === repoId ? { ...r, ...updated } : r)),
      );
      setActionFeedback({
        type: 'info',
        message: `Disconnected "${repoName}". Historical records remain preserved.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to disconnect repository ${repoName}.`;
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading((prev) => ({ ...prev, [repoId]: false }));
    }
  };

  // Handler: Disconnect GitHub App
  const handleDisconnectApp = async () => {
    if (!activeOrg) return;
    const confirmed = window.confirm(
      'Are you sure you want to disconnect this GitHub App installation? All onboarded repositories will be marked as unavailable and disconnected.',
    );
    if (!confirmed) return;

    setDisconnectingApp(true);
    setActionFeedback(null);
    setCallbackDismissed(true);
    try {
      await apiDisconnectGitHubInstallation(activeOrg.organization.id);
      setInstallation(null);
      setRepositories([]);
      setTotalRepos(0);
      setLoadedReposOrgId(null);
      setPage(1);
      setActionFeedback({
        type: 'info',
        message: 'GitHub App installation was disconnected from this organization.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect GitHub App.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setDisconnectingApp(false);
    }
  };

  // Compute stat counts and pagination using derived visible values
  const connectedCount = visibleRepositories.filter((r) => r.connected).length;
  const availableCount = visibleRepositories.filter((r) => r.available).length;
  const totalPages = Math.max(1, Math.ceil(visibleTotalRepos / limit));

  if (authLoading || isInstallationLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
        <p className="text-xs text-[var(--text-muted)] font-mono">Loading repositories...</p>
      </div>
    );
  }

  if (!user || !activeOrg) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Organization Required</h2>
        <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
          Please select or create an organization to manage GitHub repositories.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
        >
          <span>Go to Onboarding</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] mb-1">
            <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">
              Workspace
            </Link>
            <span>/</span>
            <span className="text-[var(--text-primary)]">Repositories</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <GitFork className="w-6 h-6 text-indigo-500" />
            <span>Connected Repositories</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Manage GitHub App connection and onboard repositories for AI change intelligence and release safety.
          </p>
        </div>

        {/* Global actions if installation is active */}
        {installation && installation.status !== 'DISCONNECTED' && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSyncRepositories}
              disabled={syncing || !canManageRepositories}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-500' : ''}`} />
              <span>{syncing ? 'Syncing...' : 'Sync Repositories'}</span>
            </button>

            {canManageInstallations && (
              <button
                type="button"
                onClick={handleDisconnectApp}
                disabled={disconnectingApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect App</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Notifications Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
            feedback.type === 'success'
              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : feedback.type === 'error'
                ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                : 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <Radio className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={handleDismissFeedback}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* State B: GitHub App Not Configured in Environment */}
      {configStatus && !configStatus.configured && (
        <div className="p-6 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/60 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                GitHub App Integration Not Configured
              </h3>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 mt-1 leading-relaxed">
                Impactra requires GitHub App credentials to connect repositories and receive webhook change notifications.
                The API is currently running in local development mode without configured GitHub credentials.
              </p>
              <div className="mt-3 p-3 rounded-md bg-amber-100/60 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[11px] font-mono text-amber-900 dark:text-amber-200 space-y-1">
                <div>Missing configurations:</div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {!configStatus.appIdConfigured && <li>GITHUB_APP_ID</li>}
                  {!configStatus.slugConfigured && <li>GITHUB_APP_SLUG</li>}
                  {!configStatus.privateKeyConfigured && <li>GITHUB_APP_PRIVATE_KEY_BASE64</li>}
                  {!configStatus.webhookSecretConfigured && <li>GITHUB_WEBHOOK_SECRET (optional but recommended)</li>}
                </ul>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                Consult <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded">docs/GITHUB_APP_SETUP.md</code> for instructions on creating and configuring your GitHub App.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* State C: GitHub App Configured, but Not Installed for this Organization */}
      {configStatus?.configured && (!installation || installation.status === 'DISCONNECTED') && (
        <div className="p-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-center space-y-5 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
            <GitFork className="w-7 h-7" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Connect GitHub Organization
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Install the Impactra GitHub App on your GitHub account or organization to synchronize repository metadata
              and enable change intelligence.
            </p>
          </div>

          <div className="max-w-lg mx-auto p-4 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-left space-y-2">
            <div className="text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-500" />
              <span>Phase 04 Metadata Boundary</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Impactra only queries repository metadata and webhook event triggers. Source code cloning, arbitrary AST execution,
              and code modification are strictly prohibited.
            </p>
          </div>

          <div>
            {canManageInstallations ? (
              <button
                type="button"
                onClick={handleStartInstallation}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <span>Install Impactra GitHub App</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="text-xs text-[var(--text-muted)] italic">
                Only organization Owners and Admins have permission to connect GitHub App installations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* State D & E: GitHub App Installed */}
      {installation && installation.status !== 'DISCONNECTED' && (
        <div className="space-y-6">
          {/* Active Installation Status Card */}
          <div className="p-4 sm:p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                {installation.accountLogin.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {installation.accountLogin}
                  </h3>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-medium">
                    {installation.status}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    ID: {installation.githubInstallationId}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-0.5">
                  <span>Type: {installation.accountType}</span>
                  <span>•</span>
                  <span>Access: {installation.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories'}</span>
                  {installation.lastSyncedAt && (
                    <>
                      <span>•</span>
                      <span>Last synced: {new Date(installation.lastSyncedAt).toLocaleString()}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="text-right">
                <div className="text-[10px] text-[var(--text-muted)] uppercase">Organization Role</div>
                <div className="font-semibold text-[var(--text-primary)]">{userRole}</div>
              </div>
            </div>
          </div>

          {/* Statistics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Total Discovered</span>
                <Layers className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-bold text-[var(--text-primary)] mt-1">{visibleTotalRepos}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Synchronized from GitHub</div>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Active Connected</span>
                <Radio className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {connectedCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Onboarded for change analysis</div>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Available in App</span>
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {availableCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Accessible in GitHub installation</div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search repositories by name or owner..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setFilterState('all');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filterState === 'all'
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                All ({visibleTotalRepos})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterState('connected');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filterState === 'connected'
                    ? 'bg-[var(--surface)] text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Connected
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterState('unconnected');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filterState === 'unconnected'
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Not Connected
              </button>
            </div>
          </div>

          {/* Repositories Table */}
          {visibleRepositories.length === 0 ? (
            <div className="p-12 text-center rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
              <GitFork className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              {visibleTotalRepos === 0 ? (
                <>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    No repositories synchronized yet
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                    Click &quot;Sync Repositories&quot; above to fetch all accessible repositories from your GitHub App installation.
                  </p>
                  <button
                    type="button"
                    onClick={handleSyncRepositories}
                    disabled={syncing || !canManageRepositories}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    <span>Sync Now</span>
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    No matching repositories found
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Try adjusting your search query or filter criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterState('all');
                      setPage(1);
                    }}
                    className="text-xs text-indigo-500 hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase font-mono text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Repository</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Visibility</th>
                      <th className="px-4 py-3">GitHub State</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleRepositories.map((repo) => {
                      const isConnecting = actionLoading[repo.id];

                      return (
                        <tr
                          key={repo.id}
                          className="hover:bg-[var(--surface-raised)]/60 transition-colors"
                        >
                          {/* Repo Name */}
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                              <Link
                                href={`/workspace/repositories/${repo.id}`}
                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
                              >
                                {repo.fullName}
                              </Link>
                              <a
                                href={repo.htmlUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--text-muted)] hover:text-indigo-500 transition-colors inline-flex items-center"
                                aria-label={`Open ${repo.fullName} on GitHub`}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-[11px] text-[var(--text-muted)] font-mono">
                              ID: {repo.githubRepositoryId}
                            </div>
                          </td>

                          {/* Default Branch */}
                          <td className="px-4 py-3.5">
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)]">
                              {repo.defaultBranch}
                            </span>
                          </td>

                          {/* Visibility */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                              {repo.isPrivate ? (
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
                          </td>

                          {/* GitHub Availability */}
                          <td className="px-4 py-3.5">
                            {repo.available ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Available</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>Access Unavailable</span>
                              </span>
                            )}
                          </td>

                          {/* Impactra Connection Status */}
                          <td className="px-4 py-3.5">
                            {repo.connected && repo.available ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
                                <Radio className="w-2.5 h-2.5 text-emerald-500" />
                                <span>Connected</span>
                              </span>
                            ) : repo.connected && !repo.available ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                                title="Repository remains onboarded in Impactra but GitHub access is temporarily or permanently unavailable"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                                <span>Connected — GitHub access unavailable</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-muted)]">
                                <span>Not Connected</span>
                              </span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="px-4 py-3.5 text-right">
                            {repo.connected ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Link
                                  href={`/workspace/repositories/${repo.id}/digital-twin`}
                                  className="px-2 py-1 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors inline-flex items-center gap-1 shadow-xs"
                                  title="Open Software Digital Twin"
                                >
                                  <Layers className="w-3 h-3" />
                                  <span>Twin</span>
                                </Link>
                                <Link
                                  href={`/workspace/repositories/${repo.id}`}
                                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
                                >
                                  Details
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => handleDisconnect(repo.id, repo.fullName)}
                                  disabled={isConnecting || !canManageRepositories}
                                  className="px-2 py-1 rounded-md text-[11px] font-medium border border-red-200 dark:border-red-900/60 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  {isConnecting ? 'Disconnecting...' : 'Disconnect'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConnect(repo.id, repo.fullName)}
                                disabled={isConnecting || !repo.available || !canManageRepositories}
                                title={
                                  !repo.available
                                    ? 'Repository is no longer available in GitHub installation'
                                    : !canManageRepositories
                                      ? 'You do not have repository management permissions'
                                      : 'Connect repository for change intelligence'
                                }
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                  !repo.available
                                    ? 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                                } disabled:opacity-50`}
                              >
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-raised)]/40 text-xs">
                  <div className="text-[var(--text-muted)] font-mono">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, visibleTotalRepos)} of {visibleTotalRepos} repositories
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-[var(--text-secondary)]">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RepositoriesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-xs text-[var(--text-muted)] font-mono">Loading repositories workspace...</p>
        </div>
      }
    >
      <RepositoriesContent />
    </Suspense>
  );
}
