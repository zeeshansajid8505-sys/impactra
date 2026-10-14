import { PrismaClient, DigitalTwinNodeType } from '@impactra/database';
import { BlastRadiusEdgePolicy } from '../src/blast-radius/services/blast-radius-edge-policy';
import { BlastRadiusTraversalService } from '../src/blast-radius/services/blast-radius-traversal.service';
import {
  BlastRadiusSnapshotSide,
  BlastRadiusImpactClass,
} from '@impactra/shared';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    // 1. Locate fixture organization and repository
    const org = await prisma.organization.findUnique({
      where: { slug: 'fixture-test-org' },
    });
    if (!org) {
      console.error('ERROR: Fixture organization fixture-test-org not found. Run run-controlled-fixture.ts first.');
      process.exit(1);
    }

    const repo = await prisma.repositoryConnection.findFirst({
      where: { organizationId: org.id },
    });
    if (!repo) {
      console.error('ERROR: Fixture repository connection not found.');
      process.exit(1);
    }

    const changeSet = await prisma.changeSet.findUnique({
      where: {
        repositoryConnectionId_pullRequestNumber: {
          repositoryConnectionId: repo.id,
          pullRequestNumber: 101,
        },
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!changeSet || changeSet.revisions.length === 0) {
      console.error('ERROR: Fixture change set or revision not found.');
      process.exit(1);
    }

    const revision = changeSet.revisions[0];

    // 2. Clean previous blast radius analyses for this revision
    await prisma.blastRadiusAnalysis.deleteMany({
      where: { changeRevisionId: revision.id },
    });

    // 3. Load twin change mappings to derive roots
    const twinMappings = await prisma.twinChangeMapping.findMany({
      where: {
        changeRevisionId: revision.id,
        mappingType: { not: 'NOT_PRESENT' },
      },
      include: {
        changedFile: true,
        digitalTwinNode: true,
      },
    });

    // 4. Derive roots: map each twinMapping to root
    // For DELETED files -> query BASE graph; for ADDED, MODIFIED -> query HEAD graph
    const headTwin = await prisma.digitalTwinSnapshot.findFirst({
      where: { repositorySnapshotId: revision.headSnapshotId! },
      include: {
        nodes: true,
        edges: {
          include: {
            sourceNode: true,
            targetNode: true,
          },
        },
      },
    });

    const baseTwin = revision.baseSnapshotId
      ? await prisma.digitalTwinSnapshot.findFirst({
          where: { repositorySnapshotId: revision.baseSnapshotId },
          include: {
            nodes: true,
            edges: {
              include: {
                sourceNode: true,
                targetNode: true,
              },
            },
          },
        })
      : null;

    if (!headTwin) {
      console.error('ERROR: Head digital twin snapshot not found.');
      process.exit(1);
    }

    const edgePolicy = new BlastRadiusEdgePolicy();
    const traversalService = new BlastRadiusTraversalService(edgePolicy);

    // Build roots from mappings
    const rootsData: any[] = [];
    const seenRoots = new Set<string>();

    for (const tm of twinMappings) {
      if (!tm.nodeStableKey) continue;
      if (!tm.digitalTwinNode) continue;

      const changeKind = tm.changedFile ? tm.changedFile.status : 'MODIFIED';
      const side = tm.changedFile?.status === 'DELETED' ? BlastRadiusSnapshotSide.BASE : BlastRadiusSnapshotSide.HEAD;
      const key = `${side}:${tm.nodeStableKey}`;

      if (!seenRoots.has(key)) {
        seenRoots.add(key);
        rootsData.push({
          twinChangeMappingId: tm.id,
          digitalTwinNodeId: tm.digitalTwinNodeId,
          stableKey: tm.nodeStableKey,
          nodeType: tm.digitalTwinNode.type as DigitalTwinNodeType,
          changeKind,
          snapshotSide: side,
        });
      }
    }

    // Separate HEAD roots and BASE roots
    const headRoots = rootsData.filter((r) => r.snapshotSide === BlastRadiusSnapshotSide.HEAD);
    const baseRoots = rootsData.filter((r) => r.snapshotSide === BlastRadiusSnapshotSide.BASE);

    // Traverse HEAD graph
    const headNodes = headTwin.nodes.map((n) => ({
      id: n.id,
      stableKey: n.stableKey,
      name: n.name,
      path: n.path,
      type: n.type,
    }));
    const headEdges = headTwin.edges
      .filter((e) => e.sourceNode && e.targetNode)
      .map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        sourceStableKey: e.sourceNode.stableKey,
        targetStableKey: e.targetNode.stableKey,
        type: e.type,
      }));

    const headTraversal = traversalService.traverse(
      headRoots,
      headNodes,
      headEdges,
      BlastRadiusSnapshotSide.HEAD,
    );

    // If base roots exist, traverse BASE graph
    let baseFindings: any[] = [];
    let baseEvidencePaths: any[] = [];
    if (baseRoots.length > 0 && baseTwin) {
      const baseNodes = baseTwin.nodes.map((n) => ({
        id: n.id,
        stableKey: n.stableKey,
        name: n.name,
        path: n.path,
        type: n.type,
      }));
      const baseEdges = baseTwin.edges
        .filter((e) => e.sourceNode && e.targetNode)
        .map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceStableKey: e.sourceNode.stableKey,
          targetStableKey: e.targetNode.stableKey,
          type: e.type,
        }));
      const baseTraversal = traversalService.traverse(
        baseRoots,
        baseNodes,
        baseEdges,
        BlastRadiusSnapshotSide.BASE,
      );
      baseFindings = baseTraversal.findings;
      baseEvidencePaths = baseTraversal.evidencePaths;
    }

    const allFindingsMap = new Map<string, any>();
    for (const f of headTraversal.findings) {
      allFindingsMap.set(f.stableKey, f);
    }
    for (const f of baseFindings) {
      const existing = allFindingsMap.get(f.stableKey);
      if (!existing || f.depth < existing.depth) {
        allFindingsMap.set(f.stableKey, f);
      }
    }
    const allFindings = Array.from(allFindingsMap.values()).sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.stableKey.localeCompare(b.stableKey);
    });
    const allPaths = [...headTraversal.evidencePaths, ...baseEvidencePaths];

    // Calculate aggregated stats
    const firstOrderCount = allFindings.filter((f) => f.impactClass === BlastRadiusImpactClass.FIRST_ORDER).length;
    const transitiveCount = allFindings.filter((f) => f.impactClass === BlastRadiusImpactClass.TRANSITIVE).length;
    const maxDepth = allFindings.reduce((max, f) => Math.max(max, f.depth), 0);

    // 5. Persist BlastRadiusAnalysis in a transaction
    const analysis = await prisma.$transaction(async (tx) => {
      const createdAnalysis = await tx.blastRadiusAnalysis.create({
        data: {
          organizationId: org.id,
          changeSetId: changeSet.id,
          changeRevisionId: revision.id,
          analysisVersion: 'blast-radius-v1',
          status: 'SUCCEEDED',
          rootCount: rootsData.length,
          affectedNodeCount: allFindings.length,
          firstOrderCount,
          transitiveCount,
          maxDepth: maxDepth || 5,
          evidencePathCount: allPaths.length,
          truncated: headTraversal.truncated,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      // Insert roots
      const createdRoots: Record<string, string> = {};
      for (const r of rootsData) {
        const rootRecord = await tx.blastRadiusRoot.create({
          data: {
            analysisId: createdAnalysis.id,
            twinChangeMappingId: r.twinChangeMappingId,
            digitalTwinNodeId: r.digitalTwinNodeId,
            stableKey: r.stableKey,
            nodeType: r.nodeType,
            changeKind: r.changeKind,
            snapshotSide: r.snapshotSide,
          },
        });
        createdRoots[`${r.snapshotSide}:${r.stableKey}`] = rootRecord.id;
      }

      // Insert findings
      const findingIdMap: Record<string, string> = {};
      for (const f of allFindings) {
        const rootId = f.rootId || createdRoots[`${f.snapshotSide}:${f.stableKey}`] || null;
        const findingRecord = await tx.blastRadiusFinding.create({
          data: {
            analysisId: createdAnalysis.id,
            rootId,
            digitalTwinNodeId: f.digitalTwinNodeId || null,
            stableKey: f.stableKey,
            nodeName: f.nodeName,
            nodePath: f.nodePath,
            nodeType: f.nodeType,
            category: f.category,
            impactClass: f.impactClass,
            depth: f.depth,
            reasonCode: f.reasonCode,
            reasonSummary: f.reasonSummary,
            snapshotSide: f.snapshotSide,
          },
        });
        findingIdMap[f.stableKey] = findingRecord.id;
      }

      // Insert evidence paths
      for (const p of allPaths) {
        const findingId = findingIdMap[p.affectedStableKey] || null;
        if (!findingId) continue;
        await tx.blastRadiusEvidencePath.create({
          data: {
            analysisId: createdAnalysis.id,
            findingId,
            rootStableKey: p.rootStableKey,
            affectedStableKey: p.affectedStableKey,
            snapshotSide: p.snapshotSide,
            depth: p.depth,
            pathNodesJson: p.pathNodes as any,
            pathEdgesJson: p.pathEdges as any,
          },
        });
      }

      return createdAnalysis;
    });

    console.log('\n==================================================');
    console.log('PHASE 07 DETERMINISTIC BLAST-RADIUS FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`BlastRadiusAnalysis ID:       ${analysis.id}`);
    console.log(`ChangeSet ID:                 ${changeSet.id}`);
    console.log(`ChangeRevision ID:            ${revision.id}`);
    console.log(`Roots Analyzed Count:         ${analysis.rootCount}`);
    console.log(`Total Affected Nodes:         ${analysis.affectedNodeCount}`);
    console.log(`First-Order Affected Nodes:   ${analysis.firstOrderCount}`);
    console.log(`Transitive Affected Nodes:    ${analysis.transitiveCount}`);
    console.log(`Max Traversal Depth Reached:  ${analysis.maxDepth}`);
    console.log(`Evidence Paths Count:         ${analysis.evidencePathCount}`);
    console.log(`Truncated:                    ${analysis.truncated}`);
    console.log(`Status:                       ${analysis.status}`);
    console.log(`Organization ID:              ${org.id}`);
    console.log('==================================================\n');

    // Output tokens for script parsing
    console.log(`REAL_BLAST_RADIUS_ANALYSIS_ID=${analysis.id}`);
    console.log(`REAL_CHANGE_SET_ID=${changeSet.id}`);
    console.log(`REAL_ORG_ID=${org.id}`);
    console.log(`TOTAL_AFFECTED_NODES=${analysis.affectedNodeCount}`);
    console.log(`FIRST_ORDER_NODES=${analysis.firstOrderCount}`);
    console.log(`TRANSITIVE_NODES=${analysis.transitiveCount}`);
    console.log(`MAX_DEPTH=${analysis.maxDepth}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Blast radius fixture execution failed:', err);
  process.exit(1);
});
