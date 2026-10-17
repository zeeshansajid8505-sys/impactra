'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiListOrganizationReleaseSafetyAssessments,
  apiListRepositories,
} from '@/lib/api-client';
import {
  ReleaseSafetyAssessmentDto,
  RepositoryConnectionDto,
  ReleaseSafetyDecision,
  ReleaseRiskLevel,
} from '@impactra/shared';

export default function ReleaseSafetyIntelligencePage() {
  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;

  const [assessments, setAssessments] = useState<ReleaseSafetyAssessmentDto[]>([]);
  const [repositories, setRepositories] = useState<RepositoryConnectionDto[]>([]);
  const [decisionFilter, setDecisionFilter] = useState<string>('');
  const [riskLevelFilter, setRiskLevelFilter] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [assessmentsRes, reposRes] = await Promise.all([
        apiListOrganizationReleaseSafetyAssessments(organizationId, {
          decision: decisionFilter || undefined,
          riskLevel: riskLevelFilter || undefined,
          limit: 50,
        }),
        apiListRepositories(organizationId, { limit: 100 }),
      ]);
      setAssessments(assessmentsRes.items);
      setRepositories(reposRes.repositories);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to load release safety intelligence: ${msg}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, decisionFilter, riskLevelFilter]);

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) return;

    Promise.all([
      apiListOrganizationReleaseSafetyAssessments(organizationId, {
        decision: decisionFilter || undefined,
        riskLevel: riskLevelFilter || undefined,
        limit: 50,
      }),
      apiListRepositories(organizationId, { limit: 100 }),
    ])
      .then(([assessmentsRes, reposRes]) => {
        if (cancelled) return;
        setAssessments(assessmentsRes.items);
        setRepositories(reposRes.repositories);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to load release safety intelligence: ${msg}`);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, decisionFilter, riskLevelFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const stats = useMemo(() => {
    const total = assessments.length;
    const passed = assessments.filter((a) => a.decision === 'PASS').length;
    const reviewRequired = assessments.filter(
      (a) => a.decision === 'REVIEW_REQUIRED',
    ).length;
    const blocked = assessments.filter((a) => a.decision === 'BLOCKED').length;
    const avgScore =
      total > 0
        ? Math.round(
            assessments.reduce((acc, a) => acc + (a.riskScore || 0), 0) / total,
          )
        : 0;
    return { total, passed, reviewRequired, blocked, avgScore };
  }, [assessments]);

  const renderDecisionBadge = (decision: ReleaseSafetyDecision) => {
    switch (decision) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            PASS
          </span>
        );
      case 'REVIEW_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="w-3.5 h-3.5" />
            REVIEW REQUIRED
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldX className="w-3.5 h-3.5" />
            BLOCKED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {decision}
          </span>
        );
    }
  };

  const renderRiskBadge = (riskLevel: ReleaseRiskLevel, score: number) => {
    let colorClass = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    if (riskLevel === 'LOW') {
      colorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    } else if (riskLevel === 'MEDIUM') {
      colorClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    } else if (riskLevel === 'HIGH') {
      colorClass = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    } else if (riskLevel === 'CRITICAL') {
      colorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium border ${colorClass}`}
      >
        Score {score}/100 ({riskLevel})
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Release Safety Intelligence
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Explainable, policy-driven release guardrails and risk decision
                evaluations
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition disabled:opacity-50 self-start md:self-auto"
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="text-xs font-medium text-slate-400">
            Total Assessments
          </div>
          <div className="text-2xl font-bold text-white mt-1">
            {stats.total}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="text-xs font-medium text-slate-400">Passed</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {stats.passed}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="text-xs font-medium text-slate-400">
            Review Required
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {stats.reviewRequired}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
          <div className="text-xs font-medium text-slate-400">Blocked</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">
            {stats.blocked}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm col-span-2 md:col-span-1">
          <div className="text-xs font-medium text-slate-400">
            Avg Risk Score
          </div>
          <div className="text-2xl font-bold text-indigo-400 mt-1">
            {stats.avgScore}
            <span className="text-xs font-normal text-slate-500">/100</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 mb-6">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter:
        </div>

        <select
          value={decisionFilter}
          onChange={(e) => setDecisionFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Decisions</option>
          <option value="PASS">PASS</option>
          <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>

        <select
          value={riskLevelFilter}
          onChange={(e) => setRiskLevelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Risk Levels</option>
          <option value="LOW">LOW (0-24)</option>
          <option value="MEDIUM">MEDIUM (25-49)</option>
          <option value="HIGH">HIGH (50-74)</option>
          <option value="CRITICAL">CRITICAL (75-100)</option>
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Assessment Table / Cards */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 rounded-xl bg-slate-900/40 border border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400 mb-3" />
          <p>Loading release safety assessments...</p>
        </div>
      ) : assessments.length === 0 ? (
        <div className="p-12 text-center text-slate-400 rounded-xl bg-slate-900/40 border border-slate-800">
          <ShieldCheck className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <p className="text-base font-medium text-slate-300">
            No release safety assessments found
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Assessments evaluate automatically after Blast Radius analysis runs
            on pull request revisions.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-medium">Change Set</th>
                  <th className="px-6 py-3.5 font-medium">Decision</th>
                  <th className="px-6 py-3.5 font-medium">Risk Score</th>
                  <th className="px-6 py-3.5 font-medium">Signals</th>
                  <th className="px-6 py-3.5 font-medium">Policy</th>
                  <th className="px-6 py-3.5 font-medium">Date</th>
                  <th className="px-6 py-3.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {assessments.map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium text-white truncate max-w-xs">
                            {a.changeSet?.title || `ChangeSet ${a.changeSetId}`}
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            ID: {a.changeSetId.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {renderDecisionBadge(a.decision)}
                    </td>
                    <td className="px-6 py-4">
                      {renderRiskBadge(a.riskLevel, a.riskScore)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-white">
                          {a.signalCount}
                        </span>
                        <span className="text-slate-500">total</span>
                        {a.blockingSignalCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                            {a.blockingSignalCount} blocking
                          </span>
                        )}
                        {a.reviewSignalCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                            {a.reviewSignalCount} review
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {a.policyVersion}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {new Date(a.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/workspace/changes/${a.changeSetId}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
                      >
                        Inspect
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
