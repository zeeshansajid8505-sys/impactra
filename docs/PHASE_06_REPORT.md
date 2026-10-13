# Phase 06 — GitHub Change / Pull Request Ingestion + Digital Twin Change Mapping Foundation

**Project:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Branch:** `phase-06-change-ingestion-impact-analysis-foundation`
**Baseline Commit:** `fc725324371d26a44a174edaa578868a33d0f00e` (Merged Phase 05)
**Status:** `PHASE 06 COMPLETE — FINAL EXTERNAL ACCEPTANCE VERIFIED`

---

## 1. Executive Summary

Phase 06 delivers the deterministic change intelligence and pull request ingestion foundation for Impactra. Building upon Phase 05's Software Digital Twin graph model, Phase 06 establishes an end-to-end pipeline that transforms incoming GitHub pull requests into immutable commit-pair revisions, diff evidence, and before/after graph mapping deltas:

1. **Pull Request Ingestion Engine:**
   - Multi-tenant webhook ingestion of GitHub `pull_request` events (`opened`, `synchronize`, `reopened`, `closed`).
   - Manual on-demand PR synchronization endpoint (`POST /organizations/:orgId/repositories/:repoId/changes/sync`).
   - Stale webhook protection and concurrency lock handling (`P2002` conflict recovery across concurrent webhook deliveries).

2. **Immutable Commit-Pair Revisions:**
   - `ChangeRevision` tracked for exact `(baseSha, headSha, analysisVersion)` commit pairs with unique constraint `@@unique([changeSetId, baseSha, headSha, analysisVersion])`.
   - Single active revision constraint per change set via PostgreSQL partial unique index:
     `CREATE UNIQUE INDEX "change_revisions_active_unique" ON "change_revisions"("change_set_id") WHERE "status" IN ('QUEUED', 'FETCHING', 'WAITING_FOR_SNAPSHOTS', 'ANALYZING', 'MAPPING_TWIN', 'STORING');`
   - BullMQ worker payload strictly bound to `{ changeRevisionId: string }` with deterministic deduplication jobId `change-revision:${changeRevisionId}`.

3. **Diff Evidence & Defensive File Processing:**
   - Strict path normalization: slashes converted to `/`, leading `./` and `/` stripped, null bytes rejected, directory traversal (`..`) rejected, max path length (255) and max depth (20) enforced.
   - Patch size bounding: `CHANGE_MAX_PATCH_BYTES_PER_FILE` (256 KB) and `CHANGE_MAX_TOTAL_PATCH_BYTES` (10 MB) with `patchTruncated: true` indicator.
   - Binary file detection: safely identifying binary and non-text diffs without crashing the parser.

4. **Sequential Snapshot Alignment Orchestration:**
   - Base and head snapshot alignment requiring exact commit SHAs (`RepositorySnapshot.commitSha == baseSha / headSha`) and `status: 'SUCCEEDED'`.
   - Sequential ingestion enforcement: base commit snapshot ingested first, revision placed into `WAITING_FOR_SNAPSHOTS` with 5s delayed BullMQ requeue, followed by head commit snapshot ingestion, preventing concurrent repository ingestion deadlocks.

5. **Software Digital Twin Change Mapping:**
   - Deterministic mapping between changed files and before/after Digital Twin nodes:
     - `ADDED` files mapped to `side: AFTER` with `EXACT_PATH`
     - `DELETED` files mapped to `side: BEFORE` with `EXACT_PATH`
     - `RENAMED` files mapped to `side: BEFORE` (old path) and `side: AFTER` (new path) with `RENAMED_PATH`
     - `MODIFIED` files mapped to both `BEFORE` and `AFTER` with `EXACT_PATH`
     - Non-code or ignored files mapped safely with `NOT_PRESENT`

