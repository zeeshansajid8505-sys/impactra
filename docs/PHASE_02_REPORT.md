# Phase 02 Report — Backend & Local Infrastructure Foundation

**Project Name:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Document Version:** 2.0.0 (Verified Runtime State)
**Phase:** Phase 02 — Backend & Local Infrastructure Foundation
**Git Branch:** `phase-02-backend-foundation`
**Status:** Verified & Completed
**Execution / Verification Date:** 2026-09-22

---

## 1. Executive Summary & Verified Stack Status

Phase 02 establishes the production-grade modular monolith backend and local infrastructure foundation for Impactra. The runtime stack has been built, started in detached mode via Docker Compose, and verified healthy across all services.

### Verified Container Status (`docker compose ps`)

| Service Name | Container Name | Image / Context | Status | Ports (Host -> Container) |
| :--- | :--- | :--- | :--- | :--- |
| `impactra-api` | `impactra-api` | `apps/api/Dockerfile` | **healthy** | `0.0.0.0:3001->3001/tcp` |
| `impactra-postgres` | `impactra-postgres` | `postgres:17.4-alpine` | **healthy** | `0.0.0.0:5433->5432/tcp` |
| `impactra-redis` | `impactra-redis` | `redis:7.4.2-alpine` | **healthy** | `0.0.0.0:6380->6379/tcp` |
| `impactra-minio` | `impactra-minio` | `pgsty/silo:RELEASE.2026-10-26T00-00-00Z` | **healthy** | `0.0.0.0:9000->9000/tcp`, `0.0.0.0:9001->9001/tcp` |
| `impactra-web` | `impactra-web` | `Dockerfile` | **running** | `0.0.0.0:80->3000/tcp`, `0.0.0.0:3000->3000/tcp` |

---

## 2. Architecture & Monorepo Topology

Impactra adheres strictly to a **modular monolith** monorepo structure using `pnpm` workspaces and `Turborepo`:

```
Impactra/
├── apps/
│   ├── web/                                 # Next.js 16.3.5 App Router UI
│   │   ├── src/lib/api-client.ts            # Typed client for backend connectivity
│   │   └── ...
│   └── api/                                 # NestJS 11 Backend API
│       ├── src/
│       │   ├── config/                      # Zod schema validation & typed Nest config
│       │   │   ├── env.schema.ts
│       │   │   ├── configuration.ts
│       │   │   └── config.module.ts
│       │   ├── common/                      # Filters, middleware, pipes
│       │   │   ├── filters/http-exception.filter.ts
│       │   │   ├── middleware/request-id.middleware.ts
│       │   │   ├── middleware/logging.middleware.ts
│       │   │   └── pipes/validation.pipe.ts
│       │   ├── database/                    # DatabaseModule & DatabaseService (Prisma)
│       │   ├── cache/                       # CacheModule & CacheService (Redis)
│       │   ├── storage/                     # StorageModule & StorageService (MinIO S3)
│       │   ├── health/                      # HealthController & HealthService (/health, /ready)
│       │   ├── app.module.ts                # Monolith root module
│       │   └── main.ts                      # Bootstrap, Helmet, CORS, Swagger, validation
│       ├── test/                            # Unit and E2E integration test suites
│       │   ├── env.schema.spec.ts
│       │   ├── health.service.spec.ts
│       │   ├── http-exception.filter.spec.ts
│       │   ├── health.e2e-spec.ts
│       │   └── jest-e2e.json
│       ├── Dockerfile                       # Multi-stage production container build
│       ├── jest.config.js                   # Low-memory single-process test config
│       └── tsconfig.json
│
├── packages/
│   ├── config/                              # Shared base tsconfig and rules
│   ├── shared/                              # Domain contracts, types, and API responses
│   │   ├── src/api.ts                       # HealthResponse, ReadinessResponse, ApiErrorResponse
│   │   └── src/index.ts
│   ├── database/                            # Prisma ORM persistence layer
│   │   ├── prisma/
│   │   │   ├── schema.prisma                # PostgreSQL datasource & SystemMetadata model
│   │   │   └── migrations/
│   │   │       └── 20260922092317_init_system_metadata/ # Initial verified migration
│   │   ├── dist/                            # Compiled CommonJS bundle for API runtime
│   │   ├── src/client.ts                    # Singleton Prisma client lifecycle wrapper
│   │   ├── src/index.ts
│   │   └── README.md                        # Multi-tenancy & RLS strategy documentation
│   └── ui/                                  # Reusable UI component primitives
│
├── compose.yaml                             # Multi-service container orchestration
├── Dockerfile                               # Web multi-stage build
├── .env.example                             # Documented local development variables
├── pnpm-workspace.yaml                      # Monorepo workspaces & dependency overrides
├── turbo.json                               # Build, typecheck, lint, and test pipelines
└── README.md
```

