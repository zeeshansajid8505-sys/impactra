# Impactra — Production Deployment & Operations Guide

This guide documents the procedures for deploying, configuring, monitoring, backing up, and maintaining **Impactra v1.0.0** in a production Linux / Docker environment.

---

## 1. System Requirements & Architecture

### Recommended Hardware Specifications
| Workload Scale | Virtual CPUs | RAM | SSD Storage | Network |
|---|:---:|:---:|:---:|:---:|
| **Standard (1–10 repos)** | 4 vCPU | 8 GB | 100 GB NVMe | 1 Gbps |
| **Enterprise (10–100 repos)** | 8 vCPU | 16 GB | 250 GB NVMe | 1 Gbps |
| **High Volume (100+ repos)** | 16 vCPU | 32 GB | 500 GB NVMe | 10 Gbps |

### Operating System & Dependencies
- **OS:** Ubuntu 24.04 LTS (or Debian 12 / Rocky Linux 9)
- **Docker:** Docker Engine 26.x or newer
- **Docker Compose:** Compose V2 (`docker compose` plugin 2.27+)
- **System Memory / Swappiness:** Minimum 4GB virtual swap configured; vm.swappiness=10

---

## 2. Network, Domain & DNS Configuration

### DNS Records
Configure two DNS A/AAAA records pointing to your server's public IP address:

```text
impactra.example.com       A       203.0.113.10
api.impactra.example.com   A       203.0.113.10  (Optional if using path-based /api routing)
```

