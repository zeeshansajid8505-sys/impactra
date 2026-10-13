-- CreateEnum
CREATE TYPE "ChangeRevisionStatus" AS ENUM ('QUEUED', 'FETCHING', 'WAITING_FOR_SNAPSHOTS', 'ANALYZING', 'MAPPING_TWIN', 'STORING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangedFileStatus" AS ENUM ('ADDED', 'MODIFIED', 'DELETED', 'RENAMED');

-- CreateEnum
CREATE TYPE "TwinMappingSide" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "TwinMappingType" AS ENUM ('EXACT_PATH', 'RENAMED_PATH', 'NOT_PRESENT');

-- CreateEnum
CREATE TYPE "DependencyDeltaType" AS ENUM ('EDGE_ADDED', 'EDGE_REMOVED');

-- CreateTable
CREATE TABLE "change_sets" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'github',
    "provider_pull_request_id" TEXT NOT NULL,
    "pull_request_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "author_login" TEXT NOT NULL,
    "base_ref" TEXT NOT NULL,
    "head_ref" TEXT NOT NULL,
    "current_base_sha" TEXT NOT NULL,
    "current_head_sha" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "is_merged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_revisions" (
    "id" TEXT NOT NULL,
    "change_set_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "base_sha" TEXT NOT NULL,
    "head_sha" TEXT NOT NULL,
    "base_snapshot_id" TEXT,
    "head_snapshot_id" TEXT,
    "analysis_version" TEXT NOT NULL DEFAULT 'change-analysis-v1',
    "status" "ChangeRevisionStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "files_added" INTEGER NOT NULL DEFAULT 0,
    "files_modified" INTEGER NOT NULL DEFAULT 0,
    "files_deleted" INTEGER NOT NULL DEFAULT 0,
    "files_renamed" INTEGER NOT NULL DEFAULT 0,
    "nodes_added" INTEGER NOT NULL DEFAULT 0,
    "nodes_removed" INTEGER NOT NULL DEFAULT 0,
    "nodes_modified" INTEGER NOT NULL DEFAULT 0,
    "edges_added" INTEGER NOT NULL DEFAULT 0,
    "edges_removed" INTEGER NOT NULL DEFAULT 0,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "changed_files" (
    "id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "old_path" TEXT,
    "new_path" TEXT,
    "status" "ChangedFileStatus" NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "changes" INTEGER NOT NULL DEFAULT 0,
    "patch_available" BOOLEAN NOT NULL DEFAULT false,
    "patch_truncated" BOOLEAN NOT NULL DEFAULT false,
    "binary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changed_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twin_change_mappings" (
    "id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "changed_file_id" TEXT NOT NULL,
    "side" "TwinMappingSide" NOT NULL,
    "mapping_type" "TwinMappingType" NOT NULL,
    "repository_snapshot_id" TEXT,
    "digital_twin_snapshot_id" TEXT,
    "digital_twin_node_id" TEXT,
    "node_stable_key" TEXT,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twin_change_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_deltas" (
    "id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "delta_type" "DependencyDeltaType" NOT NULL,
    "source_stable_key" TEXT NOT NULL,
    "target_stable_key" TEXT NOT NULL,
    "edge_type" "DigitalTwinEdgeType" NOT NULL,
    "before_evidence" JSONB DEFAULT '{}',
    "after_evidence" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependency_deltas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "change_sets_repository_connection_id_pull_request_number_key" ON "change_sets"("repository_connection_id", "pull_request_number");

-- CreateIndex
CREATE UNIQUE INDEX "change_sets_repository_connection_id_provider_pull_request_id_key" ON "change_sets"("repository_connection_id", "provider_pull_request_id");

-- CreateIndex
CREATE INDEX "change_sets_organization_id_idx" ON "change_sets"("organization_id");

-- CreateIndex
CREATE INDEX "change_sets_repository_connection_id_idx" ON "change_sets"("repository_connection_id");

-- CreateIndex
CREATE INDEX "change_sets_state_idx" ON "change_sets"("state");

-- CreateIndex
CREATE UNIQUE INDEX "change_revisions_change_set_id_base_sha_head_sha_analysis_v_key" ON "change_revisions"("change_set_id", "base_sha", "head_sha", "analysis_version");

-- CreateIndex
CREATE INDEX "change_revisions_change_set_id_idx" ON "change_revisions"("change_set_id");

-- CreateIndex
CREATE INDEX "change_revisions_organization_id_idx" ON "change_revisions"("organization_id");

-- CreateIndex
CREATE INDEX "change_revisions_repository_connection_id_idx" ON "change_revisions"("repository_connection_id");

-- CreateIndex
CREATE INDEX "change_revisions_status_idx" ON "change_revisions"("status");

-- CreateIndex
CREATE INDEX "change_revisions_base_sha_idx" ON "change_revisions"("base_sha");

-- CreateIndex
CREATE INDEX "change_revisions_head_sha_idx" ON "change_revisions"("head_sha");

-- CreateIndex: Partial Unique Index enforcing single active revision per ChangeSet
CREATE UNIQUE INDEX "change_revisions_active_unique" ON "change_revisions"("change_set_id")
WHERE "status" IN ('QUEUED', 'FETCHING', 'WAITING_FOR_SNAPSHOTS', 'ANALYZING', 'MAPPING_TWIN', 'STORING');

-- CreateIndex
CREATE INDEX "changed_files_change_revision_id_idx" ON "changed_files"("change_revision_id");

-- CreateIndex
CREATE INDEX "changed_files_status_idx" ON "changed_files"("status");

-- CreateIndex
CREATE INDEX "twin_change_mappings_change_revision_id_idx" ON "twin_change_mappings"("change_revision_id");

-- CreateIndex
CREATE INDEX "twin_change_mappings_changed_file_id_idx" ON "twin_change_mappings"("changed_file_id");

-- CreateIndex
CREATE INDEX "twin_change_mappings_digital_twin_node_id_idx" ON "twin_change_mappings"("digital_twin_node_id");

-- CreateIndex
CREATE INDEX "twin_change_mappings_side_idx" ON "twin_change_mappings"("side");

-- CreateIndex
CREATE INDEX "dependency_deltas_change_revision_id_idx" ON "dependency_deltas"("change_revision_id");

-- CreateIndex
CREATE INDEX "dependency_deltas_delta_type_idx" ON "dependency_deltas"("delta_type");

-- CreateIndex
CREATE INDEX "dependency_deltas_source_stable_key_idx" ON "dependency_deltas"("source_stable_key");

-- CreateIndex
CREATE INDEX "dependency_deltas_target_stable_key_idx" ON "dependency_deltas"("target_stable_key");

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_revisions" ADD CONSTRAINT "change_revisions_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_revisions" ADD CONSTRAINT "change_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_revisions" ADD CONSTRAINT "change_revisions_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_revisions" ADD CONSTRAINT "change_revisions_base_snapshot_id_fkey" FOREIGN KEY ("base_snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_revisions" ADD CONSTRAINT "change_revisions_head_snapshot_id_fkey" FOREIGN KEY ("head_snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "changed_files" ADD CONSTRAINT "changed_files_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_change_mappings" ADD CONSTRAINT "twin_change_mappings_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_change_mappings" ADD CONSTRAINT "twin_change_mappings_changed_file_id_fkey" FOREIGN KEY ("changed_file_id") REFERENCES "changed_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twin_change_mappings" ADD CONSTRAINT "twin_change_mappings_digital_twin_node_id_fkey" FOREIGN KEY ("digital_twin_node_id") REFERENCES "digital_twin_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_deltas" ADD CONSTRAINT "dependency_deltas_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
