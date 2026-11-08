-- CreateEnum
CREATE TYPE "ReleasePolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReleasePolicyRuleType" AS ENUM ('MAX_RISK_SCORE', 'MINIMUM_RISK_LEVEL', 'BLAST_RADIUS_THRESHOLD', 'CRITICAL_SIGNAL_PRESENT', 'HIGH_SIGNAL_COUNT', 'PROTECTED_PATH_CHANGED', 'REQUIRE_APPROVAL');

-- CreateEnum
CREATE TYPE "ReleasePolicyAction" AS ENUM ('ALLOW', 'REQUIRE_REVIEW', 'BLOCK');

-- CreateEnum
CREATE TYPE "ReleasePolicyScope" AS ENUM ('REPOSITORY_BRANCH', 'REPOSITORY_DEFAULT', 'ORGANIZATION_BRANCH', 'ORGANIZATION_DEFAULT', 'BUILT_IN_DEFAULT');

-- CreateEnum
CREATE TYPE "ReleasePolicyEventType" AS ENUM ('CREATED', 'UPDATED', 'ACTIVATED', 'SUPERSEDED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "release_safety_assessments" ADD COLUMN "release_policy_id" TEXT,
ADD COLUMN "policy_snapshot_json" JSONB;

-- CreateTable
CREATE TABLE "release_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT,
    "origin_policy_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReleasePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "target_branch_pattern" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "activated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "release_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_policy_rules" (
    "id" TEXT NOT NULL,
    "release_policy_id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_type" "ReleasePolicyRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "severity" "ReleaseSafetySignalSeverity",
    "action" "ReleasePolicyAction" NOT NULL DEFAULT 'REQUIRE_REVIEW',
    "threshold_numeric" DOUBLE PRECISION,
    "threshold_text" TEXT,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_policy_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "release_policy_id" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "event_type" "ReleasePolicyEventType" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "previous_status" "ReleasePolicyStatus",
    "new_status" "ReleasePolicyStatus",
    "change_summary" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_policy_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "release_safety_assessments_release_policy_id_idx" ON "release_safety_assessments"("release_policy_id");

-- CreateIndex
CREATE INDEX "release_policies_organization_id_idx" ON "release_policies"("organization_id");

-- CreateIndex
CREATE INDEX "release_policies_repository_connection_id_idx" ON "release_policies"("repository_connection_id");

-- CreateIndex
CREATE INDEX "release_policies_origin_policy_id_idx" ON "release_policies"("origin_policy_id");

-- CreateIndex
CREATE INDEX "release_policies_status_idx" ON "release_policies"("status");

-- CreateIndex
CREATE INDEX "release_policies_version_idx" ON "release_policies"("version");

-- CreateIndex
CREATE INDEX "release_policies_is_default_idx" ON "release_policies"("is_default");

-- CreateIndex
CREATE INDEX "release_policies_target_branch_pattern_idx" ON "release_policies"("target_branch_pattern");

-- CreateIndex
CREATE INDEX "release_policies_created_by_user_id_idx" ON "release_policies"("created_by_user_id");

-- CreateIndex
CREATE INDEX "release_policies_activated_by_user_id_idx" ON "release_policies"("activated_by_user_id");

-- CreateIndex
CREATE INDEX "release_policies_created_at_idx" ON "release_policies"("created_at");

-- CreateIndex
CREATE INDEX "release_policy_rules_release_policy_id_idx" ON "release_policy_rules"("release_policy_id");

-- CreateIndex
CREATE INDEX "release_policy_rules_rule_type_idx" ON "release_policy_rules"("rule_type");

-- CreateIndex
CREATE INDEX "release_policy_rules_order_idx" ON "release_policy_rules"("order");

-- CreateIndex
CREATE INDEX "release_policy_events_organization_id_idx" ON "release_policy_events"("organization_id");

-- CreateIndex
CREATE INDEX "release_policy_events_release_policy_id_idx" ON "release_policy_events"("release_policy_id");

-- CreateIndex
CREATE INDEX "release_policy_events_event_type_idx" ON "release_policy_events"("event_type");

-- CreateIndex
CREATE INDEX "release_policy_events_actor_user_id_idx" ON "release_policy_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "release_policy_events_created_at_idx" ON "release_policy_events"("created_at");

-- AddForeignKey
ALTER TABLE "release_safety_assessments" ADD CONSTRAINT "release_safety_assessments_release_policy_id_fkey" FOREIGN KEY ("release_policy_id") REFERENCES "release_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policies" ADD CONSTRAINT "release_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policies" ADD CONSTRAINT "release_policies_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policies" ADD CONSTRAINT "release_policies_origin_policy_id_fkey" FOREIGN KEY ("origin_policy_id") REFERENCES "release_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policies" ADD CONSTRAINT "release_policies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policies" ADD CONSTRAINT "release_policies_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policy_rules" ADD CONSTRAINT "release_policy_rules_release_policy_id_fkey" FOREIGN KEY ("release_policy_id") REFERENCES "release_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policy_events" ADD CONSTRAINT "release_policy_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policy_events" ADD CONSTRAINT "release_policy_events_release_policy_id_fkey" FOREIGN KEY ("release_policy_id") REFERENCES "release_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_policy_events" ADD CONSTRAINT "release_policy_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
