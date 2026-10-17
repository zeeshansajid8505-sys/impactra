import { PrismaClient, Prisma } from '@impactra/database';
import { ReleaseSafetyRuleEngineService } from '../src/release-safety/services/release-safety-rule-engine.service';
import { ReleaseSafetyScoringService } from '../src/release-safety/services/release-safety-scoring.service';
import {
  EvaluationEvidenceInput,
  RELEASE_SAFETY_POLICY_VERSION,
} from '../src/release-safety/policy/release-safety-policy';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const ruleEngine = new ReleaseSafetyRuleEngineService();
  const scoringService = new ReleaseSafetyScoringService();

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

    // 2. Locate Blast Radius Analysis for this revision
    const blastAnalysis = await prisma.blastRadiusAnalysis.findFirst({
      where: {
        changeRevisionId: revision.id,
        status: 'SUCCEEDED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!blastAnalysis) {
      console.error(
        'ERROR: Fixture blast radius analysis not found. Run run-blast-radius-fixture.ts first.',
      );
      process.exit(1);
    }

    // 3. Clean previous release safety assessments for this revision
    await prisma.releaseSafetyAssessment.deleteMany({
      where: { changeRevisionId: revision.id },
    });

    // 4. Load evidence from database
    const [changedFiles, dependencyDeltas, findings] = await Promise.all([
      prisma.changedFile.findMany({
        where: { changeRevisionId: revision.id },
        select: {
          id: true,
          newPath: true,
          oldPath: true,
          status: true,
          additions: true,
          deletions: true,
          changes: true,
        },
      }),
      prisma.dependencyDelta.findMany({
        where: { changeRevisionId: revision.id },
        select: {
          id: true,
          deltaType: true,
          sourceStableKey: true,
          targetStableKey: true,
          edgeType: true,
        },
      }),
      prisma.blastRadiusFinding.findMany({
        where: { analysisId: blastAnalysis.id },
        select: {
          id: true,
          stableKey: true,
          nodeName: true,
          nodePath: true,
          nodeType: true,
          category: true,
          impactClass: true,
          depth: true,
        },
      }),
    ]);

    const evidence: EvaluationEvidenceInput = {
      changeRevision: {
        id: revision.id,
        filesAdded: revision.filesAdded,
        filesModified: revision.filesModified,
        filesDeleted: revision.filesDeleted,
        filesRenamed: revision.filesRenamed,
      },
      changedFiles,
      dependencyDeltas,
      blastRadiusAnalysis: {
        id: blastAnalysis.id,
        maxDepth: blastAnalysis.maxDepth,
        rootCount: blastAnalysis.rootCount,
        affectedNodeCount: blastAnalysis.affectedNodeCount,
        firstOrderCount: blastAnalysis.firstOrderCount,
        transitiveCount: blastAnalysis.transitiveCount,
        truncated: blastAnalysis.truncated,
      },
      blastRadiusFindings: findings,
    };

    // 5. Evaluate rules and scoring
    const signals = ruleEngine.evaluateRules(evidence);
    const scoring = scoringService.calculateScore(signals);

    // Repeatability verification: ensure re-evaluation produces identical output
    const signalsRepeat = ruleEngine.evaluateRules(evidence);
    const scoringRepeat = scoringService.calculateScore(signalsRepeat);
    if (
      scoring.score !== scoringRepeat.score ||
      scoring.decision !== scoringRepeat.decision ||
      signals.length !== signalsRepeat.length
    ) {
      console.error('FATAL: Release safety evaluation is not deterministic!');
      process.exit(1);
    }

    // 6. Persist Assessment and Signals in transaction
    const assessment = await prisma.$transaction(async (tx) => {
      const createdAssessment = await tx.releaseSafetyAssessment.create({
        data: {
          organizationId: org.id,
          changeSetId: changeSet.id,
          changeRevisionId: revision.id,
          blastRadiusAnalysisId: blastAnalysis.id,
          status: 'SUCCEEDED',
          policyVersion: RELEASE_SAFETY_POLICY_VERSION,
          riskScore: scoring.score,
          riskLevel: scoring.riskLevel,
          decision: scoring.decision,
          signalCount: scoring.totalSignals,
          blockingSignalCount: scoring.blockingSignalsCount,
          reviewSignalCount: scoring.reviewSignalsCount,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      if (signals.length > 0) {
        await tx.releaseSafetySignal.createMany({
          data: signals.map((s) => ({
            organizationId: org.id,
            assessmentId: createdAssessment.id,
            ruleId: s.ruleId,
            ruleVersion: s.ruleVersion,
            category: s.category,
            severity: s.severity,
            scoreDelta: s.scoreDelta,
            blocking: s.blocking,
            requiresReview: s.requiresReview,
            title: s.title,
            description: s.description,
            evidenceType: s.evidenceType,
            evidenceReferenceId: s.evidenceReferenceId,
            evidenceStableKey: s.evidenceStableKey,
            evidenceJson: s.evidenceJson as Prisma.InputJsonValue,
          })),
        });
      }

      return createdAssessment;
    });

    console.log('\n==================================================');
    console.log('PHASE 08 DETERMINISTIC RELEASE SAFETY FIXTURE EVIDENCE');
    console.log('==================================================');
    console.log(`ReleaseSafetyAssessment ID:   ${assessment.id}`);
    console.log(`ChangeSet ID:                 ${changeSet.id}`);
    console.log(`ChangeRevision ID:            ${revision.id}`);
    console.log(`BlastRadiusAnalysis ID:       ${blastAnalysis.id}`);
    console.log(`Policy Version:               ${assessment.policyVersion}`);
    console.log(`Risk Score:                   ${assessment.riskScore}/100`);
    console.log(`Risk Level:                   ${assessment.riskLevel}`);
    console.log(`Release Decision:             ${assessment.decision}`);
    console.log(`Total Evaluated Signals:      ${signals.length}`);
    console.log(`Blocking Signals:             ${scoring.blockingSignalsCount}`);
    console.log(`Review Signals:               ${scoring.reviewSignalsCount}`);
    console.log(`Status:                       ${assessment.status}`);
    console.log(`Organization ID:              ${org.id}`);
    console.log('==================================================\n');

    // Output tokens for verify script parsing
    console.log(`REAL_RELEASE_SAFETY_ASSESSMENT_ID=${assessment.id}`);
    console.log(`REAL_RELEASE_SAFETY_CHANGE_SET_ID=${changeSet.id}`);
    console.log(`REAL_RELEASE_SAFETY_ORG_ID=${org.id}`);
    console.log(`REAL_RELEASE_SAFETY_SCORE=${assessment.riskScore}`);
    console.log(`REAL_RELEASE_SAFETY_DECISION=${assessment.decision}`);
    console.log(`REAL_RELEASE_SAFETY_RISK_LEVEL=${assessment.riskLevel}`);
    console.log(`REAL_RELEASE_SAFETY_SIGNALS_COUNT=${signals.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Release safety fixture execution failed:', err);
  process.exit(1);
});