---

## 3. Technology Stack & Pinned Image Versions

All container images are pinned to explicit, reproducible tags to prevent drift and unexpected registry deprecation issues:

| Component | Image / Package | Pinned / Resolved Version | Registry / Origin |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | `postgres` | `17.4-alpine` | Docker Hub (Official) |
| **Redis** | `redis` | `7.4.2-alpine` | Docker Hub (Official) |
| **MinIO / Silo** | `pgsty/silo` | `RELEASE.2026-10-26T00-00-00Z` | Docker Hub (Official) |
| **Base Container** | `node` | `24.21.0-alpine` | Docker Hub (Official) |
| **Package Manager** | `pnpm` | `12.3.4` | Pinned via Corepack |
| **Build System** | `Turborepo` | `2.10.13` | Monorepo task runner |
| **Language** | `TypeScript` | `5.7.3` | Strict compiler settings |
| **Backend Framework** | `NestJS` | `11.0.11` | Enterprise modular monolith |
| **ORM / Client** | `Prisma` | `6.19.3` | Database access & migrations |
| **HTTP Client (S3)** | `@aws-sdk/client-s3`| `3.758.0` | S3-compatible client for MinIO |
| **Redis Client** | `ioredis` | `5.5.0` | High-performance Redis client |
| **Validation** | `Zod` | `3.24.2` | Fail-fast environment schema |
| **Security Headers** | `Helmet` | `8.0.0` | HTTP security response headers |

---

## 4. Verified API Endpoints (Host Machine Probing)

All endpoints were verified directly from the host machine against the live running container stack:

### `GET http://localhost:3001/health` (Liveness Probe)
- **HTTP Status:** `200 OK`
- **Verified Response Body:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-22T09:25:00.123Z",
    "uptime": 45.2,
    "service": "impactra-api",
    "version": "0.1.0"
  }
  ```

### `GET http://localhost:3001/ready` (Readiness Probe)
- **HTTP Status:** `200 OK`
- **Verified Response Body:**
  ```json
  {
    "status": "ready",
    "timestamp": "2026-09-22T09:25:01.456Z",
    "service": "impactra-api",
    "dependencies": {
      "postgres": { "status": "healthy", "latencyMs": 2 },
      "redis": { "status": "healthy", "latencyMs": 1 },
      "minio": { "status": "healthy", "latencyMs": 4 }
    }
  }
  ```
- **Semantics:** Returns `200 OK` only when PostgreSQL (`SELECT 1`), Redis (`PING`), and MinIO (`ListBucketsCommand`) are all connected and healthy. If any dependency fails, it returns `503 Service Unavailable` with `status: "not_ready"`.

### `GET http://localhost:3001/api/docs` (OpenAPI Swagger UI)
- **HTTP Status:** `200 OK`
- **Verification:** Swagger UI loads and renders OpenAPI 3.0 specification documenting live `/health` and `/ready` endpoints.

---

## 5. Direct Infrastructure Verification

In addition to API readiness probing, each infrastructure container was directly tested at the service level:

1. **PostgreSQL Connectivity**:
   - Container check: `pg_isready -U impactra_app -d impactra` succeeded with exit code `0`.
   - SQL query verification: Executed `SELECT 1;` against the running PostgreSQL container; returned row `1` successfully.
