import { PrismaClient } from '@impactra/database';
import { ReleaseAuthorizationService } from '../src/release-approval/services/release-authorization.service';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const authService = new ReleaseAuthorizationService();

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
      orderBy: { createdAt: 'desc' },
    });

    if (!assessment) {
      console.error(
        'ERROR: Fixture release safety assessment not found. Run run-release-safety-fixture.ts first.',
      );
      process.exit(1);
    }

    // 3. Locate or create test user for actor
    let user = await prisma.user.findFirst({
      where: {
        memberships: {
          some: { organizationId: org.id },
        },
      },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'governance-fixture@impactra.test',
          name: 'Governance Fixture Admin',
          passwordHash: 'fixture_governance_password_hash_test',
        },
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });
    }

    // 4. Clean previous approval requests and events for this assessment
    const existingReq = await prisma.releaseApprovalRequest.findUnique({
      where: { releaseSafetyAssessmentId: assessment.id },
    });
    if (existingReq) {
      await prisma.releaseApprovalEvent.deleteMany({
        where: { approvalRequestId: existingReq.id },
      });
      await prisma.releaseApprovalRequest.delete({
        where: { id: existingReq.id },
      });
    }

    // 5. Create initial pending request
    const requestReason = 'Controlled release approval request for release governance validation.';
    const createdRequest = await prisma.releaseApprovalRequest.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: repo.id,
        changeSetId: changeSet.id,
        changeRevisionId: revision.id,
        releaseSafetyAssessmentId: assessment.id,
        status: 'PENDING',
        requestedByUserId: user.id,
        requestedAt: new Date(),
        reason: requestReason,
      },
    });

    // Record creation event
    await prisma.releaseApprovalEvent.create({
      data: {
        organizationId: org.id,
        approvalRequestId: createdRequest.id,
        eventType: 'REQUESTED',
        actorUserId: user.id,
        previousStatus: null,
        newStatus: 'PENDING',
        reason: requestReason,
        metadataJson: {},
      },
    });

    // 6. Resolve request (Approve)
    const resolveReason = 'Controlled human approval granted by authorized release engineer.';
    const updatedRequest = await prisma.releaseApprovalRequest.update({
      where: { id: createdRequest.id },
      data: {
        status: 'APPROVED',
        resolution: 'APPROVE',
        resolvedByUserId: user.id,
        resolvedAt: new Date(),
        reason: resolveReason,
      },
    });

    // Record resolution event
    await prisma.releaseApprovalEvent.create({
      data: {
        organizationId: org.id,
        approvalRequestId: createdRequest.id,
        eventType: 'APPROVED',
        actorUserId: user.id,
        previousStatus: 'PENDING',
        newStatus: 'APPROVED',
        reason: resolveReason,
        metadataJson: {},
      },
    });

    // 7. Verify audit events count and order
    const events = await prisma.releaseApprovalEvent.findMany({
      where: { approvalRequestId: updatedRequest.id },
      orderBy: { createdAt: 'asc' },
    });

    if (events.length !== 2) {
      console.error(`FATAL: Expected exactly 2 audit events, found ${events.length}`);
      process.exit(1);
    }

    // 8. Derive effective authorization
    const effectiveAuthorization = authService.deriveEffectiveAuthorization(
      assessment.decision,
      {
        status: updatedRequest.status,
        resolution: updatedRequest.resolution,
      },
    );

    console.log('\n==================================================');
    console.log('PHASE 10 DETERMINISTIC RELEASE APPROVAL FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`REAL_RELEASE_APPROVAL_ID=${updatedRequest.id}`);
    console.log(`REAL_RELEASE_APPROVAL_ASSESSMENT_ID=${assessment.id}`);
    console.log(`REAL_RELEASE_APPROVAL_CHANGE_SET_ID=${changeSet.id}`);
    console.log(`REAL_RELEASE_APPROVAL_ORG_ID=${org.id}`);
    console.log(`RELEASE_APPROVAL_STATUS=${updatedRequest.status}`);
    console.log(`RELEASE_APPROVAL_RESOLUTION=${updatedRequest.resolution}`);
    console.log(`RELEASE_EFFECTIVE_AUTHORIZATION=${effectiveAuthorization}`);
    console.log(`RELEASE_APPROVAL_REASON=${updatedRequest.reason}`);
    console.log(`RELEASE_APPROVAL_EVENTS_COUNT=${events.length}`);
    console.log(`RELEASE_POLICY_DECISION=${assessment.decision}`);
    console.log(`ACTOR_USER_ID=${user.id}`);
    console.log('==================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Release approval fixture execution failed:', err);
  process.exit(1);
});
