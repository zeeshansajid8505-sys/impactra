# Phase 05 — Repository Ingestion + Software Digital Twin Foundation

**Project:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Branch:** `phase-05-repository-ingestion-digital-twin-foundation`
**Baseline Commit:** `97640de`

---

## 1. Executive Summary

Phase 05 establishes Impactra's core ingestion pipeline and foundational Software Digital Twin graph model. Building upon Phase 04's multi-tenant GitHub App installation and repository connection framework, Phase 05 delivers:

1. **Deterministic Source Acquisition:** Server-derived repository identity and GitHub App installation authentication using official Octokit libraries to stream immutable source tarball archives.
2. **Defensive Archive Processing:** Tarball decompression and extraction with strict security controls against path traversal, directory escapes, device names, compression bombs, bounded buffer limits (`maxOutputLength`), and bounded streaming download limits (50 MB).
3. **Multi-Faceted Static Code Analysis:**
   - Classification of files by architectural role and programming language.
   - Monorepo and package manifest discovery (`pnpm-workspace.yaml`, `package.json`).
   - Deterministic AST/regex import parsing for TypeScript/JavaScript ES imports, CommonJS requires, dynamic imports, and `tsconfig.json` path alias mapping (`compilerOptions.paths` / `baseUrl`).
4. **Deterministic Software Digital Twin Graph:**
   - Graph vertices: `REPOSITORY`, `WORKSPACE_PACKAGE`, `EXTERNAL_DEPENDENCY`, `FILE`, `CONFIG`.
   - Directed dependency edges: `CONTAINS`, `WORKSPACE_DEPENDS_ON`, `DECLARES_DEPENDENCY`, `IMPORTS`.
   - Idempotent, clash-free stable keys (`repo:...`, `pkg:...`, `file:...`, `dep:...`, `cfg:...`).
5. **Durable Multi-Tenant Storage & Database Models:**
   - Storage of immutable source archives in MinIO S3 (`organizations/{orgId}/repositories/{repoId}/snapshots/{snapshotId}/source.tar.gz`).
   - Relational persistence in PostgreSQL via Prisma with unique constraints and cascade cleanup.
   - Automatic cleanup of MinIO S3 artifacts if database transactions fail, preventing orphaned storage bloat.
6. **Asynchronous BullMQ Ingestion Queue:**
   - Official BullMQ integration via `@nestjs/bullmq` and `bullmq` with `maxRetriesPerRequest: null`.
   - Durable PostgreSQL partial unique index on active ingestions (`repository_ingestions_active_unique`) enforcing concurrency locking across worker processes (HTTP 409 Conflict mapped from `P2002`).
   - Six pipeline stages: `QUEUED` → `FETCHING` → `VALIDATING` → `INDEXING` → `BUILDING_TWIN` → `STORING` → `SUCCEEDED` (or `FAILED` with sanitized error diagnostics).
   - Snapshot publication safety: all public and workspace snapshot/twin endpoints strictly filter by `status: 'SUCCEEDED'`.
7. **Frontend Workspace Integration:**
   - Repository detail view (`/workspace/repositories/[repositoryId]`) with ingestion history, live stages, and trigger controls.
   - Interactive Software Digital Twin Explorer (`/workspace/repositories/[repositoryId]/digital-twin`) with metric cards, language distribution, and searchable node/edge tables.

---

## 2. Architecture & Data Flow

```
                      [ User / Webhook ]
                              │
                    POST /ingestions (RBAC)
                              │
                    PostgreSQL Concurrency Lock
               (Partial Unique Index on active runs)
                              ▼
                [ IngestionOrchestratorService ]
                              │
                    Enqueue BullMQ Job
                 (Queue: repository-ingestion)
                              │
                              ▼
                [ BullMQ IngestionProcessor ]
                              │
     Phase 1: FETCHING ───────┼─► Octokit / GitHub App (Streaming Bounded Tarball, max 50MB)
                              │
     Phase 2: VALIDATING ─────┼─► ArchiveSecurityValidator & TarReaderService
                              │   (maxOutputLength bounded, no symlinks/devices)
     Phase 3: INDEXING ───────┼─► FileClassifierService (Language & Role)
                              │
     Phase 4: BUILDING_TWIN ──┼─► ManifestParserService & ImportParserService
                              │   (tsconfig.json path alias resolution)
                              │   └─► DigitalTwinBuilderService (Vertices & Edges)
                              │
     Phase 5: STORING ────────┼─► MinIO S3 (source.tar.gz)
                              │   └─► PostgreSQL Transaction (Snapshot, Files, Twin, Nodes, Edges)
                              │       (Rollback deletes MinIO blob on DB failure)
                              ▼
     Phase 6: SUCCEEDED ──────┴─► Completed Ingestion Record (Published to Latest APIs)
```

---

## 3. Database Schema & Migration

### Migration Identifier
`20260923120000_add_repository_ingestion_digital_twin_foundation`

