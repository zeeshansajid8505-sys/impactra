# IMPACTRA — PHASE 08 ACCEPTANCE REPORT
## Deterministic Release Safety & Release Decision Foundation

---

### 1. Executive Summary

- **Phase Title**: Deterministic Release Safety & Release Decision Foundation
- **Branch**: `phase-08-release-safety-foundation`
- **Base Baseline Commit**: `dc56a395f4b015732367d8afae8dfb0bee020f38` (Phase 07 Acceptance Commit)
- **Status**: `PHASE 08 RELEASE SAFETY FOUNDATION READY FOR EXTERNAL ACCEPTANCE`
- **Primary Objective**: Establish an explainable, policy-driven release safety evaluation engine that deterministically computes an objective risk score (0–100), risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), and release decisions (`PASS`, `REVIEW_REQUIRED`, `BLOCKED`) grounded strictly in verified change footprint and blast-radius graph evidence.
- **Epistemic Integrity & Non-Goals**:
  - **Zero Speculation / No AI Hallucination**: The Release Safety score is an explicit, verifiable policy score produced from deterministic rules. It is NOT an LLM generation, NOT a predictive failure probability, NOT an outage estimate, and NOT derived from vector embeddings.
  - **Evidence Grounded**: All rule signals link to concrete entities (`ChangeRevision`, `ChangedFile`, `DependencyDelta`, `BlastRadiusAnalysis`, `BlastRadiusFinding`).
  - **Git Operations**: ZERO git commands executed (`git add`, `git commit`, `git merge`, `git push`, `git checkout` remain untouched). All git closure is deferred to external execution.

---

### 2. Database Schema & Migration Foundation

Phase 08 introduces exactly 1 canonical PostgreSQL migration, bringing the total migration count in the codebase to **exactly 7** (historical migrations 1–6 preserved with zero modification).

- **Migration**: `packages/database/prisma/migrations/20261014170000_add_release_safety_foundation/migration.sql`
- **Total Migrations**: Exactly 7
  1. `20260922092317_init_system_metadata`
  2. `20260922160000_add_auth_organizations_rbac`
  3. `20260922180000_add_github_app_repository_onboarding`
  4. `20260923120000_add_repository_ingestion_digital_twin_foundation`
  5. `20261011140000_add_change_ingestion_twin_mapping_foundation`
  6. `20261013160000_add_blast_radius_analysis_foundation`
  7. `20261014170000_add_release_safety_foundation`

#### Real Prisma Models
1. **`ReleaseSafetyAssessment`**: Tracks evaluation runs per change revision and blast radius analysis.
   - Fields: `id`, `organizationId`, `changeSetId`, `changeRevisionId`, `blastRadiusAnalysisId`, `status`, `policyVersion`, `riskScore`, `riskLevel`, `decision`, `signalCount`, `blockingSignalCount`, `reviewSignalCount`, `startedAt`, `completedAt`, `failedAt`, `failureCode`, `failureMessage`, `createdAt`, `updatedAt`.
   - Constraints: `@@unique([changeRevisionId, blastRadiusAnalysisId, policyVersion])`, indexes on `[organizationId]`, `[changeSetId]`, `[changeRevisionId]`, `[blastRadiusAnalysisId]`, `[status]`, `[decision]`, `[createdAt]`.
2. **`ReleaseSafetySignal`**: Represents verifiable, individual policy signals contributing score deltas and gating flags.
   - Fields: `id`, `organizationId`, `assessmentId`, `ruleId`, `ruleVersion`, `category`, `severity`, `scoreDelta`, `blocking`, `requiresReview`, `title`, `description`, `evidenceType`, `evidenceReferenceId`, `evidenceStableKey`, `evidenceJson`, `createdAt`.
   - Constraints: Foreign keys with cascading delete on assessment and organization; indexes on `[organizationId]`, `[assessmentId]`, `[ruleId]`, `[severity]`, `[category]`.

