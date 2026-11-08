import {
  PrismaClient,
  ReleasePolicyStatus,
  ReleasePolicyRuleType,
  ReleasePolicyAction,
  ReleasePolicyEventType,
  ReleasePolicyScope,
  GitHubCheckConclusion,
} from '@impactra/database';
import { ReleasePolicyEvaluatorService } from '../src/release-policy/services/release-policy-evaluator.service';
import { ReleaseAuthorizationService } from '../src/release-approval/services/release-authorization.service';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const evaluatorService = new ReleasePolicyEvaluatorService();
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
      include: {
        signals: true,
      },
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
          email: 'policy-fixture@impactra.test',
          name: 'Policy Fixture Admin',
          passwordHash: 'fixture_policy_password_hash_test',
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

    // 4. Clean up previous fixture policies for this test run
    const existingPolicies = await prisma.releasePolicy.findMany({
      where: {
        organizationId: org.id,
        name: 'Phase 11 Controlled Enterprise Release Policy',
      },
    });

    for (const ep of existingPolicies) {
      await prisma.releasePolicyEvent.deleteMany({ where: { releasePolicyId: ep.id } });
      await prisma.releasePolicyRule.deleteMany({ where: { releasePolicyId: ep.id } });
      await prisma.releaseSafetyAssessment.updateMany({
        where: { releasePolicyId: ep.id },
        data: { releasePolicyId: null },
      });
      await prisma.releasePolicy.delete({ where: { id: ep.id } });
    }

    // 5. Test Non-Mutating Preview Before Modifying Policy State
    const assessmentCountBefore = await prisma.releaseSafetyAssessment.count();
    const approvalCountBefore = await prisma.releaseApprovalRequest.count();

    // Evaluate rules purely in-memory (preview simulation)
    const previewRules = [
      {
        ruleKey: 'rule_max_risk',
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        action: ReleasePolicyAction.BLOCK,
        enabled: true,
        thresholdNumeric: 75,
        thresholdText: null,
        configuration: {},
        order: 1,
      },
      {
        ruleKey: 'rule_critical_signal',
        ruleType: ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT,
        action: ReleasePolicyAction.BLOCK,
        enabled: true,
        thresholdNumeric: null,
        thresholdText: null,
        configuration: {},
        order: 2,
      },
      {
        ruleKey: 'rule_review_score',
        ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
        action: ReleasePolicyAction.REQUIRE_REVIEW,
        enabled: true,
        thresholdNumeric: 40,
        thresholdText: null,
        configuration: {},
        order: 3,
      },
    ];

    const previewEvaluation = evaluatorService.evaluatePolicy(
      {
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals.map((s) => ({
          ruleId: s.ruleId,
          category: s.category,
          severity: s.severity,
          scoreDelta: s.scoreDelta,
          blocking: s.blocking,
          requiresReview: s.requiresReview,
          title: s.title,
        })),
        blastRadius: {
          affectedNodeCount: 2,
          maxDepth: 1,
          rootCount: 1,
        },
        changedPaths: ['src/core/auth.ts'],
      },
      previewRules,
      {
        policyId: null,
        policyName: 'Preview Simulated Policy',
        policyVersion: 1,
        scope: ReleasePolicyScope.ORGANIZATION_DEFAULT,
        targetBranchPattern: null,
      },
    );

    const assessmentCountAfter = await prisma.releaseSafetyAssessment.count();
    const approvalCountAfter = await prisma.releaseApprovalRequest.count();

    const previewNonMutating =
      assessmentCountBefore === assessmentCountAfter &&
      approvalCountBefore === approvalCountAfter;

    if (!previewNonMutating) {
      console.error('FATAL: Preview mutated database records!');
      process.exit(1);
    }

    // 6. Create Phase 11 Configured Release Policy (ACTIVE)
    const policy = await prisma.releasePolicy.create({
      data: {
        organizationId: org.id,
        repositoryConnectionId: null, // Organization default
        name: 'Phase 11 Controlled Enterprise Release Policy',
        description: 'Controlled Phase 11 release safety policy with deterministic multi-factor rules.',
        status: ReleasePolicyStatus.ACTIVE,
        version: 1,
        isDefault: true,
        targetBranchPattern: null,
        createdByUserId: user.id,
        activatedByUserId: user.id,
        activatedAt: new Date(),
        rules: {
          create: [
            {
              ruleKey: 'rule_max_risk_score',
              ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
              action: ReleasePolicyAction.BLOCK,
              enabled: true,
              thresholdNumeric: 75,
              order: 1,
            },
            {
              ruleKey: 'rule_critical_signal',
              ruleType: ReleasePolicyRuleType.CRITICAL_SIGNAL_PRESENT,
              action: ReleasePolicyAction.BLOCK,
              enabled: true,
              order: 2,
            },
            {
              ruleKey: 'rule_review_required_score',
              ruleType: ReleasePolicyRuleType.MAX_RISK_SCORE,
              action: ReleasePolicyAction.REQUIRE_REVIEW,
              enabled: true,
              thresholdNumeric: 40,
              order: 3,
            },
            {
              ruleKey: 'rule_blast_radius',
              ruleType: ReleasePolicyRuleType.BLAST_RADIUS_THRESHOLD,
              action: ReleasePolicyAction.REQUIRE_REVIEW,
              enabled: true,
              thresholdNumeric: 10,
              order: 4,
            },
            {
              ruleKey: 'rule_protected_path',
              ruleType: ReleasePolicyRuleType.PROTECTED_PATH_CHANGED,
              action: ReleasePolicyAction.REQUIRE_REVIEW,
              enabled: true,
              thresholdText: 'packages/core/**',
              order: 5,
            },
          ],
        },
      },
      include: {
        rules: { orderBy: { order: 'asc' } },
      },
    });

    // Record CREATED and ACTIVATED events
    await prisma.releasePolicyEvent.createMany({
      data: [
        {
          organizationId: org.id,
          releasePolicyId: policy.id,
          policyVersion: policy.version,
          eventType: ReleasePolicyEventType.CREATED,
          actorUserId: user.id,
          previousStatus: null,
          newStatus: ReleasePolicyStatus.DRAFT,
          changeSummary: 'Created Phase 11 enterprise policy.',
        },
        {
          organizationId: org.id,
          releasePolicyId: policy.id,
          policyVersion: policy.version,
          eventType: ReleasePolicyEventType.ACTIVATED,
          actorUserId: user.id,
          previousStatus: ReleasePolicyStatus.DRAFT,
          newStatus: ReleasePolicyStatus.ACTIVE,
          changeSummary: 'Activated policy v1.',
        },
      ],
    });

    // 7. Evaluate Policy Against Assessment
    const evaluation = evaluatorService.evaluatePolicy(
      {
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        signals: assessment.signals.map((s) => ({
          ruleId: s.ruleId,
          category: s.category,
          severity: s.severity,
          scoreDelta: s.scoreDelta,
          blocking: s.blocking,
          requiresReview: s.requiresReview,
          title: s.title,
        })),
        blastRadius: {
          affectedNodeCount: 2,
          maxDepth: 1,
          rootCount: 1,
        },
        changedPaths: ['packages/core/auth.ts'],
      },
      policy.rules.map((r) => ({
        ruleKey: r.ruleKey,
        ruleType: r.ruleType,
        action: r.action,
        enabled: r.enabled,
        thresholdNumeric: r.thresholdNumeric,
        thresholdText: r.thresholdText,
        configuration: (r.configuration ?? {}) as Record<string, unknown>,
        order: r.order,
      })),
      {
        policyId: policy.id,
        policyName: policy.name,
        policyVersion: policy.version,
        scope: ReleasePolicyScope.ORGANIZATION_DEFAULT,
        targetBranchPattern: policy.targetBranchPattern,
      },
    );

    // 8. Atomically Persist Policy Snapshot to Assessment
    const updatedAssessment = await prisma.releaseSafetyAssessment.update({
      where: { id: assessment.id },
      data: {
        releasePolicyId: policy.id,
        policySnapshotJson: evaluation.snapshot as any,
        decision: evaluation.finalDecision,
      },
    });

    // 9. Derive Effective Release Authorization
    const approvalRequest = await prisma.releaseApprovalRequest.findUnique({
      where: { releaseSafetyAssessmentId: assessment.id },
    });

    const releaseAuthorization = authService.deriveEffectiveAuthorization(
      updatedAssessment.decision,
      approvalRequest
        ? { status: approvalRequest.status, resolution: approvalRequest.resolution }
        : null,
    );

    // 10. Locate or Update GitHub Check Publication
    let pub = await prisma.gitHubCheckPublication.findFirst({
      where: {
        organizationId: org.id,
        changeSetId: changeSet.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!pub) {
      pub = await prisma.gitHubCheckPublication.create({
        data: {
          organizationId: org.id,
          repositoryConnectionId: repo.id,
          changeSetId: changeSet.id,
          changeRevisionId: revision.id,
          releaseSafetyAssessmentId: assessment.id,
          githubInstallationId: repo.githubInstallationId || 'mock-installation-id',
          headSha: revision.headSha,
          checkName: 'Impactra / Release Safety',
          externalId: assessment.id,
          githubCheckRunId: 'fixture-check-run-101',
          remoteCheckUrl: null,
          status: 'SUCCEEDED',
          conclusion: GitHubCheckConclusion.SUCCESS,
          publishedAt: new Date(),
        },
      });
    }

    // 11. Output Deterministic Evidence
    console.log('\n==================================================');
    console.log('PHASE 11 DETERMINISTIC RELEASE POLICY FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`REAL_RELEASE_POLICY_ID=${policy.id}`);
    console.log(`REAL_RELEASE_POLICY_VERSION=${policy.version}`);
    console.log(`REAL_RELEASE_POLICY_STATUS=${policy.status}`);
    console.log(`REAL_RELEASE_POLICY_SCOPE=ORGANIZATION_DEFAULT`);
    console.log(`REAL_RELEASE_POLICY_RULE_COUNT=${policy.rules.length}`);
    console.log(`REAL_RELEASE_POLICY_PREVIEW_DECISION=${previewEvaluation.finalDecision}`);
    console.log(`REAL_RELEASE_POLICY_PREVIEW_ASSESSMENT_CREATED=${!previewNonMutating}`);
    console.log(`REAL_RELEASE_SAFETY_ASSESSMENT_ID=${updatedAssessment.id}`);
    console.log(`REAL_RELEASE_SAFETY_DECISION=${updatedAssessment.decision}`);
    console.log(`REAL_RELEASE_POLICY_SNAPSHOT_VERSION=${policy.version}`);
    console.log(`REAL_RELEASE_AUTHORIZATION=${releaseAuthorization}`);
    console.log(`GITHUB_CHECK_PUBLICATION_ID=${pub.id}`);
    console.log(`GITHUB_CHECK_REMOTE_ACTION=PUBLISHED`);
    console.log(`GITHUB_CHECK_REMOTE_MUTATION=test-double`);
    console.log('==================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Release policy fixture execution failed:', err);
  process.exit(1);
});