### Firewall Rules (UFW / Cloud Security Groups)
Allow ingress traffic only on standard web ports:
- **Port 80/tcp:** HTTP (ACME Let's Encrypt validation & HTTP-to-HTTPS redirect)
- **Port 443/tcp:** HTTPS (TLS traffic)
- **Port 22/tcp:** SSH (restricted to administrative IP ranges or VPN)

**Never expose internal ports (3000, 3001, 5432, 6379, 9000, 9001) directly to the public internet.**

---

## 3. GitHub App Production Configuration

Before deploying, configure your GitHub App on GitHub:

1. **GitHub Organization / User Settings** &rarr; **Developer settings** &rarr; **GitHub Apps** &rarr; **New GitHub App**.
2. **App Details:**
   - **GitHub App name:** `Impactra` (or your organization's custom name)
   - **Homepage URL:** `https://impactra.example.com`
3. **User Authorization & Callback:**
   - **Callback URL:** `https://impactra.example.com/api/github/installations/callback`
   - **Setup URL (optional):** `https://impactra.example.com/workspace/repositories`
4. **Webhook Configuration:**
   - **Webhook URL:** `https://impactra.example.com/github/webhooks` (or `https://impactra.example.com/api/github/webhooks`)
   - **Webhook secret:** Generate a high-entropy secret (`openssl rand -hex 32`)
5. **Permissions Required:**
   - **Repository metadata:** Read-only (Mandatory)
   - **Repository contents:** Read-only (Mandatory for source tree and AST parsing)
   - **Pull requests:** Read-only (Mandatory for diff ingestion)
   - **Checks:** Read & Write (Mandatory for publishing `Impactra / Release Safety` Check Runs)
6. **Subscribe to Webhook Events:**
   - `Installation`
   - `Installation repositories`
   - `Pull request`
   - `Check run` (optional)
7. **Generate Private Key:**
   - Generate and download the RSA private key (`.pem` file).
   - Base64-encode the key for the environment variable:
     ```bash
     base64 -w 0 impactra.private-key.pem > private-key.base64
     ```

---

## 4. Production Environment Setup

Clone the repository to your production server:

```bash
mkdir -p /opt/impactra
cd /opt/impactra
git clone https://github.com/impactra/impactra.git .
```

Create `/opt/impactra/.env` by copying `.env.example`:

```bash
cp .env.example .env
chmod 600 .env
```

Populate `.env` with real production credentials:
- `POSTGRES_PASSWORD`: Strong generated password (`openssl rand -hex 24`)
- `STORAGE_SECRET_KEY`: High-entropy storage secret
- `GITHUB_APP_ID`: Your GitHub App ID
- `GITHUB_APP_SLUG`: Your GitHub App Slug
- `GITHUB_APP_PRIVATE_KEY_BASE64`: Contents of `private-key.base64`
- `GITHUB_WEBHOOK_SECRET`: The webhook secret generated in step 3
- `COOKIE_SECURE`: `true`
- `CORS_ORIGIN`: `https://impactra.example.com,https://api.impactra.example.com`

---

## 5. SSL/TLS Certificate Provisioning

### Option A: Automatic HTTPS via Caddy (Recommended for Simplicity)
If deploying with `deploy/caddy/Caddyfile`, Caddy automatically obtains and renews Let's Encrypt / ZeroSSL certificates on ports 80 and 443 with zero manual maintenance.

### Option B: Nginx with Certbot
1. Obtain certificates using Certbot standalone:
   ```bash
   certbot certonly --standalone -d impactra.example.com -d api.impactra.example.com
   ```
2. Link or copy certificates into the named Docker volume:
   ```bash
   docker volume create impactra_nginx_ssl
   cp /etc/letsencrypt/live/impactra.example.com/fullchain.pem /var/lib/docker/volumes/impactra_nginx_ssl/_data/
   cp /etc/letsencrypt/live/impactra.example.com/privkey.pem /var/lib/docker/volumes/impactra_nginx_ssl/_data/
   chmod 600 /var/lib/docker/volumes/impactra_nginx_ssl/_data/privkey.pem
   ```

---

## 6. Production Deployment Execution

### Step 1: Build & Launch Services
```bash
docker compose -f compose.production.yaml up -d --build
```

### Step 2: Apply Database Migrations
Run Prisma migrations inside the production API container:
```bash
docker compose -f compose.production.yaml exec -T impactra-api \
  node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

### Step 3: Verify Container Health & Readiness
```bash
# Check container status
docker compose -f compose.production.yaml ps

# Probe API liveness
curl -fsS https://impactra.example.com/health

# Probe API readiness (verifies Postgres, Redis, Storage)
curl -fsS https://impactra.example.com/ready
```

---

## 7. Monitoring & Observability

### Health Endpoints
- **Liveness:** `GET https://impactra.example.com/health` (Returns HTTP 200 with service uptime).
- **Readiness:** `GET https://impactra.example.com/ready` (Returns HTTP 200 when PostgreSQL, Redis, and Storage are responsive; HTTP 503 if any dependency fails).

### Log Inspection
```bash
# Stream API logs with sanitized credentials
docker compose -f compose.production.yaml logs -f impactra-api

# Stream Web logs
docker compose -f compose.production.yaml logs -f impactra-web

# Stream reverse proxy access and error logs
docker compose -f compose.production.yaml logs -f impactra-proxy
```

---

## 8. Backup Procedures

### PostgreSQL Database Backup
Create a daily automated cron job to dump the database:

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/impactra/postgres"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/impactra_db_$TIMESTAMP.sql.gz"

docker compose -f /opt/impactra/compose.production.yaml exec -T impactra-postgres \
  pg_dump -U impactra_app -d impactra | gzip > "$FILENAME"

# Retain last 30 days
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -delete
```

### Object Storage Backup
If self-hosting MinIO, backup the `impactra_minio_prod_data` volume or synchronize artifacts to an offsite S3-compatible cold storage bucket using Rclone or AWS CLI:

```bash
aws s3 sync s3://impactra-artifacts s3://impactra-offsite-backup/artifacts \
  --endpoint-url http://localhost:9000
```

### Secrets & Configuration Backup
Securely backup `/opt/impactra/.env` into an encrypted password manager or enterprise secrets vault (e.g. HashiCorp Vault, AWS Secrets Manager).

---

## 9. Restore Procedures

### Restoring PostgreSQL Database
1. Stop the application services to prevent active connections:
   ```bash
   docker compose -f compose.production.yaml stop impactra-api impactra-web
   ```
2. Drop existing connections and restore from compressed backup:
   ```bash
   gunzip -c /opt/backups/impactra/postgres/impactra_db_YYYYMMDD_HHMMSS.sql.gz | \
     docker compose -f compose.production.yaml exec -T impactra-postgres \
     psql -U impactra_app -d impactra
   ```
3. Restart application services and verify readiness:
   ```bash
   docker compose -f compose.production.yaml start impactra-api impactra-web
   curl -fsS https://impactra.example.com/ready
   ```

---

## 10. Upgrade & Zero-Downtime Deployment

To deploy a new release:

```bash
# 1. Pull latest release code
git pull origin main

# 2. Rebuild images
docker compose -f compose.production.yaml build

# 3. Apply backward-compatible migrations
docker compose -f compose.production.yaml exec -T impactra-api \
  node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma

# 4. Restart containers with zero-downtime rolling reload
docker compose -f compose.production.yaml up -d --no-deps impactra-api
docker compose -f compose.production.yaml up -d --no-deps impactra-web

# 5. Verify readiness
curl -fsS https://impactra.example.com/ready
```

---

## 11. Rollback Procedure

If an upgrade introduces unexpected behavior:

1. **Revert to Previous Docker Image / Commit:**
   ```bash
   git checkout <previous_stable_commit>
   docker compose -f compose.production.yaml up -d --build
   ```
2. **Database Rollback Considerations:**
   - Because all Impactra migrations are designed to be additive and backward-compatible, rolling back the application code does not require rolling back database schema unless a migration fundamentally altered semantics.
   - If a database restore is strictly required, follow Section 9 (Restore Procedures).
3. **Verify Health:**
   ```bash
   curl -fsS https://impactra.example.com/health
   curl -fsS https://impactra.example.com/ready
   ```

---

## 12. Troubleshooting Common Issues

| Symptom | Probable Cause | Resolution |
|---|---|---|
| `/ready` returns HTTP 503 | Database, Redis, or MinIO container unhealthy | Check `docker compose ps` and container logs. Verify network connectivity. |
| GitHub Webhooks return 401 | `GITHUB_WEBHOOK_SECRET` mismatch | Ensure webhook secret in GitHub App settings exactly matches `.env`. |
| CORS origin error on login | `CORS_ORIGIN` does not match browser domain | Add browser origin (e.g. `https://impactra.example.com`) to `CORS_ORIGIN` in `.env`. |
| Cookies not persisting | `COOKIE_SECURE=true` used on HTTP or missing HTTPS reverse proxy | If testing over HTTP, set `COOKIE_SECURE=false`. In production, ensure Nginx forwards `X-Forwarded-Proto https`. |
| BullMQ jobs stalled | Redis disconnected or memory limit exceeded | Check Redis logs (`docker compose logs impactra-redis`) and restart worker. |
