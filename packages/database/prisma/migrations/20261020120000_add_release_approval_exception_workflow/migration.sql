-- CreateEnum
CREATE TYPE "ReleaseApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReleaseApprovalResolution" AS ENUM ('APPROVE', 'REJECT', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ReleaseApprovalEventType" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXCEPTION_GRANTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "release_approval_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "repository_connection_id" TEXT NOT NULL,
    "change_set_id" TEXT NOT NULL,
    "change_revision_id" TEXT NOT NULL,
    "release_safety_assessment_id" TEXT NOT NULL,
    "status" "ReleaseApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution" "ReleaseApprovalResolution",
    "reason" TEXT,
    "exception_granted" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_approval_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "approval_request_id" TEXT NOT NULL,
    "event_type" "ReleaseApprovalEventType" NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "previous_status" "ReleaseApprovalStatus",
    "new_status" "ReleaseApprovalStatus" NOT NULL,
    "reason" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_approval_requests_release_safety_assessment_id_key" ON "release_approval_requests"("release_safety_assessment_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_organization_id_idx" ON "release_approval_requests"("organization_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_repository_connection_id_idx" ON "release_approval_requests"("repository_connection_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_change_set_id_idx" ON "release_approval_requests"("change_set_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_change_revision_id_idx" ON "release_approval_requests"("change_revision_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_status_idx" ON "release_approval_requests"("status");

-- CreateIndex
CREATE INDEX "release_approval_requests_requested_by_user_id_idx" ON "release_approval_requests"("requested_by_user_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_resolved_by_user_id_idx" ON "release_approval_requests"("resolved_by_user_id");

-- CreateIndex
CREATE INDEX "release_approval_requests_created_at_idx" ON "release_approval_requests"("created_at");

-- CreateIndex
CREATE INDEX "release_approval_events_organization_id_idx" ON "release_approval_events"("organization_id");

-- CreateIndex
CREATE INDEX "release_approval_events_approval_request_id_idx" ON "release_approval_events"("approval_request_id");

-- CreateIndex
CREATE INDEX "release_approval_events_event_type_idx" ON "release_approval_events"("event_type");

-- CreateIndex
CREATE INDEX "release_approval_events_actor_user_id_idx" ON "release_approval_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "release_approval_events_created_at_idx" ON "release_approval_events"("created_at");

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_repository_connection_id_fkey" FOREIGN KEY ("repository_connection_id") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_change_set_id_fkey" FOREIGN KEY ("change_set_id") REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_change_revision_id_fkey" FOREIGN KEY ("change_revision_id") REFERENCES "change_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_release_safety_assessment_id_fkey" FOREIGN KEY ("release_safety_assessment_id") REFERENCES "release_safety_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_requests" ADD CONSTRAINT "release_approval_requests_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_events" ADD CONSTRAINT "release_approval_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_events" ADD CONSTRAINT "release_approval_events_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "release_approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_approval_events" ADD CONSTRAINT "release_approval_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
