-- CreateEnum
CREATE TYPE "RepositoryIngestionStatus" AS ENUM ('QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DigitalTwinNodeType" AS ENUM ('REPOSITORY', 'FILE', 'WORKSPACE_PACKAGE', 'EXTERNAL_DEPENDENCY', 'CONFIG');

-- CreateEnum
CREATE TYPE "DigitalTwinEdgeType" AS ENUM ('CONTAINS', 'IMPORTS', 'DECLARES_DEPENDENCY', 'WORKSPACE_DEPENDS_ON');

-- CreateEnum
CREATE TYPE "RepositoryFileCategory" AS ENUM ('SOURCE_CODE', 'CONFIGURATION', 'DOCUMENTATION', 'TEST', 'BUILD_SYSTEM', 'DATA', 'BINARY', 'OTHER');

-- CreateTable
CREATE TABLE "repository_ingestions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "target_ref" TEXT NOT NULL DEFAULT 'main',
    "commit_sha" TEXT,
    "status" "RepositoryIngestionStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_ingestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "ingestion_id" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "source_provider" TEXT NOT NULL DEFAULT 'github',
    "parser_version" TEXT NOT NULL DEFAULT 'digital-twin-parser-v1',
    "artifact_key" TEXT,
    "artifact_sha256" TEXT,
    "source_bytes" INTEGER NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_file_inventories" (
    "id" TEXT NOT NULL,
    "repository_snapshot_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "language" TEXT,
    "is_binary" BOOLEAN NOT NULL DEFAULT false,
    "category" "RepositoryFileCategory" NOT NULL DEFAULT 'SOURCE_CODE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_file_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_twin_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "repository_snapshot_id" TEXT NOT NULL,
    "twin_version" TEXT NOT NULL DEFAULT 'digital-twin-v1',
    "node_count" INTEGER NOT NULL DEFAULT 0,
    "edge_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_twin_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_twin_nodes" (
    "id" TEXT NOT NULL,
    "digital_twin_snapshot_id" TEXT NOT NULL,
    "stable_key" TEXT NOT NULL,
    "type" "DigitalTwinNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_twin_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_twin_edges" (
    "id" TEXT NOT NULL,
    "digital_twin_snapshot_id" TEXT NOT NULL,
    "source_node_id" TEXT NOT NULL,
    "target_node_id" TEXT NOT NULL,
    "type" "DigitalTwinEdgeType" NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_twin_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_ingestions_organization_id_idx" ON "repository_ingestions"("organization_id");

-- CreateIndex
CREATE INDEX "repository_ingestions_repository_connection_id_idx" ON "repository_ingestions"("repository_connection_id");

-- CreateIndex
CREATE INDEX "repository_ingestions_status_idx" ON "repository_ingestions"("status");

-- CreateIndex
CREATE INDEX "repository_ingestions_created_at_idx" ON "repository_ingestions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "repository_ingestions_active_unique" ON "repository_ingestions"("repository_connection_id") WHERE "status" IN ('QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING');

-- CreateIndex
CREATE UNIQUE INDEX "repository_snapshots_repository_connection_id_commit_sha_parser_version_key" ON "repository_snapshots"("repository_connection_id", "commit_sha", "parser_version");

-- CreateIndex
CREATE INDEX "repository_snapshots_organization_id_idx" ON "repository_snapshots"("organization_id");

-- CreateIndex
CREATE INDEX "repository_snapshots_repository_connection_id_idx" ON "repository_snapshots"("repository_connection_id");

-- CreateIndex
CREATE INDEX "repository_snapshots_commit_sha_idx" ON "repository_snapshots"("commit_sha");

-- CreateIndex
CREATE UNIQUE INDEX "repository_file_inventories_repository_snapshot_id_path_key" ON "repository_file_inventories"("repository_snapshot_id", "path");

-- CreateIndex
CREATE INDEX "repository_file_inventories_repository_snapshot_id_idx" ON "repository_file_inventories"("repository_snapshot_id");

-- CreateIndex
CREATE INDEX "repository_file_inventories_language_idx" ON "repository_file_inventories"("language");

-- CreateIndex
CREATE INDEX "repository_file_inventories_category_idx" ON "repository_file_inventories"("category");

-- CreateIndex
CREATE UNIQUE INDEX "digital_twin_snapshots_repository_snapshot_id_key" ON "digital_twin_snapshots"("repository_snapshot_id");

-- CreateIndex
CREATE INDEX "digital_twin_snapshots_organization_id_idx" ON "digital_twin_snapshots"("organization_id");

-- CreateIndex
CREATE INDEX "digital_twin_snapshots_repository_connection_id_idx" ON "digital_twin_snapshots"("repository_connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "digital_twin_nodes_digital_twin_snapshot_id_stable_key_key" ON "digital_twin_nodes"("digital_twin_snapshot_id", "stable_key");

-- CreateIndex
CREATE INDEX "digital_twin_nodes_digital_twin_snapshot_id_idx" ON "digital_twin_nodes"("digital_twin_snapshot_id");

-- CreateIndex
CREATE INDEX "digital_twin_nodes_type_idx" ON "digital_twin_nodes"("type");

-- CreateIndex
CREATE INDEX "digital_twin_nodes_stable_key_idx" ON "digital_twin_nodes"("stable_key");

-- CreateIndex
CREATE UNIQUE INDEX "digital_twin_edges_digital_twin_snapshot_id_source_node_id_target_node_id_type_key" ON "digital_twin_edges"("digital_twin_snapshot_id", "source_node_id", "target_node_id", "type");

-- CreateIndex
CREATE INDEX "digital_twin_edges_digital_twin_snapshot_id_idx" ON "digital_twin_edges"("digital_twin_snapshot_id");

-- CreateIndex
CREATE INDEX "digital_twin_edges_source_node_id_idx" ON "digital_twin_edges"("source_node_id");

-- CreateIndex
CREATE INDEX "digital_twin_edges_target_node_id_idx" ON "digital_twin_edges"("target_node_id");

-- CreateIndex
CREATE INDEX "digital_twin_edges_type_idx" ON "digital_twin_edges"("type");

-- AddForeignKey
ALTER TABLE "repository_ingestions" ADD CONSTRAINT "repository_ingestions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_ingestions" ADD CONSTRAINT "repository_ingestions_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_ingestions" ADD CONSTRAINT "repository_ingestions_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_ingestion_id_fkey" FOREIGN KEY ("ingestion_id") REFERENCES "repository_ingestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_file_inventories" ADD CONSTRAINT "repository_file_inventories_repository_snapshot_id_fkey" FOREIGN KEY ("repository_snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_snapshots" ADD CONSTRAINT "digital_twin_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_snapshots" ADD CONSTRAINT "digital_twin_snapshots_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_snapshots" ADD CONSTRAINT "digital_twin_snapshots_repository_snapshot_id_fkey" FOREIGN KEY ("repository_snapshot_id") REFERENCES "repository_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_nodes" ADD CONSTRAINT "digital_twin_nodes_digital_twin_snapshot_id_fkey" FOREIGN KEY ("digital_twin_snapshot_id") REFERENCES "digital_twin_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_edges" ADD CONSTRAINT "digital_twin_edges_digital_twin_snapshot_id_fkey" FOREIGN KEY ("digital_twin_snapshot_id") REFERENCES "digital_twin_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_edges" ADD CONSTRAINT "digital_twin_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "digital_twin_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_twin_edges" ADD CONSTRAINT "digital_twin_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "digital_twin_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