### Models & Indexes Added

| Model | Table | Description |
|---|---|---|
| `RepositoryIngestion` | `repository_ingestions` | Tracks asynchronous ingestion job lifecycle, stage, and diagnostics. |
| `RepositorySnapshot` | `repository_snapshots` | Immutable snapshot of repository at a commit SHA, unique per `[repositoryConnectionId, commitSha, parserVersion]`. |
| `RepositoryFileInventory` | `repository_file_inventories` | File-by-file inventory with content SHA-256, byte size, language, and category. |
| `DigitalTwinSnapshot` | `digital_twin_snapshots` | Architectural graph vertex/edge container, linked 1:1 with snapshot. |
| `DigitalTwinNode` | `digital_twin_nodes` | Vertices representing repositories, packages, files, configs, and dependencies with idempotent `stableKey`. |
| `DigitalTwinEdge` | `digital_twin_edges` | Directed graph relationships (`CONTAINS`, `IMPORTS`, `DECLARES_DEPENDENCY`, `WORKSPACE_DEPENDS_ON`). |

### PostgreSQL Partial Unique Index
```sql
CREATE UNIQUE INDEX "repository_ingestions_active_unique"
ON "repository_ingestions"("repository_connection_id")
WHERE "status" IN ('QUEUED', 'FETCHING', 'VALIDATING', 'INDEXING', 'BUILDING_TWIN', 'STORING');
```

---

## 4. Security & Safety Limits

| Protection | Constraint / Threshold | Enforcement Location |
|---|---|---|
| **Path Traversal Defense** | Rejects `..`, absolute paths, Windows drive letters, null bytes | `ArchiveSecurityValidator.sanitizeAndValidatePath` |
| **System Device Filter** | Rejects Windows/POSIX devices (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) | `ArchiveSecurityValidator.sanitizeAndValidatePath` |
| **Archive Max Size** | 50 MB (`52,428,800` bytes) streaming & buffered limit | `RepositorySourceProvider.fetchSourceArchive` & `ArchiveSecurityValidator.validateArchiveBufferSize` |
| **Extracted Max Size** | 250 MB (`262,144,000` bytes) buffer bounded | `TarReaderService.extract` (`zlib.gunzipSync` `maxOutputLength`) & `ArchiveSecurityValidator.validateExtractionMetrics` |
| **Single File Max Size** | 5 MB (`5,242,880` bytes) | `ArchiveSecurityValidator.validateFileByteSize` |
| **File Count Limit** | 10,000 files | `ArchiveSecurityValidator.validateExtractionMetrics` |
| **Path Depth Limit** | 20 directory levels | `ArchiveSecurityValidator.sanitizeAndValidatePath` |
| **Path Length Limit** | 255 characters | `ArchiveSecurityValidator.sanitizeAndValidatePath` |
| **Decompression Bomb** | Aborts if expansion ratio > 100x after 10 MB extracted | `ArchiveSecurityValidator.validateExtractionMetrics` |
| **Symlink / Device Rejection** | Rejects tar entry types '1', '2', '3', '4', '6' | `TarReaderService.extract` |
| **Secret Sanitization** | Redacts GitHub tokens (`ghp_*`) and bearer auth from error logs | `IngestionOrchestratorService.sanitizeErrorMessage` |
| **Tenant Isolation** | Repository identity derived strictly from server database; never from request body | `RepositorySourceProvider.fetchSourceArchive` |
| **Orphaned Blob Cleanup** | MinIO artifacts deleted on DB transaction failure | `IngestionOrchestratorService.processIngestion` & `StorageService.deleteObject` |

---

## 5. REST API Endpoints

| Method | Endpoint | Permission Required | Description |
|---|---|---|---|
| `POST` | `/organizations/:orgId/repositories/:repoId/ingestions` | `ingestion.trigger` | Trigger async repository ingestion (202 Accepted) |
| `GET` | `/organizations/:orgId/repositories/:repoId/ingestions` | `ingestion.read` | List repository ingestion history |
| `GET` | `/organizations/:orgId/repositories/:repoId/ingestions/:id` | `ingestion.read` | Get ingestion details and stage progress |
| `GET` | `/organizations/:orgId/repositories/:repoId/snapshots/latest` | `ingestion.read` | Get latest repository snapshot and file inventory (only SUCCEEDED) |
| `GET` | `/organizations/:orgId/repositories/:repoId/digital-twin/latest` | `digital_twin.read` | Get digital twin summary metrics and language distribution (only SUCCEEDED) |
| `GET` | `/organizations/:orgId/repositories/:repoId/digital-twin/latest/nodes` | `digital_twin.read` | Query paginated/searchable digital twin nodes (only SUCCEEDED) |
| `GET` | `/organizations/:orgId/repositories/:repoId/digital-twin/latest/edges` | `digital_twin.read` | Query paginated/filtered digital twin dependency edges (only SUCCEEDED) |

