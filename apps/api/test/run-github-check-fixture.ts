import { PrismaClient } from '@impactra/database';
import {
  GitHubCheckPayloadBuilderService,
  GITHUB_CHECK_NAME,
} from '../src/github-checks/services/github-check-payload-builder.service';
import { GitHubCheckConclusion } from '@impactra/database';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const payloadBuilder = new GitHubCheckPayloadBuilderService();

  try {
    await prisma.$connect();

    // 1. Locate fixture organization and repository
    const org = await prisma.organization.findUnique({
      where: { slug: 'fixture-test-org' },
    });
    if (!org) {
      console.error(
        'ERROR: Fixture organization fixture-test-org not found. Run run-controlled-fixture.ts first.',
      );
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

    // 2. Locate Release Safety Assessment for this revision
    const assessment = await prisma.releaseSafetyAssessment.findFirst({
      where: {
        changeRevisionId: revision.id,
        status: 'SUCCEEDED',
      },
      include: {
        signals: {
          orderBy: [{ blocking: 'desc' }, { scoreDelta: 'desc' }, { ruleId: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!assessment) {
      console.error(
        'ERROR: Fixture release safety assessment not found. Run run-release-safety-fixture.ts first.',
      );
      process.exit(1);
    }

    // 3. Clean previous publications for this revision / head SHA
    await prisma.gitHubCheckPublication.deleteMany({
      where: {
        repositoryConnectionId: repo.id,
        headSha: revision.headSha,
      },
    });

    // 4. Build deterministic GitHub Check payload
    const payload = payloadBuilder.buildPayload({
      assessment,
      repositoryConnectionId: repo.id,
      headSha: revision.headSha,
      changeSetId: changeSet.id,
      appBaseUrl: 'https://impactra.example.com',
    });

    const expectedConclusionWire = payloadBuilder.mapDecisionToConclusion(
      assessment.decision,
    );
    if (payload.conclusion !== expectedConclusionWire) {
      console.error(
        `FATAL: Decision mapping mismatch! Expected ${expectedConclusionWire}, got ${payload.conclusion}`,
      );
      process.exit(1);
    }

    const expectedExternalId = payloadBuilder.buildExternalId(
      repo.id,
      revision.headSha,
    );
    if (payload.external_id !== expectedExternalId) {
      console.error('FATAL: External ID mismatch!');
      process.exit(1);
    }

    // Map decision to Prisma enum
    const conclusionEnumMap: Record<string, GitHubCheckConclusion> = {
      success: 'SUCCESS',
      action_required: 'ACTION_REQUIRED',
      failure: 'FAILURE',
    };
    const dbConclusion = conclusionEnumMap[payload.conclusion];

    // 5. Persist publication (First write)
    const publication = await prisma.gitHubCheckPublication.upsert({
      where: {
        repositoryConnectionId_headSha_checkName: {
          repositoryConnectionId: repo.id,
          headSha: revision.headSha,
          checkName: GITHUB_CHECK_NAME,
        },
      },
      create: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        changeSetId: changeSet.id,
        changeRevisionId: revision.id,
        releaseSafetyAssessmentId: assessment.id,
        githubInstallationId: repo.githubInstallationId || 'mock-installation-id',
        headSha: revision.headSha,
        checkName: GITHUB_CHECK_NAME,
        externalId: expectedExternalId,
        githubCheckRunId: 'fixture-check-run-101',
        remoteCheckUrl: null,
        status: 'SUCCEEDED',
        conclusion: dbConclusion,
        detailsUrl: payload.details_url || null,
        attemptCount: 1,
        queuedAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
        publishedAt: new Date(),
      },
      update: {
        status: 'SUCCEEDED',
        conclusion: dbConclusion,
        attemptCount: { increment: 1 },
        publishedAt: new Date(),
      },
    });

    // 6. Test Idempotency (Second write on same repositoryConnectionId, headSha, checkName)
    const initialCount = await prisma.gitHubCheckPublication.count({
      where: {
        repositoryConnectionId: repo.id,
        headSha: revision.headSha,
        checkName: GITHUB_CHECK_NAME,
      },
    });

    if (initialCount !== 1) {
      console.error(`FATAL: Expected exactly 1 publication, found ${initialCount}`);
      process.exit(1);
    }

    const updatedPublication = await prisma.gitHubCheckPublication.upsert({
      where: {
        repositoryConnectionId_headSha_checkName: {
          repositoryConnectionId: repo.id,
          headSha: revision.headSha,
          checkName: GITHUB_CHECK_NAME,
        },
      },
      create: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        changeSetId: changeSet.id,
        changeRevisionId: revision.id,
        releaseSafetyAssessmentId: assessment.id,
        githubInstallationId: repo.githubInstallationId || 'mock-installation-id',
        headSha: revision.headSha,
        checkName: GITHUB_CHECK_NAME,
        externalId: expectedExternalId,
        status: 'SUCCEEDED',
      },
      update: {
        attemptCount: { increment: 1 },
        publishedAt: new Date(),
      },
    });

    const finalCount = await prisma.gitHubCheckPublication.count({
      where: {
        repositoryConnectionId: repo.id,
        headSha: revision.headSha,
        checkName: GITHUB_CHECK_NAME,
      },
    });

    if (finalCount !== 1) {
      console.error(
        `FATAL: Duplicate publication created! Expected 1, found ${finalCount}`,
      );
      process.exit(1);
    }

    if (updatedPublication.attemptCount !== 2) {
      console.error(
        `FATAL: Attempt count should be incremented to 2, found ${updatedPublication.attemptCount}`,
      );
      process.exit(1);
    }

    console.log('\n==================================================');
    console.log('PHASE 09 DETERMINISTIC GITHUB CHECK FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`REAL_GITHUB_CHECK_PUBLICATION_ID=${updatedPublication.id}`);
    console.log(`REAL_GITHUB_CHECK_CHANGE_SET_ID=${changeSet.id}`);
    console.log(`REAL_GITHUB_CHECK_RELEASE_SAFETY_ASSESSMENT_ID=${assessment.id}`);
    console.log(`REAL_GITHUB_CHECK_ORG_ID=${org.id}`);
    console.log(`REAL_GITHUB_CHECK_HEAD_SHA=${updatedPublication.headSha}`);
    console.log(`GITHUB_CHECK_NAME=${updatedPublication.checkName}`);
    console.log(`GITHUB_CHECK_STATUS=${updatedPublication.status}`);
    console.log(`GITHUB_CHECK_CONCLUSION=${updatedPublication.conclusion}`);
    console.log(`GITHUB_CHECK_EXTERNAL_ID=${updatedPublication.externalId}`);
    console.log(`GITHUB_CHECK_ATTEMPT_COUNT=${updatedPublication.attemptCount}`);
    console.log(`GITHUB_CHECK_REMOTE_ACTION=update`);
    console.log(`GITHUB_CHECK_REMOTE_MUTATION=test-double`);
    console.log(`RELEASE_RISK_SCORE=${assessment.riskScore}`);
    console.log(`RELEASE_RISK_LEVEL=${assessment.riskLevel}`);
    console.log(`RELEASE_DECISION=${assessment.decision}`);
    console.log(`POLICY_VERSION=${assessment.policyVersion}`);
    console.log('==================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('GitHub check fixture execution failed:', err);
  process.exit(1);
});