6. **Direct Dependency Deltas:**
   - Graph delta evaluation comparing base snapshot edges with head snapshot edges using stable keys:
     - `EDGE_REMOVED`: edges present in base Digital Twin but absent in head Digital Twin.
     - `EDGE_ADDED`: edges present in head Digital Twin but absent in base Digital Twin.
   - Populates summary counters: `filesAdded`, `filesModified`, `filesDeleted`, `filesRenamed`, `nodesAdded`, `nodesModified`, `nodesRemoved`, `edgesAdded`, `edgesRemoved`.

7. **RBAC & API Endpoints:**
   - `Permission.CHANGE_READ` granted to all 9 roles.
   - `Permission.CHANGE_SYNC` granted to `OWNER`, `ADMIN`, `ARCHITECT`, `DEVELOPER`, `RELEASE_MANAGER`.
   - REST endpoints under `/organizations/:orgId/changes`:
     - `GET /organizations/:orgId/changes`
     - `GET /organizations/:orgId/changes/:changeSetId`
     - `GET /organizations/:orgId/changes/:changeSetId/revisions`
     - `GET /organizations/:orgId/changes/:changeSetId/revisions/:revisionId`
     - `GET /organizations/:orgId/changes/:changeSetId/revisions/:revisionId/files`
     - `GET /organizations/:orgId/changes/:changeSetId/revisions/:revisionId/twin-mappings`
     - `GET /organizations/:orgId/changes/:changeSetId/revisions/:revisionId/dependency-deltas`
     - `POST /organizations/:orgId/repositories/:repositoryId/changes/sync`

8. **Frontend Web UI:**
   - `/workspace/changes`: Pull Requests overview list with metrics, search, repository filter, status badges, diff counters, and twin delta indicators.
   - `/workspace/changes/[changeSetId]`: Change Detail view with tabbed panels (Overview, Changed Files, Digital Twin Mapping, Dependency Deltas) and live status polling.
   - `/workspace/repositories/[repositoryId]`: Integrated Pull Requests & Change Intelligence card with on-demand PR synchronization input and direct inspection links.

---

## 2. Architecture & Data Flow

```
                      [ GitHub Webhook / User Sync ]
                                     â”‚
                             pull_request event
                                     â”‚
                                     â–¼
                      [ ChangeOrchestratorService ]
                                     â”‚
                      Upsert ChangeSet & ChangeRevision
                  (Enforces single active revision lock)
                                     â”‚
                                     â–¼
                          [ BullMQ Queue ]
                       (Queue: change-ingestion)
                                     â”‚
                                     â–¼
                          [ ChangesProcessor ]
                                     â”‚
   Stage 1: FETCHING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â–º GithubPullRequestService & ChangedFileService
                                     â”‚   (Octokit pagination, patch bounds, path sanitization)
                                     â”‚
   Stage 2: WAITING_FOR_SNAPSHOTS â”€â”€â”€â”¼â”€â–º SnapshotAlignmentService
                                     â”‚   (Ensures exact base & head commit snapshots;
                                     â”‚    sequential triggering with 5s BullMQ delayed retry)
                                     â”‚
   Stage 3: ANALYZING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â–º TwinChangeMapperService
                                     â”‚   (Maps changed files to Digital Twin before/after nodes)
                                     â”‚
   Stage 4: MAPPING_TWIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â–º DependencyDeltaService
                                     â”‚   (Computes EDGE_ADDED and EDGE_REMOVED graph deltas)
                                     â”‚
   Stage 5: STORING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â–º Persist TwinChangeMapping & DependencyDelta
                                     â”‚   Update revision status: SUCCEEDED
                                     â–¼
                       [ Change Intelligence Ready ]
```

---

## 3. Database Schema & Migration History

