-- CreateEnum
CREATE TYPE "GitHubCheckPublicationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "GitHubCheckConclusion" AS ENUM ('SUCCESS', 'ACTION_REQUIRED', 'FAILURE');

-- CreateTable
CREATE TABLE "github_check_publications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "change_set_id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "release_safety_assessment_id" TEXT NOT NULL,
    "github_installation_id" TEXT NOT NULL,
    "head_sha" TEXT NOT NULL,
    "check_name" TEXT NOT NULL DEFAULT 'Impactra / Release Safety',
    "external_id" TEXT NOT NULL,
    "github_check_run_id" TEXT,
    "remote_check_url" TEXT,
    "status" "GitHubCheckPublicationStatus" NOT NULL DEFAULT 'QUEUED',
    "conclusion" "GitHubCheckConclusion",
    "details_url" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_check_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_check_publications_repository_connection_id_head_sha_check_name_key" ON "github_check_publications"("repository_connection_id", "head_sha", "check_name");

-- CreateIndex
CREATE INDEX "github_check_publications_organization_id_idx" ON "github_check_publications"("organization_id");

-- CreateIndex
CREATE INDEX "github_check_publications_repository_connection_id_idx" ON "github_check_publications"("repository_connection_id");

-- CreateIndex
CREATE INDEX "github_check_publications_change_set_id_idx" ON "github_check_publications"("change_set_id");

-- CreateIndex
CREATE INDEX "github_check_publications_change_revision_id_idx" ON "github_check_publications"("change_revision_id");

-- CreateIndex
CREATE INDEX "github_check_publications_release_safety_assessment_id_idx" ON "github_check_publications"("release_safety_assessment_id");

-- CreateIndex
CREATE INDEX "github_check_publications_status_idx" ON "github_check_publications"("status");

-- CreateIndex
CREATE INDEX "github_check_publications_head_sha_idx" ON "github_check_publications"("head_sha");

-- CreateIndex
CREATE INDEX "github_check_publications_external_id_idx" ON "github_check_publications"("external_id");

-- CreateIndex
CREATE INDEX "github_check_publications_github_check_run_id_idx" ON "github_check_publications"("github_check_run_id");

-- CreateIndex
CREATE INDEX "github_check_publications_created_at_idx" ON "github_check_publications"("created_at");

-- AddForeignKey
ALTER TABLE "github_check_publications" ADD CONSTRAINT "github_check_publications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_check_publications" ADD CONSTRAINT "github_check_publications_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_check_publications" ADD CONSTRAINT "github_check_publications_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_check_publications" ADD CONSTRAINT "github_check_publications_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_check_publications" ADD CONSTRAINT "github_check_publications_release_safety_assessment_id_fkey" FOREIGN KEY ("release_safety_assessment_id") REFERENCES "release_safety_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
