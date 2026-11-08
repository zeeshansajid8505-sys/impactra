'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileText,
  Plus,
  Play,
  Archive,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  History,
  Layers,
  GitBranch,
  GitFork,
  ArrowRight,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  Check,
  ChevronDown,
  Info,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiListReleasePolicies,
  apiGetReleasePolicy,
  apiCreateReleasePolicy,
  apiUpdateReleasePolicy,
  apiActivateReleasePolicy,
  apiArchiveReleasePolicy,
  apiPreviewReleasePolicy,
  apiGetEffectiveReleasePolicy,
  apiListRepositories,
  apiListChangeSets,
} from '@/lib/api-client';
import {
  ReleasePolicyDto,
  ReleasePolicyRuleDto,
  ReleasePolicyEventDto,
  ReleasePolicyPreviewDto,
  EffectiveReleasePolicyDto,
  ReleasePolicyStatus,
  ReleasePolicyRuleType,
  ReleasePolicyAction,
  ReleasePolicyScope,
  CreateReleasePolicyRequest,
  CreateReleasePolicyRuleInput,
  RepositoryConnectionDto,
  ChangeSetDto,
} from '@impactra/shared';

export default function ReleasePoliciesPage() {
  const { user, activeOrg, isLoading: authLoading } = useAuth();
  const organizationId = activeOrg?.organization?.id;
  const userRole = activeOrg?.membership.role;

  // RBAC permissions based on Phase 11 permissions policy
  const canCreate = Boolean(userRole && ['OWNER', 'ADMIN', 'ARCHITECT', 'RELEASE_MANAGER'].includes(userRole));
  const canUpdate = Boolean(userRole && ['OWNER', 'ADMIN', 'ARCHITECT', 'RELEASE_MANAGER'].includes(userRole));
  const canActivate = Boolean(userRole && ['OWNER', 'ADMIN', 'RELEASE_MANAGER'].includes(userRole));
  const canArchive = Boolean(userRole && ['OWNER', 'ADMIN'].includes(userRole));

  // State
  const [policies, setPolicies] = useState<ReleasePolicyDto[]>([]);
  const [repositories, setRepositories] = useState<RepositoryConnectionDto[]>([]);
  const [changeSets, setChangeSets] = useState<ChangeSetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [repoFilter, setRepoFilter] = useState<string>('ALL');

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ReleasePolicyDto | null>(null);
  const [historyPolicy, setHistoryPolicy] = useState<ReleasePolicyDto | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewResult, setPreviewResult] = useState<ReleasePolicyPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedChangeSetId, setSelectedChangeSetId] = useState<string>('');

  // Effective Policy lookup state
  const [effectiveScope, setEffectiveScope] = useState<EffectiveReleasePolicyDto | null>(null);

  // Form State for Create/Edit
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRepoId, setFormRepoId] = useState<string>('');
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formBranchPattern, setFormBranchPattern] = useState('');
  const [formRules, setFormRules] = useState<CreateReleasePolicyRuleInput[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load Policies & Data
  const loadData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [policiesList, reposList] = await Promise.all([
        apiListReleasePolicies(organizationId),
        apiListRepositories(organizationId).then((r) => r.repositories).catch(() => []),
      ]);
      setPolicies(policiesList);
      setRepositories(reposList);

      // Fetch sample changes for preview dropdown
      const changesRes = await apiListChangeSets(organizationId, { limit: 20 }).catch(() => null);
      if (changesRes && changesRes.items) {
        setChangeSets(changesRes.items);
        if (changesRes.items.length > 0 && !selectedChangeSetId) {
          setSelectedChangeSetId(changesRes.items[0].id);
        }
      }

      // Fetch org-level effective policy
      const effective = await apiGetEffectiveReleasePolicy(organizationId).catch(() => null);
      setEffectiveScope(effective);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load release policies.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedChangeSetId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    Promise.all([
      apiListReleasePolicies(organizationId),
      apiListRepositories(organizationId).then((r) => r.repositories).catch(() => []),
      apiListChangeSets(organizationId, { limit: 20 }).catch(() => null),
      apiGetEffectiveReleasePolicy(organizationId).catch(() => null),
    ])
      .then(([policiesList, reposList, changesRes, effective]) => {
        if (cancelled) return;
        setPolicies(policiesList);
        setRepositories(reposList);
        if (changesRes && changesRes.items) {
          setChangeSets(changesRes.items);
          if (changesRes.items.length > 0) {
            setSelectedChangeSetId(changesRes.items[0].id);
          }
        }
        setEffectiveScope(effective);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load release policies.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // Open Create Form
  const handleOpenCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormRepoId('');
    setFormIsDefault(false);
    setFormBranchPattern('');
    setFormRules([
      {
        ruleKey: 'max_risk_score',
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        thresholdNumeric: 75,
        action: ReleasePolicyAction.BLOCK,
        enabled: true,
      },
      {
        ruleKey: 'critical_signal_block',
        ruleType: ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT,
        action: ReleasePolicyAction.BLOCK,
        enabled: true,
      },
      {
        ruleKey: 'review_required_score',
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        thresholdNumeric: 40,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        enabled: true,
      },
    ]);
    setEditingPolicy(null);
    setShowCreateModal(true);
  };

  // Open Edit Form (DRAFT policies only)
  const handleOpenEdit = (policy: ReleasePolicyDto) => {
    setFormName(policy.name);
    setFormDescription(policy.description || '');
    setFormRepoId(policy.repositoryConnectionId || '');
    setFormIsDefault(policy.isDefault);
    setFormBranchPattern(policy.targetBranchPattern || '');
    setFormRules(
      (policy.rules || []).map((r) => ({
        ruleKey: r.ruleKey,
        ruleType: r.ruleType,
        action: r.action,
        enabled: r.enabled,
        thresholdNumeric: r.thresholdNumeric,
        thresholdText: r.thresholdText,
        configuration: r.configuration,
        order: r.order,
      })),
    );
    setEditingPolicy(policy);
    setShowCreateModal(true);
  };

  // Add rule in form
  const handleAddRule = () => {
    setFormRules((prev) => [
      ...prev,
      {
        ruleKey: `rule_${prev.length + 1}`,
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        thresholdNumeric: 50,
        enabled: true,
      },
    ]);
  };

  // Remove rule from form
  const handleRemoveRule = (idx: number) => {
    setFormRules((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update rule property
  const handleRuleChange = (
    idx: number,
    field: keyof CreateReleasePolicyRuleInput,
    value: string | number | boolean | null,
  ) => {
    setFormRules((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        return { ...r, [field]: value };
      }),
    );
  };

  // Submit Create or Update
  const handleSubmitPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;

    if (!formName.trim()) {
      setError('Policy name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: CreateReleasePolicyRequest = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        repositoryConnectionId: formRepoId || null,
        isDefault: formIsDefault,
        targetBranchPattern: formBranchPattern.trim() || null,
        rules: formRules,
      };

      if (editingPolicy) {
        await apiUpdateReleasePolicy(organizationId, editingPolicy.id, payload);
        setSuccessMessage(`Release Policy '${editingPolicy.name}' updated successfully.`);
      } else {
        await apiCreateReleasePolicy(organizationId, payload);
        setSuccessMessage(`New DRAFT Release Policy '${payload.name}' created successfully.`);
      }

      setShowCreateModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save release policy.');
    } finally {
      setSubmitting(false);
    }
  };

  // Activate Policy
  const handleActivate = async (policy: ReleasePolicyDto) => {
    if (!organizationId) return;
    if (!confirm(`Activate policy '${policy.name}' (v${policy.version})? This will atomically supersede any previous active policy at this scope.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiActivateReleasePolicy(organizationId, policy.id);
      setSuccessMessage(`Policy '${policy.name}' v${policy.version} is now ACTIVE.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate policy.');
    } finally {
      setLoading(false);
    }
  };

  // Archive Policy
  const handleArchive = async (policy: ReleasePolicyDto) => {
    if (!organizationId) return;
    if (!confirm(`Are you sure you want to archive '${policy.name}'? It will no longer govern release decisions.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiArchiveReleasePolicy(organizationId, policy.id);
      setSuccessMessage(`Policy '${policy.name}' has been archived.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive policy.');
    } finally {
      setLoading(false);
    }
  };

  // Run Non-Mutating Policy Preview
  const handleRunPreview = async () => {
    if (!organizationId || !selectedChangeSetId) return;
    setPreviewLoading(true);
    setPreviewResult(null);
    setError(null);

    try {
      const result = await apiPreviewReleasePolicy(organizationId, {
        changeSetId: selectedChangeSetId,
      });
      setPreviewResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview evaluation failed.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Filtered Policies
  const filteredPolicies = policies.filter((p) => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (repoFilter !== 'ALL') {
      if (repoFilter === 'ORG' && p.repositoryConnectionId !== null) return false;
      if (repoFilter !== 'ORG' && p.repositoryConnectionId !== repoFilter) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Release Governance & Policy Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">
            Release Policies & Enforcement
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
            Configure versioned, auditable release safety policies. Impactra evaluates configured rule sets across 5 precedence tiers to govern PR release safety deterministically.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] transition-colors shadow-2xs"
          >
            <Play className="w-3.5 h-3.5 text-indigo-500" />
            <span>Preview Policy</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Policy</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-red-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Precedence Hierarchy Architecture Banner */}
      <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span>Canonical Precedence Resolution Order</span>
          </div>
          {effectiveScope && (
            <span className="text-xs text-[var(--text-secondary)]">
              Org Fallback: <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{effectiveScope.policyName}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-xs">
          <div className="p-3 rounded-lg border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20">
            <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">1. Highest Priority</div>
            <div className="font-semibold text-[var(--text-primary)] mt-0.5">Repo + Branch</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">Matches target repository & branch pattern.</div>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase">2. Priority 2</div>
            <div className="font-semibold text-[var(--text-primary)] mt-0.5">Repo Default</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">Default policy for repository.</div>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase">3. Priority 3</div>
            <div className="font-semibold text-[var(--text-primary)] mt-0.5">Org + Branch</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">Matches org-wide branch pattern.</div>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)]">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase">4. Priority 4</div>
            <div className="font-semibold text-[var(--text-primary)] mt-0.5">Org Default</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">Organization-wide default policy.</div>
          </div>

          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">5. Deterministic Fallback</div>
            <div className="font-semibold text-[var(--text-primary)] mt-0.5">Built-in Default</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">impactra-release-safety-v1 (Pass &lt;40, Block &gt;=75)</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'ACTIVE', 'DRAFT', 'SUPERSEDED', 'ARCHIVED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Scopes</option>
            <option value="ORG">Organization Scopes Only</option>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                Repo: {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Policy List Cards */}
      {loading ? (
        <div className="py-16 text-center text-xs text-[var(--text-muted)] flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Loading release policies...</span>
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="p-12 text-center rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-3">
          <ShieldAlert className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-40" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">No Release Policies Found</h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
            {statusFilter !== 'ALL' || repoFilter !== 'ALL'
              ? 'No policies match the selected filters. Try broadening your criteria.'
              : 'Create your first versioned release policy to customize release gates beyond the deterministic built-in policy.'}
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Policy</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPolicies.map((policy) => {
            const isDraft = policy.status === ReleasePolicyStatus.DRAFT;
            const isActive = policy.status === ReleasePolicyStatus.ACTIVE;
            const isSuperseded = policy.status === ReleasePolicyStatus.SUPERSEDED;
            const isArchived = policy.status === ReleasePolicyStatus.ARCHIVED;

            return (
              <div
                key={policy.id}
                className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-4 hover:border-[var(--border-strong)] transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                          {policy.name}
                        </h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                          v{policy.version}
                        </span>
                      </div>
                      {policy.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">
                          {policy.description}
                        </p>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE
                        </span>
                      )}
                      {isDraft && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Edit2 className="w-3 h-3" /> DRAFT
                        </span>
                      )}
                      {isSuperseded && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-500/10 text-gray-500 border border-gray-500/20">
                          SUPERSEDED
                        </span>
                      )}
                      {isArchived && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                          <Archive className="w-3 h-3" /> ARCHIVED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Scope Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] font-mono text-[11px]">
                      Scope: {policy.repositoryConnectionId ? (policy.targetBranchPattern ? 'REPOSITORY_BRANCH' : 'REPOSITORY_DEFAULT') : (policy.targetBranchPattern ? 'ORGANIZATION_BRANCH' : 'ORGANIZATION_DEFAULT')}
                    </span>

                    {policy.isDefault && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 text-[11px] font-medium">
                        Default
                      </span>
                    )}

                    {policy.targetBranchPattern && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-[11px]">
                        <GitBranch className="w-3 h-3 text-indigo-500" />
                        {policy.targetBranchPattern}
                      </span>
                    )}

                    {policy.repositoryConnectionId && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-[11px]">
                        <GitFork className="w-3 h-3 text-indigo-500" />
                        {repositories.find((r) => r.id === policy.repositoryConnectionId)?.name || 'Repository'}
                      </span>
                    )}
                  </div>

                  {/* Rules Overview */}
                  <div className="border-t border-[var(--border)] pt-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Rules ({policy.rules?.length || policy.ruleCount || 0})
                      </span>
                      <span className="text-[11px]">Deterministic Evaluation</span>
                    </div>

                    <div className="space-y-1.5">
                      {(policy.rules || []).slice(0, 4).map((rule) => (
                        <div
                          key={rule.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-raised)] text-xs border border-[var(--border)]"
                        >
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-[var(--text-primary)] font-semibold">{rule.ruleKey}</span>
                            <span className="text-[var(--text-muted)] text-[10px]">({rule.ruleType})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {rule.thresholdNumeric !== null && rule.thresholdNumeric !== undefined && (
                              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                                Threshold: {rule.thresholdNumeric}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                                rule.action === ReleasePolicyAction.BLOCK
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : rule.action === ReleasePolicyAction.REQUIRE_REVIEW
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {rule.action}
                            </span>
                          </div>
                        </div>
                      ))}

                      {(policy.rules?.length || 0) > 4 && (
                        <div className="text-[11px] text-[var(--text-muted)] text-center pt-1">
                          + {(policy.rules?.length || 0) - 4} more rules...
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="border-t border-[var(--border)] pt-3 flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryPolicy(policy)}
                    className="inline-flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Audit Log</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {isDraft && canUpdate && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(policy)}
                        className="px-2.5 py-1 rounded bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)] transition-colors"
                      >
                        Edit
                      </button>
                    )}

                    {isDraft && canActivate && (
                      <button
                        type="button"
                        onClick={() => handleActivate(policy)}
                        className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors"
                      >
                        Activate
                      </button>
                    )}

                    {(isActive || isDraft) && canArchive && (
                      <button
                        type="button"
                        onClick={() => handleArchive(policy)}
                        className="px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        title="Archive Policy"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT POLICY MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">
                  {editingPolicy ? `Edit Draft: ${editingPolicy.name}` : 'Create Release Policy'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Define versioned deterministic release policy rules and scope targeting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPolicy} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    Policy Name *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={150}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Production Release Safety Policy"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Describe purpose and governance rationale..."
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    Target Repository
                  </label>
                  <select
                    value={formRepoId}
                    onChange={(e) => setFormRepoId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Organization Scope (Applies across all repositories)</option>
                    {repositories.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[var(--text-secondary)]">
                    Target Branch Pattern (Glob)
                  </label>
                  <input
                    type="text"
                    value={formBranchPattern}
                    onChange={(e) => setFormBranchPattern(e.target.value)}
                    placeholder="e.g., main, release/*, prod-*"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isDefaultCheckbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="isDefaultCheckbox" className="text-xs text-[var(--text-primary)] font-medium">
                    Set as Default Policy for selected scope (activates when no branch pattern matches)
                  </label>
                </div>
              </div>

              {/* RULES EDITOR SECTION */}
              <div className="border-t border-[var(--border)] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Rules & Thresholds</h4>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Evaluated deterministically in order. Highest action (BLOCK &gt; REQUIRE_REVIEW &gt; ALLOW) determines final outcome.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-raised)] border border-[var(--border)] text-indigo-600 dark:text-indigo-400 hover:border-indigo-500 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Rule</span>
                  </button>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {formRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] space-y-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            required
                            value={rule.ruleKey}
                            onChange={(e) => handleRuleChange(idx, 'ruleKey', e.target.value)}
                            placeholder="rule_key"
                            className="px-2.5 py-1 text-xs font-mono rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] w-40"
                          />

                          <select
                            value={rule.ruleType}
                            onChange={(e) =>
                              handleRuleChange(idx, 'ruleType', e.target.value as ReleasePolicyRuleType)
                            }
                            className="px-2.5 py-1 text-xs rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]"
                          >
                            <option value={ReleasePolicyRuleType.MAX_RISK_SCORE}>MAX_RISK_SCORE</option>
                            <option value={ReleasePolicyRuleType.MINIMUM_RISK_LEVEL}>MINIMUM_RISK_LEVEL</option>
                            <option value={ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD}>BLAST_RADIUS_THRESHOLD</option>
                            <option value={ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT}>CRITICAL_SIGNAL_PRESENT</option>
                            <option value={ReleasePolicyRuleType.HIGH_SIGNAL_COUNT}>HIGH_SIGNAL_COUNT</option>
                            <option value={ReleasePolicyRuleType.PROTECTED_PATH_CHANGED}>PROTECTED_PATH_CHANGED</option>
                            <option value={ReleasePolicyRuleType.REQUIRE_APPROVAL}>REQUIRE_APPROVAL</option>
                          </select>

                          <select
                            value={rule.action}
                            onChange={(e) =>
                              handleRuleChange(idx, 'action', e.target.value as ReleasePolicyAction)
                            }
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]"
                          >
                            <option value={ReleasePolicyAction.BLOCK}>BLOCK</option>
                            <option value={ReleasePolicyAction.REQUIRE_REVIEW}>REQUIRE_REVIEW</option>
                            <option value={ReleasePolicyAction.ALLOW}>ALLOW</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveRule(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Rule Specific Threshold Inputs */}
                      <div className="flex items-center gap-3 pt-1">
                        {rule.ruleType === ReleasePolicyRuleType.MAX_RISK_SCORE && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text-muted)]">Risk Score Threshold (0-100):</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={rule.thresholdNumeric ?? ''}
                              onChange={(e) =>
                                handleRuleChange(idx, 'thresholdNumeric', e.target.value ? Number(e.target.value) : null)
                              }
                              className="w-20 px-2 py-1 text-xs font-mono rounded bg-[var(--surface)] border border-[var(--border)]"
                            />
                          </div>
                        )}

                        {rule.ruleType === ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text-muted)]">Max Blast Radius Affected Nodes:</span>
                            <input
                              type="number"
                              min={0}
                              value={rule.thresholdNumeric ?? ''}
                              onChange={(e) =>
                                handleRuleChange(idx, 'thresholdNumeric', e.target.value ? Number(e.target.value) : null)
                              }
                              className="w-24 px-2 py-1 text-xs font-mono rounded bg-[var(--surface)] border border-[var(--border)]"
                            />
                          </div>
                        )}

                        {rule.ruleType === ReleasePolicyRuleType.HIGH_SIGNAL_COUNT && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text-muted)]">Max High Severity Signals Count:</span>
                            <input
                              type="number"
                              min={0}
                              value={rule.thresholdNumeric ?? ''}
                              onChange={(e) =>
                                handleRuleChange(idx, 'thresholdNumeric', e.target.value ? Number(e.target.value) : null)
                              }
                              className="w-20 px-2 py-1 text-xs font-mono rounded bg-[var(--surface)] border border-[var(--border)]"
                            />
                          </div>
                        )}

                        {rule.ruleType === ReleasePolicyRuleType.PROTECTED_PATH_CHANGED && (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-[11px] text-[var(--text-muted)]">Protected Path Glob:</span>
                            <input
                              type="text"
                              value={rule.thresholdText ?? ''}
                              onChange={(e) => handleRuleChange(idx, 'thresholdText', e.target.value)}
                              placeholder="e.g., packages/core/**, migrations/**"
                              className="flex-1 px-2 py-1 text-xs font-mono rounded bg-[var(--surface)] border border-[var(--border)]"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="border-t border-[var(--border)] pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingPolicy ? 'Update Draft Policy' : 'Create Draft Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT EVENTS MODAL */}
      {historyPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Audit History: {historyPolicy.name}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Immutable event ledger for policy versioning, activations, and lifecycle transitions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryPolicy(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {(historyPolicy.events || []).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">No recorded audit events.</p>
              ) : (
                (historyPolicy.events || []).map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {evt.eventType}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          v{evt.policyVersion}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {new Date(evt.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">{evt.changeSummary}</p>

                    <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] pt-1">
                      <span>Actor:</span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {evt.actorUser?.name || evt.actorUserId}
                      </span>
                      {evt.previousStatus && (
                        <span>
                          ({evt.previousStatus} → {evt.newStatus})
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-3 text-right">
              <button
                type="button"
                onClick={() => setHistoryPolicy(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] hover:border-[var(--border-strong)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POLICY PREVIEW MODAL (NON-MUTATING) */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  <Play className="w-3.5 h-3.5" />
                  <span>Non-Mutating Policy Preview</span>
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mt-0.5">
                  Simulate Policy Evaluation on ChangeSet
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 text-xs flex items-start gap-2.5 text-indigo-900 dark:text-indigo-200">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-600" />
                <span>
                  Policy preview simulates deterministic evaluation against the active policy hierarchy without writing assessments, generating approval requests, or queuing GitHub Checks.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <select
                  value={selectedChangeSetId}
                  onChange={(e) => setSelectedChangeSetId(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-lg bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]"
                >
                  <option value="">Select a ChangeSet / Pull Request</option>
                  {changeSets.map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      PR #{cs.pullRequestNumber}: {cs.title} ({cs.baseRef})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleRunPreview}
                  disabled={!selectedChangeSetId || previewLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${previewLoading ? 'animate-spin' : ''}`} />
                  {previewLoading ? 'Evaluating...' : 'Simulate Policy'}
                </button>
              </div>

              {/* Preview Results Display */}
              {previewResult && (
                <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <div>
                      <span className="text-[11px] text-[var(--text-muted)] uppercase font-semibold">
                        Resolved Policy:
                      </span>
                      <div className="font-bold text-sm text-[var(--text-primary)]">
                        {previewResult.policy.name} (v{previewResult.policy.version})
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Scope: {previewResult.policy.scope}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-[var(--text-muted)] uppercase font-semibold">
                        Predicted Decision:
                      </span>
                      <div className="pt-1">
                        {previewResult.predictedDecision === 'PASS' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="w-3.5 h-3.5" /> PASS
                          </span>
                        )}
                        {previewResult.predictedDecision === 'REVIEW_REQUIRED' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3.5 h-3.5" /> REVIEW REQUIRED
                          </span>
                        )}
                        {previewResult.predictedDecision === 'BLOCKED' && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <ShieldX className="w-3.5 h-3.5" /> BLOCKED
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                      <span className="text-[11px] text-[var(--text-muted)]">Simulated Risk Score</span>
                      <div className="text-lg font-bold font-mono text-[var(--text-primary)] mt-0.5">
                        {previewResult.riskScore}/100 ({previewResult.riskLevel})
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                      <span className="text-[11px] text-[var(--text-muted)]">Final Policy Action</span>
                      <div className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {previewResult.finalAction}
                      </div>
                    </div>
                  </div>

                  {/* Matched Rules Breakdown */}
                  <div className="space-y-2 pt-2">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Evaluated Rule Outcomes ({previewResult.evaluationResults.length})
                    </h5>

                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {previewResult.evaluationResults.map((r, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                            r.matched
                              ? 'bg-amber-500/5 border-amber-500/30'
                              : 'bg-[var(--surface)] border-[var(--border)]'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-[var(--text-primary)]">
                                {r.ruleKey}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">({r.ruleType})</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)]">{r.reason}</p>
                          </div>

                          <div className="text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                r.matched
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-gray-500/10 text-gray-500'
                              }`}
                            >
                              {r.matched ? `MATCHED: ${r.action}` : 'PASSED'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