Exactly 5 applied migrations exist on disk in `packages/database/prisma/migrations`:
1. `20260922092317_init_system_metadata` (Historical Phase 01: System metadata foundation)
2. `20260922160000_add_auth_organizations_rbac` (Historical Phase 02: Tenancy, sessions, RBAC)
3. `20260922180000_add_github_app_repository_onboarding` (Historical Phase 04: GitHub App & repository connections)
4. `20260923120000_add_repository_ingestion_digital_twin_foundation` (Historical Phase 05: Repository ingestion & Digital Twin)
5. `20261011140000_add_change_ingestion_twin_mapping_foundation` (**Phase 06**: Pull request change ingestion & twin mapping)

### Phase 06 Models:
- `ChangeSet`: Logical PR tracker per repository connection (`pullRequestNumber`, `title`, `authorLogin`, `baseRef`, `headRef`, `currentBaseSha`, `currentHeadSha`, `state`, `isMerged`).
- `ChangeRevision`: Immutable analysis record for exact commit pair (`changeSetId`, `baseSha`, `headSha`, `analysisVersion`, `status`, `stage`, counters).
- `ChangedFile`: Normalized diff file inventory (`oldPath`, `newPath`, `status`, `additions`, `deletions`, `changes`, `patchAvailable`, `patchTruncated`, `binary`).
- `TwinChangeMapping`: Mapped relationships between diff files and digital twin nodes (`side`, `mappingType`, `repositorySnapshotId`, `digitalTwinNodeId`, `nodeStableKey`, `path`).
- `DependencyDelta`: Direct graph edge deltas (`deltaType`, `sourceStableKey`, `targetStableKey`, `edgeType`, `beforeEvidence`, `afterEvidence`).

---

## 4. Docker Architecture & Port Mapping

- **PostgreSQL (`impactra-postgres`):** Host port `5433` -> Container port `5432`
- **Redis (`impactra-redis`):** Host port `6380` -> Container port `6379`
- **API (`impactra-api`):** Host port `3001` -> Container port `3001`
- **Web Frontend (`impactra-web`):** Host ports `80` & `3000` -> Container port `3000`
- **MinIO Object Storage (`impactra-minio`):** API port `9000`, Console port `9001`

---

## 5. Verification & Testing Summary

1. **Unit Tests:**
   - `changed-file.service.spec.ts`: Path normalization, traversal rejection, patch limits, binary detection.
   - `snapshot-alignment.service.spec.ts`: Exact SHA lookup, sequential base/head ingestion, conflict handling.
   - `twin-change-mapper.service.spec.ts`: All 4 file status cases (ADDED, DELETED, RENAMED, MODIFIED), non-present fallback.
   - `dependency-delta.service.spec.ts`: EDGE_ADDED, EDGE_REMOVED, controlled fixture scenario (`service.ts -> util.ts` removed, `service.ts -> new-util.ts` added, `pkg -> zod` added, with `pkg -> react` retained).
   - `change-orchestrator.service.spec.ts`: Webhook filtering, closed PR handling, concurrent `P2002` conflict recovery.
   - `github-pull-request.service.spec.ts`: Real Octokit authentication, pagination, regression test verifying zero fixture backdoor in production.
   - `permissions.policy.spec.ts`: RBAC rules for `CHANGE_READ` and `CHANGE_SYNC`.
   - `changes.dto.spec.ts`: Validation decorators for all change query and sync DTOs.

2. **E2E & Controlled Fixture Tests:**
   - `apps/api/test/changes.e2e-spec.ts`: REST endpoints, tenant isolation, RBAC enforcement (VIEWER 403, OWNER 202), sub-resource listing.
   - `apps/api/test/run-controlled-fixture.ts`: Deterministic execution verifying exact fixture IDs and edge/node delta counts against local database.

### 5.1 Acceptance Attempt & Determinism Cleanup Status