#### Canonical Enums
- `ReleaseSafetyAssessmentStatus`: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`
- `ReleaseSafetyDecision`: `PASS`, `REVIEW_REQUIRED`, `BLOCKED`
- `ReleaseRiskLevel`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `ReleaseSafetySignalSeverity`: `INFO`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `ReleaseSafetySignalCategory`: `CHANGE_SIZE`, `BLAST_RADIUS`, `DEPENDENCY`, `ARCHITECTURE`, `ANALYSIS_QUALITY`

---

### 3. Deterministic Policy, Scoring & Thresholds

#### Policy Version
- **`RELEASE_SAFETY_POLICY_VERSION`**: `'impactra-release-safety-v1'`

#### Score Boundaries & Risk Level Mapping
The raw score is computed as the sum of all signal score deltas, then clamped strictly to the range `0..100`:

| Risk Score Range | Risk Level | Meaning |
|---|---|---|
| `0 – 24` | `LOW` | Minimal ripple effect; localized and well-bounded change. |
| `25 – 49` | `MEDIUM` | Moderate propagation across dependency boundaries. |
| `50 – 74` | `HIGH` | Extensive ripple effect or architectural boundary traversal. |
| `75 – 100` | `CRITICAL` | Severe graph impact, extensive code churn, or critical threshold breach. |

#### Decision Matrix & Policy Thresholds
The release decision is calculated deterministically with strict override rules:

1. **`BLOCKED`**:
   - Any signal has `blocking: true` (e.g. `RS-BLAST-003` with >= 30 affected entities), OR
   - The clamped risk score is `>= 75` (`CRITICAL`).
2. **`REVIEW_REQUIRED`**:
   - Any signal has `requiresReview: true` (e.g. configuration mutation, cross-package traversal, dependency edge removal), OR
   - The clamped risk score is `> 39` (`MEDIUM` or `HIGH` risk).
3. **`PASS`**:
   - The clamped risk score is `<= 39`, AND
   - Zero signals mandate review (`requiresReview: false`), AND
   - Zero signals are blocking (`blocking: false`).

#### Deterministic Signal Ordering
Signals are deterministically ordered in all queries and reports:
1. `blocking DESC` (blocking signals appear first)
2. `severity DESC` (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW` > `INFO`)
3. `scoreDelta DESC` (higher risk impact first)
4. `ruleId ASC` (alphabetical tie-breaker)

---

### 4. Deterministic Rule Catalog

| Rule ID | Category | Severity | Score Δ | Flags | Trigger Condition |
|---|---|---|---|---|---|
| `RS-BLAST-001` | `BLAST_RADIUS` | `HIGH`<br>`MEDIUM`<br>`LOW` | `+20`<br>`+12`<br>`+5` | Review if >= 10 | First-order direct dependents in blast radius (>= 10, >= 5, >= 1). |
| `RS-BLAST-002` | `BLAST_RADIUS` | `HIGH`<br>`MEDIUM`<br>`LOW` | `+20`<br>`+10`<br>`+5` | Review if >= 20 | Transitive dependents in blast radius (>= 20, >= 10, >= 3). |
| `RS-BLAST-003` | `BLAST_RADIUS` | `CRITICAL`<br>`HIGH` | `+30`<br>`+15` | **BLOCKING** if >= 30<br>Review if >= 15 | Total affected nodes in blast radius (>= 30, >= 15). |
| `RS-DEPTH-001` | `BLAST_RADIUS` | `HIGH`<br>`MEDIUM`<br>`LOW` | `+15`<br>`+8`<br>`+3` | Review if >= 5 | Max propagation depth reached (>= 5, >= 3, >= 2). |
| `RS-ARCH-001` | `ARCHITECTURE` | `HIGH` | `+15` | Review | Configuration node (`nodeType === 'CONFIG'`) affected in blast radius. |
| `RS-ARCH-002` | `ARCHITECTURE` | `HIGH` | `+15` | Review | Workspace package (`nodeType === 'WORKSPACE_PACKAGE'`) traversed. |
| `RS-CHANGE-001` | `CHANGE_SIZE` | `HIGH`<br>`MEDIUM`<br>`LOW` | `+20`<br>`+10`<br>`+4` | Review if >= 25 | Total changed files in revision (>= 25, >= 10, >= 5). |
| `RS-CHANGE-002` | `CHANGE_SIZE` | `HIGH`<br>`MEDIUM` | `+15`<br>`+8` | Review if >= 1000 | Code churn volume: additions + deletions across files (>= 1000, >= 500). |
| `RS-DEP-001` | `DEPENDENCY` | `HIGH` | `+20` | Review | Graph edge severance: dependency delta with `deltaType === 'EDGE_REMOVED'`. |
| `RS-DEP-002` | `DEPENDENCY` | `LOW` | `+10` | None | New graph dependency introduced: `deltaType === 'EDGE_ADDED'`. |
| `RS-DEP-003` | `DEPENDENCY` | `MEDIUM` | `+10` | None | Third-party or external dependency node in blast radius. |
| `RS-QUALITY-001` | `ANALYSIS_QUALITY` | `HIGH` | `+25` | Review | Traversal boundary reached: `blastRadiusAnalysis.truncated === true`. |

