-- CreateEnum
CREATE TYPE "ReleaseSafetyAssessmentStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReleaseSafetyDecision" AS ENUM ('PASS', 'REVIEW_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReleaseRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReleaseSafetySignalSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReleaseSafetySignalCategory" AS ENUM ('CHANGE_SIZE', 'BLAST_RADIUS', 'DEPENDENCY', 'ARCHITECTURE', 'ANALYSIS_QUALITY');

-- CreateTable
CREATE TABLE "release_safety_assessments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "change_set_id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "blast_radius_analysis_id" TEXT NOT NULL,
    "status" "ReleaseSafetyAssessmentStatus" NOT NULL DEFAULT 'QUEUED',
    "policy_version" TEXT NOT NULL DEFAULT 'impactra-release-safety-v1',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "risk_level" "ReleaseRiskLevel" NOT NULL DEFAULT 'LOW',
    "decision" "ReleaseSafetyDecision" NOT NULL DEFAULT 'PASS',
    "signal_count" INTEGER NOT NULL DEFAULT 0,
    "blocking_signal_count" INTEGER NOT NULL DEFAULT 0,
    "review_signal_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_safety_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_safety_signals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "category" "ReleaseSafetySignalCategory" NOT NULL,
    "severity" "ReleaseSafetySignalSeverity" NOT NULL,
    "score_delta" INTEGER NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "evidence_reference_id" TEXT,
    "evidence_stable_key" TEXT,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_safety_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_safety_assessments_change_revision_id_blast_radius_a_key" ON "release_safety_assessments"("change_revision_id", "blast_radius_analysis_id", "policy_version");

-- CreateIndex
CREATE INDEX "release_safety_assessments_organization_id_idx" ON "release_safety_assessments"("organization_id");

-- CreateIndex
CREATE INDEX "release_safety_assessments_change_set_id_idx" ON "release_safety_assessments"("change_set_id");

-- CreateIndex
CREATE INDEX "release_safety_assessments_change_revision_id_idx" ON "release_safety_assessments"("change_revision_id");

-- CreateIndex
CREATE INDEX "release_safety_assessments_blast_radius_analysis_id_idx" ON "release_safety_assessments"("blast_radius_analysis_id");

-- CreateIndex
CREATE INDEX "release_safety_assessments_status_idx" ON "release_safety_assessments"("status");

-- CreateIndex
CREATE INDEX "release_safety_assessments_decision_idx" ON "release_safety_assessments"("decision");

-- CreateIndex
CREATE INDEX "release_safety_assessments_created_at_idx" ON "release_safety_assessments"("created_at");

-- CreateIndex
CREATE INDEX "release_safety_signals_organization_id_idx" ON "release_safety_signals"("organization_id");

-- CreateIndex
CREATE INDEX "release_safety_signals_assessment_id_idx" ON "release_safety_signals"("assessment_id");

-- CreateIndex
CREATE INDEX "release_safety_signals_rule_id_idx" ON "release_safety_signals"("rule_id");

-- CreateIndex
CREATE INDEX "release_safety_signals_severity_idx" ON "release_safety_signals"("severity");

-- CreateIndex
CREATE INDEX "release_safety_signals_category_idx" ON "release_safety_signals"("category");

-- AddForeignKey
ALTER TABLE "release_safety_assessments" ADD CONSTRAINT "release_safety_assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_safety_assessments" ADD CONSTRAINT "release_safety_assessments_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_safety_assessments" ADD CONSTRAINT "release_safety_assessments_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_safety_assessments" ADD CONSTRAINT "release_safety_assessments_blast_radius_analysis_id_fkey" FOREIGN KEY ("blast_radius_analysis_id") REFERENCES "blast_radius_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_safety_signals" ADD CONSTRAINT "release_safety_signals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_safety_signals" ADD CONSTRAINT "release_safety_signals_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "release_safety_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