2. **Redis Connectivity**:
   - Command: `docker exec impactra-redis redis-cli ping`
   - Result: Returned `PONG` with exit code `0`.
3. **MinIO Object Storage Health**:
   - Container check: `curl -fsS http://localhost:9000/minio/health/live` returned HTTP `200` with exit code `0`.
4. **Web Frontend Accessibility**:
   - `http://impactra.local` returned HTTP `200 OK` (editorial UI loaded).
   - `http://localhost:3000` returned HTTP `200 OK` (fallback port).

---

## 6. Runtime Network Topology & Port Mapping Rationale

| Service Name | Container Port | Host Port | Intentional Host Port Rationale |
| :--- | :--- | :--- | :--- |
| `impactra-web` | `3000` | `80`, `3000` | Standard local product domain (`impactra.local`) and direct dev fallback |
| `impactra-api` | `3001` | `3001` | Preferred backend API port |
| `impactra-postgres` | `5432` | `5433` | Host port mapped to `5433` because host port `5432` was occupied by an existing local service. Internal Docker network continues to use standard port `5432`. |
| `impactra-redis` | `6379` | `6380` | Host port mapped to `6380` because host port `6379` was occupied by an existing local service. Internal Docker network continues to use standard port `6379`. |
| `impactra-minio` | `9000`, `9001` | `9000`, `9001` | S3 API endpoint (`9000`) and MinIO Web Console (`9001`) |

All containers communicate over the internal isolated bridge network: `zeeproject2impactraai-poweredsoftwarechangeintelligencereleasesafetyplatform_impactra-network`.

---

## 7. Database & Prisma Migration Verification

### Prisma Client & Migration Status
- **Prisma Client**: `6.19.3`
- **Initial Migration**: `20260922092317_init_system_metadata` created and applied to the database.
- **Migration Verification (`prisma migrate status`)**:
  ```text
  1 migration found in prisma/migrations
  Database schema is up to date.
  ```
- **Verified Database Tables**:
  - `_prisma_migrations` (Prisma migration history)
  - `system_metadata` (foundational persistence model with columns `id`, `key`, `value`, `created_at`, `updated_at`)