#### Rules Omitted from v1 Because Canonical Evidence Does Not Exist
The canonical `DigitalTwinNodeType` enum in the database schema strictly comprises:
`REPOSITORY`, `FILE`, `WORKSPACE_PACKAGE`, `EXTERNAL_DEPENDENCY`, and `CONFIG`.

Rules referencing hypothetical or unmaterialized evidence categories are intentionally omitted from v1:
1. **Database Table Mutations (`DATABASE_TABLE`)**: The Digital Twin parser and snapshots capture repositories, source files, workspace packages, dependencies, and configuration files. Database schema changes are represented through migration file diffs (`FILE` and `CONFIG`) rather than direct database vertex modeling in the static code twin.
2. **Security Vulnerabilities (`SECURITY_VULNERABILITY`)**: CVE ingestion and live vulnerability feeds are planned for a subsequent security intelligence phase; external dependency risks in v1 are grounded via `RS-DEP-003` (`EXTERNAL_DEPENDENCY` traversal).
3. **Container Infrastructure (`CONTAINER_INFRASTRUCTURE`)**: Infrastructure manifests (`Dockerfile`, Compose, Helm) are tracked via `CONFIG` nodes; dedicated cloud-runtime vertices are deferred to future runtime telemetry phases.

---

### 5. Asynchronous Processing & Auto-Trigger

- **Queue Name**: `release-safety-analysis`
- **Deterministic Job ID**: `release-safety-assessment-${assessmentId}`
- **Automatic Trigger**: `BlastRadiusAnalysisService` automatically enqueues release safety evaluation upon successful completion of blast radius analysis. The trigger is non-blocking and safe (`try/catch`).
- **Worker Host**: `ReleaseSafetyProcessor` processes jobs through `ReleaseSafetyAnalysisService.executeEvaluation(assessmentId)`.
- **Idempotency**: Repeated requests return the active or completed assessment without re-queuing unless `force: true` is explicitly provided.

---

### 6. RBAC & REST API Endpoints

All endpoints enforce multi-tenancy (`:organizationId` parameter and session membership validation):

| HTTP Method | Route | Permission Required | Roles Allowed | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/organizations/:orgId/changes/:changeSetId/release-safety/evaluate` | `release_safety.evaluate` | OWNER, ADMIN, ARCHITECT, DEVELOPER, RELEASE_MANAGER | Triggers or retries release safety evaluation. |
| `GET` | `/api/v1/organizations/:orgId/changes/:changeSetId/release-safety/latest` | `release_safety.read` | ALL 9 ROLES (including VIEWER, AUDITOR, CONTRIBUTOR) | Retrieves latest evaluation and summary for change set. |
| `GET` | `/api/v1/organizations/:orgId/release-safety/assessments/:assessmentId` | `release_safety.read` | ALL 9 ROLES | Retrieves full assessment by ID with evaluated signals. |
| `GET` | `/api/v1/organizations/:orgId/release-safety/assessments/:assessmentId/signals` | `release_safety.read` | ALL 9 ROLES | Lists paginated, filtered rule signals. |
| `GET` | `/api/v1/organizations/:orgId/release-safety/assessments` | `release_safety.read` | ALL 9 ROLES | Lists paginated assessments for the organization. |

---

### 7. Frontend User Experience

1. **Intelligence Hub**:
   - `/intelligence/release-safety`: Comprehensive organization-wide dashboard featuring aggregate metrics, decision distribution, risk score average, decision and risk level filters, and detailed change set links.
   - `/release/safety`: Direct route alias rendering the Release Safety dashboard.
2. **Change Detail Integration**:
   - `/workspace/changes/:changeSetId`:
     - **Overview Tab Card**: Real-time Release Safety decision badge, risk score, evaluated signals count, policy engine version, and one-click navigation to inspect all signals.
     - **Release Safety Tab (6th Tab)**: Full policy spectrum visualizer (progress bar with threshold indicators: Safe 0, Review Boundary 39, Block Boundary 74, Critical 100), re-evaluate button, status metrics, and complete signal table with Rule ID, Severity, Category, Impact, Score Delta, Title, Description, and Evidence References.

---

### 8. Verification & Acceptance Architecture

- **Acceptance Script**: `scripts/verify-phase-08.ps1`
  - Validates branch `phase-08-release-safety-foundation`
  - Validates base commit `dc56a395f4b015732367d8afae8dfb0bee020f38`
  - Checks exactly 7 migration directories in chronological order
  - Deploys migrations with network resilience
  - Checks frozen lockfile (`pnpm install --frozen-lockfile`)
  - Audits production packages (`pnpm audit --prod`)
  - Builds `@impactra/shared`, `@impactra/database`, `@impactra/api`, `@impactra/web`
  - Runs all API unit tests and comprehensive E2E tests (including RBAC, tenant isolation, and worker execution)
  - Scans for forbidden test markers (`.only`, `.skip`)
  - Executes comprehensive secret scanner across all tracked files without bypasses
  - Rebuilds and verifies Docker services
  - Runs Phase 06, Phase 07, and Phase 08 controlled fixtures end-to-end
  - Verifies runtime HTTP endpoints on `http://localhost:3001` (API) and `http://impactra.local` (Web).

