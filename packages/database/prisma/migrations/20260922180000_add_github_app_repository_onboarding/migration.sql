-- CreateEnum
CREATE TYPE "GitHubInstallationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "github_installations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "github_installation_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "account_login" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "repository_selection" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "status" "GitHubInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_installation_states" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_installation_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "github_installation_id" TEXT NOT NULL,
    "github_repository_id" TEXT NOT NULL,
    "owner_login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "fork" BOOLEAN NOT NULL DEFAULT false,
    "html_url" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "connected_at" TIMESTAMP(3),
    "disconnected_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "github_delivery_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "github_installation_id" TEXT,
    "organization_id" TEXT,
    "payload_sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_github_installation_id_key" ON "github_installations"("github_installation_id");

-- CreateIndex
CREATE INDEX "github_installations_organization_id_idx" ON "github_installations"("organization_id");

-- CreateIndex
CREATE INDEX "github_installations_status_idx" ON "github_installations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "github_installation_states_state_hash_key" ON "github_installation_states"("state_hash");

-- CreateIndex
CREATE INDEX "github_installation_states_organization_id_idx" ON "github_installation_states"("organization_id");

-- CreateIndex
CREATE INDEX "github_installation_states_user_id_idx" ON "github_installation_states"("user_id");

-- CreateIndex
CREATE INDEX "github_installation_states_expires_at_idx" ON "github_installation_states"("expires_at");

-- CreateIndex
CREATE INDEX "repository_connections_organization_id_idx" ON "repository_connections"("organization_id");

-- CreateIndex
CREATE INDEX "repository_connections_github_installation_id_idx" ON "repository_connections"("github_installation_id");

-- CreateIndex
CREATE INDEX "repository_connections_connected_idx" ON "repository_connections"("connected");

-- CreateIndex
CREATE INDEX "repository_connections_available_idx" ON "repository_connections"("available");

-- CreateIndex
CREATE UNIQUE INDEX "repository_connections_organization_id_github_repository_id_key" ON "repository_connections"("organization_id", "github_repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_webhook_deliveries_github_delivery_id_key" ON "github_webhook_deliveries"("github_delivery_id");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_event_idx" ON "github_webhook_deliveries"("event");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_github_installation_id_idx" ON "github_webhook_deliveries"("github_installation_id");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_organization_id_idx" ON "github_webhook_deliveries"("organization_id");

-- CreateIndex
CREATE INDEX "github_webhook_deliveries_received_at_idx" ON "github_webhook_deliveries"("received_at");

-- AddForeignKey
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_installation_states" ADD CONSTRAINT "github_installation_states_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_installation_states" ADD CONSTRAINT "github_installation_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_github_installation_id_fkey" FOREIGN KEY ("github_installation_id") REFERENCES "github_installations"("github_installation_id") ON DELETE CASCADE ON UPDATE CASCADE;