- **Status:** `PHASE 06 COMPLETE — FINAL EXTERNAL ACCEPTANCE VERIFIED`
- **Verified Baseline State:**
  - *API Typecheck & Build:* VERIFIED PASS
  - *API Unit Tests:* VERIFIED PASS (31 / 31 suites, 232 / 232 tests passing)
  - *API E2E Tests:* VERIFIED PASS across all 5 suites (`ingestion.e2e`, `changes.e2e`, `auth.e2e`, `github.e2e`, `health.e2e`)
  - *Web Quality Gates:* VERIFIED PASS (Lint, Typecheck, Production Build)
  - *Prisma:* VERIFIED PASS (Validate, Generate, Migrate Deploy, Status: exactly 5 migrations)
  - *Frozen Lockfile & Production Audit:* VERIFIED PASS
  - *Controlled Fixture:* VERIFIED PASS (4 files, 8 twin mappings, node deltas: +1/-1/mod 2, edge deltas: +2/-1, Revision SUCCEEDED)
  - *Git Diff Check & Secret Scanner:* VERIFIED PASS
  - *Forbidden Test Markers (.only, .skip):* VERIFIED PASS
  - *Production Test Fixture Backdoors:* VERIFIED PASS
  - *Docker Image Build:* VERIFIED PASS (`impactra-api` PASS, `impactra-web` PASS)
  - *Production Package Resolution:* VERIFIED PASS (CommonJS compiled `@impactra/shared` packaging cleanly loaded in Node v24)
- **Root Cause & Ingestion E2E Determinism Fix:**
  - **Root Cause:**
    1. In `apps/api/test/ingestion.e2e-spec.ts`, the database is an in-memory mock, but `AppModule` connects BullMQ to the host's real Redis instance (`localhost:6380`).
    2. The test suite did not pre-seed snapshot or digital twin data in `beforeAll`. It relied on test 1 (`allows OWNER to trigger repository ingestion`) to trigger an ingestion job with `jobId: repository-ingestion-ing-1` in real BullMQ, where a worker asynchronously populated in-memory arrays.
    3. On Run 1, Redis had no existing job, so BullMQ executed the worker and populated the in-memory arrays. Tests 5–8 passed.
    4. On subsequent runs in fresh Jest worker processes, in-memory arrays were re-initialized empty (`[]`), but Redis still held `repository-ingestion-ing-1` in its completed/failed job set. BullMQ deduplication suppressed re-adding the duplicate `jobId`.
    5. The background worker never executed on subsequent runs. After the polling timeout, the empty in-memory arrays caused tests 5, 6, 7, and 8 to return 404 instead of 200.
  - **Applied Corrections:**
    1. **Mocked Ingestion Queue:** Provided an in-memory mock for `IngestionQueueService` (`overrideProvider(IngestionQueueService).useValue({ enqueue: jest.fn().mockResolvedValue(undefined) })`), preventing any job pollution into real Redis and eliminating asynchronous worker race conditions.
    2. **Isolated Fixture Identity:** Decoupled mutation/trigger tests (`repoId1 = 'repo-ingest-1'`) from read endpoint tests (`repoIdFixture = 'repo-ingest-fixture'`).
    3. **Deterministic Seed Data:** Pre-seeded a complete, immutable SUCCEEDED snapshot, file inventories (`package.json`, `src/index.ts`), digital twin summary, nodes (`FILE`, `WORKSPACE_PACKAGE`), and edges (`IMPORTS`) directly on `repoIdFixture` in `beforeAll` for every run.
    4. **Eliminated Polling Loops:** Removed the arbitrary 30-iteration `setTimeout` polling loop in test 5; added explicit fixture presence invariant assertions before executing HTTP requests.
    5. **Maintained 200 Invariants:** Kept all original `expect(res.status).toBe(200)` assertions and payload property validations across all four read endpoints.

### 5.2 Verification Evidence: Last Verified Baseline vs. Final State