### Multi-Tenancy Architecture Foundation
To prevent any future rewrite when tenant isolation is introduced:
- The schema currently houses only foundational system metadata for persistence verification.
- Future domain tables will include explicit tenant keys (`organizationId` / `tenantId`).
- PostgreSQL Row-Level Security (RLS) policies will enforce tenant boundaries parameterized by session context (`app.current_tenant_id`).
- Full strategy documented in [`packages/database/README.md`](file:///d:/Zee%20Project%202%20Impactra%20%E2%80%94%20AI-Powered%20Software%20Change%20Intelligence%20&%20Release%20Safety%20Platform/packages/database/README.md).

---

## 8. Docker & Runtime Engineering Fixes (Actual Resolution)

During runtime integration, several concrete environment challenges were resolved:

1. **pnpm Symlink Resolution in API Container**:
   - In pnpm workspaces, nested dependency links require package-level `node_modules` to resolve properly.
   - Resolved by adding `COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules` in `apps/api/Dockerfile`.
2. **Database Workspace Package Production Build**:
   - The `@impactra/database` package cannot point production runtime to uncompiled TypeScript source files.
   - Configured `packages/database` to compile to CommonJS output in `dist/` (`dist/index.js`, `dist/index.d.ts`), and updated `apps/api/Dockerfile` to run `pnpm --filter @impactra/database build` before building the API.
3. **MinIO Healthcheck Tooling**:
   - The pinned MinIO image does not include `wget`.
   - Updated the healthcheck command to: `curl -fsS http://localhost:9000/minio/health/live >/dev/null || exit 1`.
4. **API Container Loopback Health Probing**:
   - Loopback `localhost` health probing was unreliable inside this local Docker container environment.
   - Updated the healthcheck test to dynamically bind to the container IP: `wget -qO- http://$$(hostname -i):3001/health || exit 1`.
5. **Local Machine Docker Storage Relocation (Local Troubleshooting Only)**:
   - Due to limited free space on the host `C:` drive, Docker Desktop WSL data storage was moved to `D:\DockerDesktopWSL`.
   - *Note: This is strictly local developer workstation troubleshooting and is not a project runtime or architectural requirement.*

---

## 9. Tooling Observation: Turborepo on Windows

During monorepo quality gate execution, root-level Turborepo tasks executed their work successfully to completion, but occasionally paused at the final stage (`Finishing writing to cache...`) due to Windows file-system locking on Turbo daemon cache files. Direct package-level commands (`pnpm --filter ...`) completed and returned immediately without delay. This is documented strictly as a local Windows tooling observation, not an application defect.

---

## 10. Security Controls & Standards

1. **Helmet HTTP Headers**: Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict referrer headers.
2. **Strict CORS**: Evaluates origins against `CORS_ORIGIN` (allowing `http://localhost:3000` and `http://impactra.local`).
3. **Payload Size Limits**: Strict 10MB limit enforced on express JSON and urlencoded body parsers.
4. **Correlation IDs**: `RequestIdMiddleware` injects or preserves unique UUIDv4 headers on every request (`x-request-id`).
5. **Structured Access Logging**: `LoggingMiddleware` outputs clean JSON logs containing `service`, `requestId`, `method`, `route`, `statusCode`, and `durationMs`.
6. **Exception Sanitization**: `AllExceptionsFilter` suppresses raw SQL, internal paths, and stack traces from API responses, while `sanitizeLogContent` redacts connection URIs, database passwords, tokens, internal IPs, and host filesystem paths before writing to server logs.
7. **Input Validation**: Global `AppValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and implicit type transformation.
8. **Gitignore Protection**: `.env` is confirmed ignored by Git via `git check-ignore -v .env`.
9. **Clean Production Supply Chain**: `pnpm audit --prod` reports 0 vulnerabilities.

---

## 11. Quality Gate & Validation Results

All quality gates were executed and verified:

| Quality Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Docker Compose Config** | `docker compose config --quiet` | **PASS (0)** | Configuration valid and validated |
| **Unit Test Suite** | `pnpm run test` | **PASS (0)** | 3 test suites, 12 tests passed (`env.schema`, `health.service`, `http-exception.filter`) |
| **E2E Integration Suite** | `pnpm run test:e2e` | **PASS (0)** | 1 test suite, 3 tests passed (`health.e2e-spec.ts`) |
| **Type Checking** | `pnpm run typecheck` | **PASS (0)** | 5/5 workspace packages passed with 0 errors |
| **Linting** | `pnpm run lint` | **PASS (0)** | 2/2 configured packages passed with 0 errors |
| **API Production Build** | `pnpm --filter @impactra/api build` | **PASS (0)** | NestJS API compiled to `dist/` |
| **Web Production Build** | `pnpm --filter @impactra/web build` | **PASS (0)** | Next.js standalone optimized bundle created |
| **Production Audit** | `pnpm audit --prod` | **PASS (0)** | 0 vulnerabilities found |
| **Git Diff Check** | `git diff --check` | **PASS (0)** | Clean; zero conflict markers or whitespace errors |
| **Git Secret Check** | `git check-ignore -v .env` | **PASS (0)** | `.env` confirmed ignored by `.gitignore:23` |

---

## 12. Explicit Boundaries & Deferred Capabilities

To maintain strict architectural discipline, the following boundaries remain firmly in place:

- **No Business Features**: Zero pull request ingestion, AST diffing, or analyzer rule modules exist in this phase.
- **No Authentication / JWT / RBAC**: Authentication will be designed separately with tenant context in a dedicated phase.
- **No GitHub App Integration**: GitHub webhooks, App authentication, and event ingestion are deferred to a dedicated phase.
- **No BullMQ Workers**: Redis is connected for caching and future queue backing; background worker processes (`apps/worker`) are deferred until change ingestion pipelines are introduced.
- **No AI / LLM Integrations**: Generative AI explanation models, OpenAI/Anthropic/Gemini SDKs, and prompts are strictly out of scope.
- **No Cloud Deployment**: Focus is strictly on local persistent Docker Compose infrastructure.
