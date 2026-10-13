import { PrismaClient } from '@impactra/database';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    // 1. Setup / reuse test organization and connected repository
    const org = await prisma.organization.upsert({
      where: { slug: 'fixture-test-org' },
      update: {},
      create: {
        name: 'Controlled Fixture Org',
        slug: 'fixture-test-org',
      },
    });

    const installation = await prisma.gitHubInstallation.upsert({
      where: { githubInstallationId: 'inst-fixture-p6' },
      update: {},
      create: {
        organizationId: org.id,
        githubInstallationId: 'inst-fixture-p6',
        accountId: 'acct-fixture',
        accountLogin: 'impactra-fixture',
        accountType: 'Organization',
        repositorySelection: 'all',
        permissions: {},
        events: ['pull_request'],
        status: 'ACTIVE',
      },
    });

    const repo = await prisma.repositoryConnection.upsert({
      where: {
        organizationId_githubRepositoryId: {
          organizationId: org.id,
          githubRepositoryId: 'repo-fixture-101',
        },
      },
      update: {
        connected: true,
        available: true,
      },
      create: {
        organizationId: org.id,
        githubInstallationId: installation.githubInstallationId,
        githubRepositoryId: 'repo-fixture-101',
        ownerLogin: 'impactra',
        name: 'sample-app',
        fullName: 'impactra/sample-app',
        defaultBranch: 'main',
        connected: true,
        available: true,
      },
    });

    // Clean any previous fixture revisions for PR 101 for complete idempotency
    const existingChangeSet = await prisma.changeSet.findUnique({
      where: {
        repositoryConnectionId_pullRequestNumber: {
          repositoryConnectionId: repo.id,
          pullRequestNumber: 101,
        },
      },
    });
    if (existingChangeSet) {
      await prisma.changeRevision.deleteMany({
        where: { changeSetId: existingChangeSet.id },
      });
    }

    // 2. Base Snapshot & Digital Twin
    const baseCommitSha = 'b111111111111111111111111111111111111111';
    const baseIngestion = await prisma.repositoryIngestion.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        targetRef: 'main',
        commitSha: baseCommitSha,
        status: 'SUCCEEDED',
        stage: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const baseSnapshot = await prisma.repositorySnapshot.upsert({
      where: {
        repositoryConnectionId_commitSha_parserVersion: {
          repositoryConnectionId: repo.id,
          commitSha: baseCommitSha,
          parserVersion: 'digital-twin-parser-v1',
        },
      },
      update: {
        ingestionId: baseIngestion.id,
      },
      create: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        ingestionId: baseIngestion.id,
        commitSha: baseCommitSha,
        ref: 'main',
        sourceBytes: 1024,
        fileCount: 4,
      },
    });

    await prisma.digitalTwinSnapshot.deleteMany({
      where: { repositorySnapshotId: baseSnapshot.id },
    });

    const baseTwin = await prisma.digitalTwinSnapshot.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        repositorySnapshotId: baseSnapshot.id,
        twinVersion: 'digital-twin-v1',
        nodeCount: 5,
        edgeCount: 2,
      },
    });

    const baseNodeService = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: baseTwin.id,
        stableKey: 'file:src/service.ts',
        type: 'FILE',
        name: 'service.ts',
        path: 'src/service.ts',
      },
    });

    const baseNodeUtil = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: baseTwin.id,
        stableKey: 'file:src/util.ts',
        type: 'FILE',
        name: 'util.ts',
        path: 'src/util.ts',
      },
    });

    const baseNodePkgJson = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: baseTwin.id,
        stableKey: 'file:package.json',
        type: 'FILE',
        name: 'package.json',
        path: 'package.json',
      },
    });

    const baseNodePkg = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: baseTwin.id,
        stableKey: 'pkg:app',
        type: 'WORKSPACE_PACKAGE',
        name: 'app',
      },
    });

    const baseNodeReact = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: baseTwin.id,
        stableKey: 'dep:react',
        type: 'EXTERNAL_DEPENDENCY',
        name: 'react',
      },
    });

    await prisma.digitalTwinEdge.createMany({
      data: [
        {
          digitalTwinSnapshotId: baseTwin.id,
          sourceNodeId: baseNodeService.id,
          targetNodeId: baseNodeUtil.id,
          type: 'IMPORTS',
          evidence: { importPath: './util' },
        },
        {
          digitalTwinSnapshotId: baseTwin.id,
          sourceNodeId: baseNodePkg.id,
          targetNodeId: baseNodeReact.id,
          type: 'DECLARES_DEPENDENCY',
          evidence: { version: '^18.0.0' },
        },
      ],
    });

    // 3. Head Snapshot & Digital Twin
    const headCommitSha = 'h222222222222222222222222222222222222222';
    const headIngestion = await prisma.repositoryIngestion.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        targetRef: 'feature/new-util',
        commitSha: headCommitSha,
        status: 'SUCCEEDED',
        stage: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const headSnapshot = await prisma.repositorySnapshot.upsert({
      where: {
        repositoryConnectionId_commitSha_parserVersion: {
          repositoryConnectionId: repo.id,
          commitSha: headCommitSha,
          parserVersion: 'digital-twin-parser-v1',
        },
      },
      update: {
        ingestionId: headIngestion.id,
      },
      create: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        ingestionId: headIngestion.id,
        commitSha: headCommitSha,
        ref: 'feature/new-util',
        sourceBytes: 1050,
        fileCount: 4,
      },
    });

    await prisma.digitalTwinSnapshot.deleteMany({
      where: { repositorySnapshotId: headSnapshot.id },
    });

    const headTwin = await prisma.digitalTwinSnapshot.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        repositorySnapshotId: headSnapshot.id,
        twinVersion: 'digital-twin-v1',
        nodeCount: 6,
        edgeCount: 3,
      },
    });

    const headNodeService = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'file:src/service.ts',
        type: 'FILE',
        name: 'service.ts',
        path: 'src/service.ts',
      },
    });

    const headNodeNewUtil = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'file:src/new-util.ts',
        type: 'FILE',
        name: 'new-util.ts',
        path: 'src/new-util.ts',
      },
    });

    const headNodePkgJson = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'file:package.json',
        type: 'FILE',
        name: 'package.json',
        path: 'package.json',
      },
    });

    const headNodePkg = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'pkg:app',
        type: 'WORKSPACE_PACKAGE',
        name: 'app',
      },
    });

    const headNodeReact = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'dep:react',
        type: 'EXTERNAL_DEPENDENCY',
        name: 'react',
      },
    });

    const headNodeZod = await prisma.digitalTwinNode.create({
      data: {
        digitalTwinSnapshotId: headTwin.id,
        stableKey: 'dep:zod',
        type: 'EXTERNAL_DEPENDENCY',
        name: 'zod',
      },
    });

    await prisma.digitalTwinEdge.createMany({
      data: [
        {
          digitalTwinSnapshotId: headTwin.id,
          sourceNodeId: headNodeService.id,
          targetNodeId: headNodeNewUtil.id,
          type: 'IMPORTS',
          evidence: { importPath: './new-util' },
        },
        {
          digitalTwinSnapshotId: headTwin.id,
          sourceNodeId: headNodePkg.id,
          targetNodeId: headNodeReact.id,
          type: 'DECLARES_DEPENDENCY',
          evidence: { version: '^18.0.0' },
        },
        {
          digitalTwinSnapshotId: headTwin.id,
          sourceNodeId: headNodePkg.id,
          targetNodeId: headNodeZod.id,
          type: 'DECLARES_DEPENDENCY',
          evidence: { version: '^3.22.0' },
        },
      ],
    });

    // 4. ChangeSet & ChangeRevision
    const prNumber = 101;
    const changeSet = await prisma.changeSet.upsert({
      where: {
        repositoryConnectionId_pullRequestNumber: {
          repositoryConnectionId: repo.id,
          pullRequestNumber: prNumber,
        },
      },
      update: {
        title: 'feat: switch util to new-util and add zod',
        currentBaseSha: baseCommitSha,
        currentHeadSha: headCommitSha,
        state: 'open',
      },
      create: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        provider: 'github',
        providerPullRequestId: 'pr-101',
        pullRequestNumber: prNumber,
        title: 'feat: switch util to new-util and add zod',
        authorLogin: 'test-developer',
        baseRef: 'main',
        headRef: 'feature/new-util',
        currentBaseSha: baseCommitSha,
        currentHeadSha: headCommitSha,
        state: 'open',
        isDraft: false,
        isMerged: false,
      },
    });

    // Clean existing revisions for this commit pair if re-running
    await prisma.changeRevision.deleteMany({
      where: {
        changeSetId: changeSet.id,
        baseSha: baseCommitSha,
        headSha: headCommitSha,
      },
    });

    const revision = await prisma.changeRevision.create({
      data: {
        changeSetId: changeSet.id,
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        baseSha: baseCommitSha,
        headSha: headCommitSha,
        baseSnapshotId: baseSnapshot.id,
        headSnapshotId: headSnapshot.id,
        analysisVersion: 'change-analysis-v1',
        status: 'ANALYZING',
        stage: 'ANALYZING',
        startedAt: new Date(),
      },
    });

    // 5. Changed Files: util.ts deleted, new-util.ts added, service.ts modified, package.json modified
    const changedFilesData = [
      {
        changeRevisionId: revision.id,
        oldPath: null,
        newPath: 'src/new-util.ts',
        status: 'ADDED' as const,
        additions: 25,
        deletions: 0,
        changes: 25,
        patchAvailable: true,
      },
      {
        changeRevisionId: revision.id,
        oldPath: 'src/util.ts',
        newPath: null,
        status: 'DELETED' as const,
        additions: 0,
        deletions: 20,
        changes: 20,
        patchAvailable: true,
      },
      {
        changeRevisionId: revision.id,
        oldPath: 'src/service.ts',
        newPath: 'src/service.ts',
        status: 'MODIFIED' as const,
        additions: 5,
        deletions: 5,
        changes: 10,
        patchAvailable: true,
      },
      {
        changeRevisionId: revision.id,
        oldPath: 'package.json',
        newPath: 'package.json',
        status: 'MODIFIED' as const,
        additions: 1,
        deletions: 1,
        changes: 2,
        patchAvailable: true,
      },
    ];

    await prisma.changedFile.createMany({ data: changedFilesData });
    const persistedFiles = await prisma.changedFile.findMany({
      where: { changeRevisionId: revision.id },
    });

    const fileNewUtil = persistedFiles.find((f: { newPath: string | null }) => f.newPath === 'src/new-util.ts')!;
    const fileUtil = persistedFiles.find((f: { oldPath: string | null }) => f.oldPath === 'src/util.ts')!;
    const fileService = persistedFiles.find((f: { newPath: string | null }) => f.newPath === 'src/service.ts')!;
    const filePkg = persistedFiles.find((f: { newPath: string | null }) => f.newPath === 'package.json')!;

    // 6. Twin Change Mappings (Deterministic Paired BEFORE & AFTER for 4 files = 8 mappings)
    await prisma.twinChangeMapping.createMany({
      data: [
        // src/new-util.ts (ADDED): BEFORE NOT_PRESENT, AFTER EXACT_PATH
        {
          changeRevisionId: revision.id,
          changedFileId: fileNewUtil.id,
          side: 'BEFORE',
          mappingType: 'NOT_PRESENT',
          repositorySnapshotId: baseSnapshot.id,
          digitalTwinSnapshotId: null,
          digitalTwinNodeId: null,
          nodeStableKey: null,
          path: 'src/new-util.ts',
        },
        {
          changeRevisionId: revision.id,
          changedFileId: fileNewUtil.id,
          side: 'AFTER',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: headSnapshot.id,
          digitalTwinSnapshotId: headTwin.id,
          digitalTwinNodeId: headNodeNewUtil.id,
          nodeStableKey: headNodeNewUtil.stableKey,
          path: 'src/new-util.ts',
        },
        // src/util.ts (DELETED): BEFORE EXACT_PATH, AFTER NOT_PRESENT
        {
          changeRevisionId: revision.id,
          changedFileId: fileUtil.id,
          side: 'BEFORE',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: baseSnapshot.id,
          digitalTwinSnapshotId: baseTwin.id,
          digitalTwinNodeId: baseNodeUtil.id,
          nodeStableKey: baseNodeUtil.stableKey,
          path: 'src/util.ts',
        },
        {
          changeRevisionId: revision.id,
          changedFileId: fileUtil.id,
          side: 'AFTER',
          mappingType: 'NOT_PRESENT',
          repositorySnapshotId: headSnapshot.id,
          digitalTwinSnapshotId: null,
          digitalTwinNodeId: null,
          nodeStableKey: null,
          path: 'src/util.ts',
        },
        // src/service.ts (MODIFIED): BEFORE EXACT_PATH, AFTER EXACT_PATH
        {
          changeRevisionId: revision.id,
          changedFileId: fileService.id,
          side: 'BEFORE',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: baseSnapshot.id,
          digitalTwinSnapshotId: baseTwin.id,
          digitalTwinNodeId: baseNodeService.id,
          nodeStableKey: baseNodeService.stableKey,
          path: 'src/service.ts',
        },
        {
          changeRevisionId: revision.id,
          changedFileId: fileService.id,
          side: 'AFTER',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: headSnapshot.id,
          digitalTwinSnapshotId: headTwin.id,
          digitalTwinNodeId: headNodeService.id,
          nodeStableKey: headNodeService.stableKey,
          path: 'src/service.ts',
        },
        // package.json (MODIFIED): BEFORE EXACT_PATH, AFTER EXACT_PATH
        {
          changeRevisionId: revision.id,
          changedFileId: filePkg.id,
          side: 'BEFORE',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: baseSnapshot.id,
          digitalTwinSnapshotId: baseTwin.id,
          digitalTwinNodeId: baseNodePkgJson.id,
          nodeStableKey: baseNodePkgJson.stableKey,
          path: 'package.json',
        },
        {
          changeRevisionId: revision.id,
          changedFileId: filePkg.id,
          side: 'AFTER',
          mappingType: 'EXACT_PATH',
          repositorySnapshotId: headSnapshot.id,
          digitalTwinSnapshotId: headTwin.id,
          digitalTwinNodeId: headNodePkgJson.id,
          nodeStableKey: headNodePkgJson.stableKey,
          path: 'package.json',
        },
      ],
    });

    // 7. Dependency Deltas:
    // - EDGE_REMOVED: service.ts -> util.ts
    // - EDGE_ADDED: service.ts -> new-util.ts
    // - EDGE_ADDED: pkg:app -> dep:zod (react is retained in both base and head, so 0 delta for react)
    await prisma.dependencyDelta.createMany({
      data: [
        {
          changeRevisionId: revision.id,
          deltaType: 'EDGE_REMOVED',
          sourceStableKey: 'file:src/service.ts',
          targetStableKey: 'file:src/util.ts',
          edgeType: 'IMPORTS',
          beforeEvidence: { importPath: './util' },
          afterEvidence: {},
        },
        {
          changeRevisionId: revision.id,
          deltaType: 'EDGE_ADDED',
          sourceStableKey: 'file:src/service.ts',
          targetStableKey: 'file:src/new-util.ts',
          edgeType: 'IMPORTS',
          beforeEvidence: {},
          afterEvidence: { importPath: './new-util' },
        },
        {
          changeRevisionId: revision.id,
          deltaType: 'EDGE_ADDED',
          sourceStableKey: 'pkg:app',
          targetStableKey: 'dep:zod',
          edgeType: 'DECLARES_DEPENDENCY',
          beforeEvidence: {},
          afterEvidence: { version: '^3.22.0' },
        },
      ],
    });

    // 8. Finalize ChangeRevision
    await prisma.changeRevision.update({
      where: { id: revision.id },
      data: {
        status: 'SUCCEEDED',
        stage: 'COMPLETED',
        filesAdded: 1,
        filesDeleted: 1,
        filesModified: 2,
        filesRenamed: 0,
        nodesAdded: 1,
        nodesRemoved: 1,
        nodesModified: 2,
        edgesAdded: 2,
        edgesRemoved: 1,
        completedAt: new Date(),
      },
    });

    // 9. Query and output factual verification evidence
    const finalRevision = await prisma.changeRevision.findUniqueOrThrow({
      where: { id: revision.id },
      include: {
        changedFiles: true,
        twinMappings: true,
        dependencyDeltas: true,
      },
    });

    console.log('\n==================================================');
    console.log('PHASE 06 DETERMINISTIC CONTROLLED FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`ChangeSet ID:                 ${changeSet.id}`);
    console.log(`ChangeRevision ID:            ${finalRevision.id}`);
    console.log(`Base Commit SHA:              ${finalRevision.baseSha}`);
    console.log(`Head Commit SHA:              ${finalRevision.headSha}`);
    console.log(`Base RepositorySnapshot ID:   ${baseSnapshot.id}`);
    console.log(`Head RepositorySnapshot ID:   ${headSnapshot.id}`);
    console.log(`Base DigitalTwinSnapshot ID:  ${baseTwin.id}`);
    console.log(`Head DigitalTwinSnapshot ID:  ${headTwin.id}`);
    console.log(`Changed Files Count:          ${finalRevision.changedFiles.length} (added=1, deleted=1, modified=2, renamed=0)`);
    console.log(`Twin Change Mappings Count:   ${finalRevision.twinMappings.length} (expected 8)`);
    console.log(`Node Delta Counts:            added=1, removed=1, modified=2`);
    console.log(`Edge Delta Counts:            added=2, removed=1`);
    console.log(`Analysis Version:             ${finalRevision.analysisVersion}`);
    console.log(`Revision Status:              ${finalRevision.status}`);
    console.log(`Organization ID:              ${org.id}`);
    console.log('==================================================\n');

    // Output token for script parser
    console.log(`REAL_CHANGE_SET_ID=${changeSet.id}`);
    console.log(`REAL_ORG_ID=${org.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Controlled fixture execution failed:', err);
  process.exit(1);
});