| Verification Gate | Last Actual Verified Baseline | Expected After Determinism Fix | Current Status |
|---|---|---|---|
| Git State & Phase 05 Baseline | PASS | PASS | VERIFIED PASS |
| Docker Services Pre-Flight | PASS | PASS | VERIFIED PASS |
| Secure Database & Prisma Migrations | PASS (5 migrations) | PASS (5 migrations) | VERIFIED PASS |
| Frozen Lockfile | PASS | PASS | VERIFIED PASS |
| Production Security Audit | PASS | PASS | VERIFIED PASS |
| Monorepo Shared & Database Build | PASS | PASS | VERIFIED PASS |
| API Typecheck | PASS | PASS | VERIFIED PASS |
| API Build | PASS | PASS | VERIFIED PASS |
| API Unit Tests | PASS (31/31 suites, 232/232 tests) | PASS (31/31 suites, 232/232 tests) | VERIFIED PASS |
| API E2E Tests | PASS (5/5 suites, 63/63 tests) | PASS (5/5 suites, 63/63 tests) | VERIFIED PASS |
| Web Quality Gates (Lint, Typecheck, Build) | PASS | PASS | VERIFIED PASS |
| Whitespace & Git Diff Check | PASS | PASS | VERIFIED PASS |
| Secret Scanner | PASS | PASS | VERIFIED PASS |
| Forbidden Test Markers (.only, .skip) | PASS | PASS | VERIFIED PASS |
| Production Test Fixture Backdoors | PASS | PASS | VERIFIED PASS |
| Controlled Fixture Execution | PASS | PASS | VERIFIED PASS |
| Docker Image Build (API & Web) | PASS | PASS | VERIFIED PASS |
| Web Runtime (Localhost & impactra.local) | PASS (all 5 web URLs 200) | PASS (all 5 web URLs 200) | VERIFIED PASS |
| API Docker Container Runtime & Health | PASS (healthy) | PASS (healthy) | VERIFIED PASS |
| API Runtime HTTP Matrix (/health, /ready, /api/docs) | PASS (all 3 endpoints 200) | PASS (all 3 endpoints 200) | VERIFIED PASS |

---

## 6. Live Project URLs

- **Primary Website:** [http://impactra.local](http://impactra.local)
- **Pull Requests & Changes:** [http://impactra.local/workspace/changes](http://impactra.local/workspace/changes)
- **Repository Onboarding:** [http://impactra.local/workspace/repositories](http://impactra.local/workspace/repositories)
- **Frontend Fallback:** [http://localhost:3000](http://localhost:3000)
- **API Health:** [http://localhost:3001/health](http://localhost:3001/health)
- **API Readiness:** [http://localhost:3001/ready](http://localhost:3001/ready)
- **Swagger Documentation:** [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## Final Acceptance Closure — 2026-10-13

Phase 06 completed final external acceptance and manual visual verification.

### Final Verified Results

- Phase 06 secure acceptance runner: **PASS**
- API typecheck: **PASS**
- API production build: **PASS**
- API unit tests: **31/31 suites, 232/232 tests PASS**
- API E2E tests: **5/5 suites, 63/63 tests PASS**
- Ingestion E2E determinism: **5 sequential isolated runs, each 8/8 PASS**
- Post-full-suite ingestion E2E: **8/8 PASS**
- Prisma migrations: **exactly 5**
- Production dependency audit: **PASS**
- Secret scan: **PASS**
- Git diff check: **PASS**
- Controlled ChangeSet fixture: **PASS**
- Changed files: **4**
- Twin change mappings: **8**
- Node delta: **+1 added, -1 removed, 2 modified**
- Edge delta: **+2 added, -1 removed**
- Change revision status: **SUCCEEDED**
- Production API container: **healthy**
- API /health: **HTTP 200**
- API /ready: **HTTP 200**
- Swagger /api/docs: **HTTP 200**
- Primary website: **HTTP 200**
- Repository onboarding route: **HTTP 200**
- Changes route: **HTTP 200**
- Controlled ChangeSet detail route: **HTTP 200**
- Manual visual inspection: **PASS**

### Final Phase Status

**PHASE 06 COMPLETE — ACCEPTANCE VERIFIED**

Phase 07 must begin from the verified Phase 06 merge commit.
