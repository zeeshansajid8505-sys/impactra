-- CreateEnum
CREATE TYPE "BlastRadiusAnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "BlastRadiusSnapshotSide" AS ENUM ('BASE', 'HEAD');

-- CreateEnum
CREATE TYPE "BlastRadiusImpactClass" AS ENUM ('FIRST_ORDER', 'TRANSITIVE');

-- CreateEnum
CREATE TYPE "BlastRadiusCategory" AS ENUM ('REPOSITORY', 'FILE', 'WORKSPACE_PACKAGE', 'EXTERNAL_DEPENDENCY', 'CONFIG', 'OTHER');

-- CreateTable
CREATE TABLE "blast_radius_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "change_set_id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "base_digital_twin_snapshot_id" TEXT,
    "head_digital_twin_snapshot_id" TEXT,
    "status" "BlastRadiusAnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "analysis_version" TEXT NOT NULL DEFAULT 'blast-radius-v1',
    "max_depth" INTEGER NOT NULL DEFAULT 5,
    "root_count" INTEGER NOT NULL DEFAULT 0,
    "affected_node_count" INTEGER NOT NULL DEFAULT 0,
    "first_order_count" INTEGER NOT NULL DEFAULT 0,
    "transitive_count" INTEGER NOT NULL DEFAULT 0,
    "evidence_path_count" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blast_radius_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_radius_roots" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "twin_change_mapping_id" TEXT,
    "snapshot_side" "BlastRadiusSnapshotSide" NOT NULL,
    "digital_twin_node_id" TEXT,
    "stable_key" TEXT NOT NULL,
    "node_type" "DigitalTwinNodeType" NOT NULL,
    "change_kind" "ChangedFileStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_radius_roots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_radius_findings" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "root_id" TEXT,
    "digital_twin_node_id" TEXT,
    "stable_key" TEXT NOT NULL,
    "node_name" TEXT NOT NULL,
    "node_path" TEXT,
    "node_type" "DigitalTwinNodeType" NOT NULL,
    "category" "BlastRadiusCategory" NOT NULL,
    "impact_class" "BlastRadiusImpactClass" NOT NULL,
    "depth" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_summary" TEXT NOT NULL,
    "snapshot_side" "BlastRadiusSnapshotSide" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_radius_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_radius_evidence_paths" (
    "id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "root_stable_key" TEXT NOT NULL,
    "affected_stable_key" TEXT NOT NULL,
    "snapshot_side" "BlastRadiusSnapshotSide" NOT NULL,
    "depth" INTEGER NOT NULL,
    "path_nodes_json" JSONB NOT NULL,
    "path_edges_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_radius_evidence_paths_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blast_radius_analyses_organization_id_idx" ON "blast_radius_analyses"("organization_id");

-- CreateIndex
CREATE INDEX "blast_radius_analyses_change_set_id_idx" ON "blast_radius_analyses"("change_set_id");

-- CreateIndex
CREATE INDEX "blast_radius_analyses_status_idx" ON "blast_radius_analyses"("status");

-- CreateIndex
CREATE INDEX "blast_radius_analyses_created_at_idx" ON "blast_radius_analyses"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blast_radius_analyses_change_revision_id_analysis_version_key" ON "blast_radius_analyses"("change_revision_id", "analysis_version");

-- CreateIndex
CREATE INDEX "blast_radius_roots_analysis_id_idx" ON "blast_radius_roots"("analysis_id");

-- CreateIndex
CREATE INDEX "blast_radius_roots_stable_key_idx" ON "blast_radius_roots"("stable_key");

-- CreateIndex
CREATE INDEX "blast_radius_roots_digital_twin_node_id_idx" ON "blast_radius_roots"("digital_twin_node_id");

-- CreateIndex
CREATE INDEX "blast_radius_findings_analysis_id_idx" ON "blast_radius_findings"("analysis_id");

-- CreateIndex
CREATE INDEX "blast_radius_findings_impact_class_idx" ON "blast_radius_findings"("impact_class");

-- CreateIndex
CREATE INDEX "blast_radius_findings_category_idx" ON "blast_radius_findings"("category");

-- CreateIndex
CREATE INDEX "blast_radius_findings_depth_idx" ON "blast_radius_findings"("depth");

-- CreateIndex
CREATE UNIQUE INDEX "blast_radius_findings_analysis_id_stable_key_key" ON "blast_radius_findings"("analysis_id", "stable_key");

-- CreateIndex
CREATE INDEX "blast_radius_evidence_paths_analysis_id_idx" ON "blast_radius_evidence_paths"("analysis_id");

-- CreateIndex
CREATE INDEX "blast_radius_evidence_paths_finding_id_idx" ON "blast_radius_evidence_paths"("finding_id");

-- CreateIndex
CREATE INDEX "blast_radius_evidence_paths_root_stable_key_idx" ON "blast_radius_evidence_paths"("root_stable_key");

-- CreateIndex
CREATE INDEX "blast_radius_evidence_paths_affected_stable_key_idx" ON "blast_radius_evidence_paths"("affected_stable_key");

-- AddForeignKey
ALTER TABLE "blast_radius_analyses" ADD CONSTRAINT "blast_radius_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_analyses" ADD CONSTRAINT "blast_radius_analyses_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_analyses" ADD CONSTRAINT "blast_radius_analyses_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_roots" ADD CONSTRAINT "blast_radius_roots_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "blast_radius_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_roots" ADD CONSTRAINT "blast_radius_roots_twin_change_mapping_id_fkey" FOREIGN KEY ("twin_change_mapping_id") REFERENCES "twin_change_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_roots" ADD CONSTRAINT "blast_radius_roots_digital_twin_node_id_fkey" FOREIGN KEY ("digital_twin_node_id") REFERENCES "digital_twin_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_findings" ADD CONSTRAINT "blast_radius_findings_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "blast_radius_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_findings" ADD CONSTRAINT "blast_radius_findings_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "blast_radius_roots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_findings" ADD CONSTRAINT "blast_radius_findings_digital_twin_node_id_fkey" FOREIGN KEY ("digital_twin_node_id") REFERENCES "digital_twin_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_evidence_paths" ADD CONSTRAINT "blast_radius_evidence_paths_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "blast_radius_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_radius_evidence_paths" ADD CONSTRAINT "blast_radius_evidence_paths_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "blast_radius_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
