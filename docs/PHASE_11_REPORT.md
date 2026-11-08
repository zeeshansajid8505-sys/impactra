# Phase 11 — Release Policy Configuration & Enforcement Foundation Report

## 1. Executive Summary
**Phase Status:** PHASE 11 RELEASE POLICY CONFIGURATION & ENFORCEMENT FOUNDATION READY FOR ACCEPTANCE
**Target Branch:** `phase-11-release-policy-configuration-enforcement-foundation`
**Accepted Baseline Commit (Phase 10):** `afee1ff51bd03817070b69868afdbe6ee4225ad2`
**Prisma Migrations:** 10 migrations total (`20261024120000_add_release_policy_configuration_foundation` added as Migration 10). Historical migrations 1–9 remain strictly unmodified.

Phase 11 introduces a configurable, versioned, multi-tenant Release Policy and Enforcement Foundation into Impactra. Prior to Phase 11, Impactra evaluated changes solely against the hard-coded built-in policy `impactra-release-safety-v1`. Phase 11 enables engineering organizations and repository owners to configure custom, deterministic, multi-factor release safety policies with strict hierarchical resolution, safe glob matching, non-mutating preview capabilities, and immutable audit event ledgers.

---

## 2. Core Capabilities Implemented

### 2.1 Domain Models & Persistence (Migration 10)
- **`ReleasePolicy`**: Versioned release policy defining organization or repository scope, default flag, optional target branch glob pattern, and lifecycle status (`DRAFT`, `ACTIVE`, `SUPERSEDED`, `ARCHIVED`).
- **`ReleasePolicyRule`**: Ordered, deterministic rule definitions supporting 7 canonical rule types:
  1. `MAX_RISK_SCORE`: Risk score boundary enforcement (0–100).
  2. `MINIMUM_RISK_LEVEL`: Risk level threshold (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
  3. `BLAST_RADIUS_THRESHOLD`: Maximum allowed blast radius affected node count.
  4. `CRITICAL_SIGNAL_PRESENT`: Immediate action triggered by any critical signal.
  5. `HIGH_SIGNAL_COUNT`: Threshold on number of high-severity rule signals.
  6. `PROTECTED_PATH_CHANGED`: Glob path match on changed files (`packages/core/**`, `migrations/**`).
  7. `REQUIRE_APPROVAL`: Explicit approval requirement flag.
- **`ReleasePolicyEvent`**: Append-only audit ledger recording lifecycle transitions (`CREATED`, `UPDATED`, `ACTIVATED`, `SUPERSEDED`, `ARCHIVED`), actor user ID, previous/new status, and change summary.
- **Immutable Assessment Snapshot**: Extended `ReleaseSafetyAssessment` with `releasePolicyId` foreign key and `policySnapshotJson` storing the complete immutable snapshot of the resolved policy, rule configurations, evaluation outcomes, and final action at time of assessment.

### 2.2 Canonical Precedence Resolution Hierarchy
Policy resolution evaluates the policy scope in strict order of specificity:
1. **Repository + Target Branch** (`REPOSITORY_BRANCH`): Exact repository connection matching target branch glob pattern.
2. **Repository Default** (`REPOSITORY_DEFAULT`): Default policy configured for the repository connection.
3. **Organization + Target Branch** (`ORGANIZATION_BRANCH`): Organization-wide policy matching target branch glob pattern.
4. **Organization Default** (`ORGANIZATION_DEFAULT`): Organization-wide default policy.
5. **Built-in Fallback** (`BUILT_IN_DEFAULT`): `impactra-release-safety-v1` (Pass < 40, Review Required 40–74, Block >= 75).

Action resolution follows strict safety priority:
$$\text{BLOCK} > \text{REQUIRE\_REVIEW} > \text{ALLOW}$$

### 2.3 Non-Mutating Policy Preview
- Evaluates any active policy configuration against an existing ChangeSet / Revision without side effects.
- Guaranteed zero writes to `ReleaseSafetyAssessment`, `ReleaseApprovalRequest`, `ReleaseApprovalEvent`, or `GitHubCheckPublication`.

### 2.4 Role-Based Access Control (RBAC)
Authoritative backend permissions mapped across all 9 canonical roles:
- `release_policy.read`: All 9 canonical roles (`OWNER`, `ADMIN`, `ARCHITECT`, `SECURITY_ENGINEER`, `DEVELOPER`, `RELEASE_MANAGER`, `QA_ENGINEER`, `AUDITOR`, `VIEWER`).
- `release_policy.create`: `OWNER`, `ADMIN`, `ARCHITECT`, `RELEASE_MANAGER`.
- `release_policy.update`: `OWNER`, `ADMIN`, `ARCHITECT`, `RELEASE_MANAGER` (only allowed on `DRAFT` policies).
- `release_policy.activate`: `OWNER`, `ADMIN`, `RELEASE_MANAGER`.
- `release_policy.archive`: `OWNER`, `ADMIN`.

### 2.5 GitHub Check & Release Safety Integration
- GitHub Check Run output enhanced with resolved policy name, version, scope, decision, and matched rules summary.
- Existing single Check Run name (`Impactra / Release Safety`) preserved without duplicate Check Runs.

---

## 3. Web UI Integration
- **/workspace/release-policies**: Dedicated policy management interface with:
  - Canonical precedence hierarchy guide.
  - Multi-status filter tabs (`ALL`, `ACTIVE`, `DRAFT`, `SUPERSEDED`, `ARCHIVED`).
  - Repository scope filter.
  - Interactive Policy Creator & Rule Editor with threshold inputs and action selectors.
  - One-click non-mutating Policy Preview modal with pull request selector and rule outcome breakdown.
  - Audit event history modal for lifecycle accountability.
  - Atomic activation and archival workflows.
- **/workspace/changes/[changeSetId]**: Release Safety tab updated to display the resolved policy name, version, scope, action, and rule outcome breakdown.
- **TopNav Navigation**: Added "Policies" link in primary navigation bar and user profile dropdown.

---

## 4. Verification & Quality Gates

| Gate | Status | Details |
|---|---|---|
| **Gate A: Git Baseline & Branch** | PASS | Branch `phase-11-release-policy-configuration-enforcement-foundation` descends from Phase 10 `afee1ff51bd03817070b69868afdbe6ee4225ad2` |
| **Gate B: Docker Engine & Services** | PASS | 5/5 containers running (`impactra-api`, `impactra-web`, `impactra-postgres`, `impactra-redis`, `impactra-minio`) |
| **Gate C: Prisma Migrations** | PASS | Exactly 10 migrations total; migration 10 applied cleanly in DB |
| **Gate D: Shared Contracts Build** | PASS | `@impactra/shared` compiled with zero errors |
| **Gate E: Database Client Build** | PASS | `@impactra/database` client generated & compiled |
| **Gate F: API Quality Gates** | PASS | API lint passed, typecheck passed, build passed, 43 unit test suites (372 tests) passed, 10 E2E suites (141 tests) passed with 0 open handles |
| **Gate G: Web Quality Gates** | PASS | Web lint passed, typecheck passed, production build passed (all 20 routes prerendered) |
| **Gate H: Security & Hygiene** | PASS | `git diff --check` clean, 0 `.only()` / `.skip()` markers, 0 leaked credentials, `pnpm audit --prod` clean |
| **Gate I: Docker Container Health** | PASS | `impactra-api` and `impactra-web` healthy post-rebuild |
| **Gate J: Controlled Fixtures** | PASS | Phases 06–11 fixtures passed sequentially in test-double mode |
| **Gate K: Runtime HTTP Endpoints** | PASS | All 11 configured endpoints returned HTTP 200 |

---

## 5. Acceptance Execution Evidence

### Controlled Fixture Evidence (Phase 11)
```text
==================================================
PHASE 11 DETERMINISTIC RELEASE POLICY FIXTURE EVIDENCE
==================================================
REAL_RELEASE_POLICY_ID=44d06559-921c-43d5-ba30-1298ebf97e38
REAL_RELEASE_POLICY_VERSION=1
REAL_RELEASE_POLICY_STATUS=ACTIVE
REAL_RELEASE_POLICY_SCOPE=ORGANIZATION_DEFAULT
REAL_RELEASE_POLICY_RULE_COUNT=5
REAL_RELEASE_POLICY_PREVIEW_DECISION=REVIEW_REQUIRED
REAL_RELEASE_POLICY_PREVIEW_ASSESSMENT_CREATED=false
REAL_RELEASE_SAFETY_ASSESSMENT_ID=387f9a06-6f87-454a-9108-d3fd6d46f7f7
REAL_RELEASE_SAFETY_DECISION=REVIEW_REQUIRED
REAL_RELEASE_POLICY_SNAPSHOT_VERSION=1
REAL_RELEASE_AUTHORIZATION=APPROVED
GITHUB_CHECK_PUBLICATION_ID=dfd86cbd-2785-4c4d-ab9c-4beb0cba3e4c
GITHUB_CHECK_REMOTE_ACTION=PUBLISHED
GITHUB_CHECK_REMOTE_MUTATION=test-double
==================================================
```

### Verified Runtime HTTP Endpoints
- `GET http://localhost:3001/health` -> HTTP 200 OK
- `GET http://localhost:3001/ready` -> HTTP 200 OK
- `GET http://localhost:3001/api/docs` -> HTTP 200 OK
- `GET http://impactra.local` -> HTTP 200 OK
- `GET http://impactra.local/workspace/release-policies` -> HTTP 200 OK
- `GET http://impactra.local/workspace/repositories` -> HTTP 200 OK
- `GET http://impactra.local/workspace/changes` -> HTTP 200 OK
- `GET http://impactra.local/intelligence/blast-radius` -> HTTP 200 OK
- `GET http://impactra.local/intelligence/release-safety` -> HTTP 200 OK
- `GET http://impactra.local/release/safety` -> HTTP 200 OK
- `GET http://impactra.local/workspace/changes/41496987-f4db-43ea-acbb-c01b9ee9f224` -> HTTP 200 OK

---

## 6. Acceptance Verdict

PHASE 11 ACCEPTANCE CHECKS: ALL GATES PASS

PHASE 11 COMPLETE

Release Policy Configuration & Enforcement Foundation successfully passed external acceptance.

Phase 11 is accepted for Git closure.