## Final External Acceptance — 14 October 2026

**Status:** PHASE 08 COMPLETE — ALL AUTOMATED ACCEPTANCE GATES PASSED

**Official Verdict:** PHASE 08 ACCEPTANCE CHECKS: ALL GATES PASS

Phase 08 Deterministic Release Safety & Release Decision Foundation successfully passed the complete external acceptance runner.

### Verified Acceptance

- Exactly 7 canonical Prisma migrations.
- Historical migrations 1–6 preserved.
- Prisma validation passed.
- Prisma migrate deploy passed.
- Prisma migration status reported zero unapplied migrations.
- Prisma client generation passed.
- Frozen lockfile install passed.
- Production dependency audit passed with zero known vulnerabilities.
- @impactra/shared build passed.
- @impactra/database build passed.
- API typecheck passed.
- API production build passed.
- API unit tests passed.
- API E2E: 7 / 7 suites passed.
- API E2E: 82 / 82 tests passed.
- Web lint passed.
- Web typecheck passed.
- Web production build passed.
- git diff --check passed.
- Forbidden .only/.skip check passed.
- Secret scan passed.
- Docker API/Web rebuild passed.
- impactra-api reported healthy.
- Phase 06 controlled fixture passed.
- Phase 07 deterministic Blast Radius fixture passed.
- Phase 08 deterministic Release Safety fixture passed.
- Required API and frontend runtime routes returned HTTP 200.
- Manual visual verification approved before Git closure.

### Final Controlled Release Safety Evidence

- REAL_RELEASE_SAFETY_ASSESSMENT_ID: $AssessmentId
- REAL_CHANGE_SET_ID: $ChangeSetId
- REAL_BLAST_RADIUS_ANALYSIS_ID: $BlastRadiusAnalysisId
- REAL_ORG_ID: $OrgId
- RELEASE_RISK_SCORE: $RiskScore
- RELEASE_RISK_LEVEL: $RiskLevel
- RELEASE_DECISION: $Decision
- SIGNAL_COUNT: $SignalCount
- BLOCKING_SIGNAL_COUNT: $BlockingSignalCount
- REVIEW_SIGNAL_COUNT: $ReviewSignalCount
- POLICY_VERSION: $PolicyVersion
- Assessment Status: SUCCEEDED

The Release Safety score is deterministic policy scoring. It is not failure probability, outage probability, AI confidence, or LLM output.

### Runtime URLs

- Primary Website: http://impactra.local
- Repository Onboarding: http://impactra.local/workspace/repositories
- Changes: http://impactra.local/workspace/changes
- Blast Radius: http://impactra.local/intelligence/blast-radius
- Release Safety: http://impactra.local/intelligence/release-safety
- Release Safety Alias: http://impactra.local/release/safety
- Controlled Change: http://impactra.local/workspace/changes/41496987-f4db-43ea-acbb-c01b9ee9f224
- API: http://localhost:3001
- Swagger: http://localhost:3001/api/docs
- Health: http://localhost:3001/health
- Readiness: http://localhost:3001/ready

Phase 08 is accepted for Git closure.