---

## 6. Verification Summary

- **Unit Tests:**
  - `archive-security.validator.spec.ts`: Path traversal, device names, size limits, and zip bomb tests.
  - `tar-reader.service.spec.ts`: Tar and gzip extraction, prefix stripping, symlink rejection, bounded buffer extraction.
  - `file-classifier.service.spec.ts`: Language detection, category detection, binary detection.
  - `manifest-parser.service.spec.ts`: Single-package and monorepo workspace dependencies.
  - `import-parser.service.spec.ts`: Static/dynamic imports, requires, relative vs external specifiers, `tsconfig.json` path aliases.
  - `digital-twin-builder.service.spec.ts`: Deterministic node/edge generation, stable key idempotency.
  - `ingestion-orchestrator.service.spec.ts`: Concurrency 409 conflict via `Promise.all` and `P2002`, pipeline transitions, MinIO cleanup, publication safety.
- **E2E Integration Tests:**
  - `ingestion.e2e-spec.ts`: RBAC permission matrix (Owner vs Viewer), tenant isolation, ingestion trigger, snapshot/twin querying.
- **Frontend Quality:**
  - Zero hydration errors, clean component boundaries, accessible loading states, no `setState` inside `useEffect`.

---

## 7. Final Acceptance Corrections

### 7.1 Jest & @octokit/auth-app ESM Compatibility
- **Issue:** Jest 29 running under CommonJS encountered `SyntaxError: Cannot use import statement outside a module` when attempting to load `@octokit/auth-app@8.3.1/dist-node/index.js` (an ESM-only package) through the dependency chain `GitHubClientService` → `RepositorySourceProvider` → `IngestionOrchestrator`.
- **Solution (Narrowly-Scoped Test Double):**
  - Created [`apps/api/test/mocks/octokit-auth-app.ts`](file:///d:/Zee%20Project%202%20Impactra%20%E2%80%94%20AI-Powered%20Software%20Change%20Intelligence%20&%20Release%20Safety%20Platform/apps/api/test/mocks/octokit-auth-app.ts) providing a complete test double for `createAppAuth` with support for both app and installation token authentication.
  - Configured `moduleNameMapper` in [`jest.config.js`](file:///d:/Zee%20Project%202%20Impactra%20%E2%80%94%20AI-Powered%20Software%20Change%20Intelligence%20&%20Release%20Safety%20Platform/apps/api/jest.config.js) and [`test/jest-e2e.json`](file:///d:/Zee%20Project%202%20Impactra%20%E2%80%94%20AI-Powered%20Software%20Change%20Intelligence%20&%20Release%20Safety%20Platform/apps/api/test/jest-e2e.json) to map `^@octokit/auth-app$` directly to the test double.
  - Production TypeScript builds (`tsc -p tsconfig.build.json`) and runtime (`node dist/main.js`) continue using the official `@octokit/auth-app` ESM package without modification. Unrelated Octokit packages (`@octokit/rest`) remain untouched.

### 7.2 TAR Reader Path Semantics & Security Hardening
- **Issues Identified:**
  1. `TarReaderService` did not reject directory traversal paths when `findCommonRootDirectory` treated `../` as a common root prefix and stripped it prior to validation.
  2. `TarReaderService` stripped top-level repository folders (e.g. `src/`) when only a single file was present in that folder, returning `main.ts` instead of `src/main.ts`.
  3. Absolute paths (`/absolute/path`, `\absolute\windows\path`) were previously stripped of leading slashes rather than rejected.
- **Corrections Implemented:**
  1. **Validation Before Normalization:** `ArchiveSecurityValidator.sanitizeAndValidatePath` now executes strict security validation before any path normalization. Paths starting with `/` or `\` are rejected immediately with `BadRequestException`. Any path segment equal to `..` is rejected. Valid filenames containing consecutive dots (`file..name.ts`) are preserved.
  2. **Early Archive Entry Security Check:** `TarReaderService.extract` executes `sanitizeAndValidatePath(entryPath)` immediately upon reading each TAR header (including directory entries), ensuring dangerous entries are aborted before directory skipping or prefix stripping.
  3. **USTAR Prefix Composition:** Standard USTAR prefix (bytes 345–499) and name (bytes 0–99) are composed logically as `prefix + "/" + name`. Traversal appearing in either field is caught immediately.
  4. **Source Directory Preservation:** `findCommonRootDirectory` protects standard source directories (`src`, `app`, `apps`, `packages`, `lib`, `test`, `tests`, `docs`, `components`, etc.) from being stripped. Only true GitHub archive wrappers (matching `-[0-9a-f]{7,40}` commit SHA suffixes or having multiple root manifests) are normalized.
  5. **Comprehensive Regression Suite:** Added/retained regression tests for all 12 required scenarios in `tar-reader.service.spec.ts` and `archive-security.validator.spec.ts`.
