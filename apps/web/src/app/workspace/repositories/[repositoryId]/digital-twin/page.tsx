'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import {
  Layers,
  ArrowLeft,
  RefreshCw,
  Search,
  Package,
  FileCode,
  Network,
  Cpu,
  Share2,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  apiGetLatestDigitalTwin,
  apiListTwinNodes,
  apiListTwinEdges,
  apiListRepositories,
} from '@/lib/api-client';
import {
  DigitalTwinSummaryResponse,
  DigitalTwinNodeEntityDto,
  DigitalTwinEdgeDto,
  DigitalTwinNodeTypeEnum,
  DigitalTwinEdgeType,
  RepositoryConnectionDto,
} from '@impactra/shared';

export default function DigitalTwinPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  const resolvedParams = use(params);
  const repositoryId = resolvedParams.repositoryId;

  const { activeOrg } = useAuth();
  const organizationId = activeOrg?.organization?.id;

  const [repository, setRepository] = useState<RepositoryConnectionDto | null>(null);
  const [twinSummary, setTwinSummary] = useState<DigitalTwinSummaryResponse | null>(null);
  const [nodes, setNodes] = useState<DigitalTwinNodeEntityDto[]>([]);
  const [edges, setEdges] = useState<DigitalTwinEdgeDto[]>([]);
  const [activeTab, setActiveTab] = useState<'nodes' | 'edges'>('nodes');
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [nodeTypeFilter, setNodeTypeFilter] = useState<DigitalTwinNodeTypeEnum | 'ALL'>('ALL');
  const [edgeTypeFilter, setEdgeTypeFilter] = useState<DigitalTwinEdgeType | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadTwinData = useCallback(async () => {
    if (!organizationId || !repositoryId) return;

    try {
      setLoading(true);

      // Load repo metadata
      const repoRes = await apiListRepositories(organizationId, { limit: 100 });
      const found = repoRes.repositories.find((r) => r.id === repositoryId);
      if (found) setRepository(found);

      // Load Twin Summary
      const summary = await apiGetLatestDigitalTwin(organizationId, repositoryId);
      setTwinSummary(summary);

      // Load Nodes
      const nodesRes = await apiListTwinNodes(organizationId, repositoryId, {
        limit: 100,
        type: nodeTypeFilter === 'ALL' ? undefined : nodeTypeFilter,
        search: searchTerm.trim() || undefined,
      });
      setNodes(nodesRes.nodes);

      // Load Edges
      const edgesRes = await apiListTwinEdges(organizationId, repositoryId, {
        limit: 100,
        type: edgeTypeFilter === 'ALL' ? undefined : edgeTypeFilter,
      });
      setEdges(edgesRes.edges);
    } catch {
      setTwinSummary(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, repositoryId, nodeTypeFilter, edgeTypeFilter, searchTerm]);

  useEffect(() => {
    loadTwinData();
  }, [loadTwinData]);

  if (loading && !twinSummary) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[300px]">
        <div className="flex items-center gap-3 text-[var(--text-secondary)] text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Building Digital Twin graph view...</span>
        </div>
      </div>
    );
  }

  if (!twinSummary) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Link
          href={`/workspace/repositories/${repositoryId}`}
          className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Repository</span>
        </Link>

        <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] p-12 text-center space-y-4 shadow-xs">
          <Layers className="w-12 h-12 text-[var(--text-muted)] mx-auto" />
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Digital Twin Not Generated Yet
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            This repository has not completed an ingestion run yet. Trigger an ingestion job to extract packages, AST dependencies, and generate its architectural digital twin.
          </p>
          <Link
            href={`/workspace/repositories/${repositoryId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs"
          >
            <Cpu className="w-4 h-4" />
            <span>Go to Ingestion Controls</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/workspace/repositories/${repositoryId}`}
          className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Repository Detail</span>
        </Link>
        <button
          type="button"
          onClick={loadTwinData}
          className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors"
          title="Refresh Digital Twin"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Header Banner */}
      <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Layers className="w-6 h-6 text-indigo-500" />
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Software Digital Twin Foundation
              </h1>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Repository: <span className="font-semibold text-[var(--text-primary)]">{repository?.fullName}</span> | Commit:{' '}
              <span className="font-mono">{twinSummary.repositorySnapshot.commitSha.slice(0, 10)}</span> | Ref:{' '}
              <span className="font-mono">{twinSummary.repositorySnapshot.ref}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)]">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border)]">
              Version: {twinSummary.snapshot.twinVersion}
            </span>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-3 border-t border-[var(--border)]">
          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Total Nodes</div>
            <div className="text-xl font-bold text-[var(--text-primary)] font-mono mt-1">
              {twinSummary.nodeCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Total Edges</div>
            <div className="text-xl font-bold text-[var(--text-primary)] font-mono mt-1">
              {twinSummary.edgeCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Packages</div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-1">
              {twinSummary.nodesByType['WORKSPACE_PACKAGE'] || 0}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Source Files</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">
              {twinSummary.nodesByType['FILE'] || 0}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Dependencies</div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono mt-1">
              {twinSummary.nodesByType['EXTERNAL_DEPENDENCY'] || 0}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border)]">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">Configs</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {twinSummary.nodesByType['CONFIG'] || 0}
            </div>
          </div>
        </div>

        {/* Language Breakdown Bar */}
        {Object.keys(twinSummary.languageDistribution).length > 0 && (
          <div className="pt-3 border-t border-[var(--border)] space-y-1.5">
            <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Detected Languages</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(twinSummary.languageDistribution).map(([lang, count]) => (
                <span
                  key={lang}
                  className="px-2 py-0.5 rounded-md bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] font-mono text-[11px]"
                >
                  {lang}: <strong className="text-[var(--text-primary)]">{count}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Graph Explorer Section */}
      <div className="border border-[var(--border)] rounded-2xl bg-[var(--surface)] overflow-hidden shadow-xs">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-raised)]/40 px-6 pt-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('nodes')}
              className={`pb-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'nodes'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Vertices (Nodes) [{twinSummary.nodeCount}]</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('edges')}
              className={`pb-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'edges'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>Directed Edges [{twinSummary.edgeCount}]</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Nodes Explorer */}
        {activeTab === 'nodes' && (
          <div className="p-6 space-y-4">
            {/* Filter controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search by name, path, or stableKey..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)] text-[11px]">Type:</span>
                {(['ALL', 'WORKSPACE_PACKAGE', 'FILE', 'EXTERNAL_DEPENDENCY', 'CONFIG'] as const).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setNodeTypeFilter(type)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        nodeTypeFilter === type
                          ? 'bg-indigo-600 text-white'
                          : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {type === 'ALL' ? 'All' : type}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Nodes Table */}
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase font-mono text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Entity Name</th>
                    <th className="px-4 py-3">Relative Path</th>
                    <th className="px-4 py-3">Stable Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {nodes.map((node) => (
                    <tr key={node.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            node.type === 'WORKSPACE_PACKAGE'
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                              : node.type === 'FILE'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : node.type === 'EXTERNAL_DEPENDENCY'
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {node.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                        {node.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)]">
                        {node.path || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)]">
                        {node.stableKey}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Edges Explorer */}
        {activeTab === 'edges' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)] text-[11px]">Edge Type:</span>
              {(['ALL', 'IMPORTS', 'CONTAINS', 'DECLARES_DEPENDENCY', 'WORKSPACE_DEPENDS_ON'] as const).map(
                (type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEdgeTypeFilter(type)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      edgeTypeFilter === type
                        ? 'bg-indigo-600 text-white'
                        : 'bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {type === 'ALL' ? 'All' : type}
                  </button>
                ),
              )}
            </div>

            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surface-raised)] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase font-mono text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Relationship Type</th>
                    <th className="px-4 py-3">Source Node</th>
                    <th className="px-4 py-3">Target Node</th>
                    <th className="px-4 py-3">Evidence Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {edges.map((edge) => (
                    <tr key={edge.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold font-mono bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-primary)]">
                          {edge.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {edge.sourceNode?.name || 'Node'}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--text-muted)]">
                          {edge.sourceNode?.stableKey}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {edge.targetNode?.name || 'Node'}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--text-muted)]">
                          {edge.targetNode?.stableKey}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)]">
                        {edge.evidence ? JSON.stringify(edge.evidence) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
