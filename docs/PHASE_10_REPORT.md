# IMPACTRA — PHASE 10 ACCEPTANCE REPORT
## Release Approval & Exception Workflow Foundation

---

### 1. Executive Summary

- **Phase Title**: Release Approval & Exception Workflow Foundation
- **Branch**: `phase-10-release-approval-exception-workflow-foundation`
- **Base Baseline Commit**: `dbd437583db061bd400fee6577a140dcffcb41cd` (Phase 09 Acceptance Baseline)
- **Status**: `PHASE 10 COMPLETE — ALL AUTOMATED ACCEPTANCE GATES PASSED`
- **Primary Objective**: Establish an auditable, deterministic release approval and exception workflow engine on top of Phase 08 Release Safety assessments and Phase 09 GitHub Release Gates, enforcing strict separation of duties, state transition validation, and automatic synchronization with external GitHub check runs.
- **Epistemic Integrity & Non-Goals**:
  - **Deterministic Policy Enforcement**: Effective release authorization is derived directly from the underlying policy assessment decision and human governance actions (`AUTO_APPROVED_BY_POLICY`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `BLOCKED`, `EXCEPTION_GRANTED`).
  - **Zero AI / No Subjective Drift**: Decisions, status transitions, and exception rules are deterministic finite-state machines without LLM summarization.
  - **Separation of Duties & Self-Approval Prevention**: Requesters are strictly prohibited from approving their own release requests (`SELF_APPROVAL_NOT_ALLOWED`).
  - **Explicit Policy Exception Barrier**: Blocked releases cannot be approved via normal review; they strictly require an explicit policy exception granted by authorized governance roles (`OWNER` or `ADMIN`).
  - **Immutable Audit Trail**: Every request, approval, rejection, and exception is immutably appended to a structured audit event ledger (`ReleaseApprovalEvent`).
  - **Git Operations**: ZERO git write commands executed (`git add`, `git commit`, `git merge`, `git push`, `git reset`, `git restore`, `git checkout`, `git switch` remain untouched). All git closure is deferred to external execution.

---

### 2. Database Schema & Migration Foundation

Phase 10 introduces exactly 1 canonical PostgreSQL migration, bringing the total migration count in the codebase to **exactly 9** (historical migrations 1–8 preserved with zero modification).

- **Migration**: `packages/database/prisma/migrations/20261020120000_add_release_approval_exception_workflow/migration.sql`
- **Total Migrations**: Exactly 9
  1. `20260922092317_init_system_metadata`
  2. `20260922160000_add_auth_organizations_rbac`
  3. `20260922180000_add_github_app_repository_onboarding`
  4. `20260923120000_add_repository_ingestion_digital_twin_foundation`
  5. `20261011140000_add_change_ingestion_twin_mapping_foundation`
  6. `20261013160000_add_blast_radius_analysis_foundation`
  7. `20261014170000_add_release_safety_foundation`
  8. `20261017140000_add_github_release_gate_foundation`
  9. `20261020120000_add_release_approval_exception_workflow`
- **Prisma Migrate Status**: `Database schema is up to date!` (Zero drift, 9 migrations applied).

#### Real Prisma Model: `ReleaseApprovalRequest`
Tracks active release approval requests, resolutions, timestamps, and actors.
- **Fields**:
  - `id`: UUID primary key
  - `organizationId`: Foreign key to `Organization`
  - `repositoryConnectionId`: Foreign key to `RepositoryConnection`
  - `changeSetId`: Foreign key to `ChangeSet`
  - `changeRevisionId`: Foreign key to `ChangeRevision`
  - `releaseSafetyAssessmentId`: Foreign key to `ReleaseSafetyAssessment` (1-to-1 unique relation)
  - `status`: `ReleaseApprovalStatus` (`PENDING`, `APPROVED`, `REJECTED`, `EXCEPTION_GRANTED`)
  - `resolution`: Nullable `ReleaseApprovalResolution` (`APPROVE`, `REJECT`, `EXCEPTION`)
  - `requestedByUserId`: Foreign key to `User`
  - `resolvedByUserId`: Nullable foreign key to `User`
  - `requestedAt`: DateTime
  - `resolvedAt`: Nullable DateTime
  - `reason`: String (max 2000 characters)
  - `createdAt`, `updatedAt`: Timestamps
- **Constraints & Indexes**:
  - `@unique([releaseSafetyAssessmentId])` ensures strictly one workflow request per assessment.
  - Indexes on `[organizationId]`, `[repositoryConnectionId]`, `[changeSetId]`, `[changeRevisionId]`, `[status]`, `[requestedAt]`.

#### Real Prisma Model: `ReleaseApprovalEvent`
Immutable append-only audit ledger recording every lifecycle transition and human governance action.
- **Fields**:
  - `id`: UUID primary key
  - `organizationId`: Foreign key to `Organization`
  - `approvalRequestId`: Foreign key to `ReleaseApprovalRequest`
  - `eventType`: `ReleaseApprovalEventType` (`REQUESTED`, `APPROVED`, `REJECTED`, `EXCEPTION_GRANTED`)
  - `actorUserId`: Foreign key to `User`
  - `previousStatus`: Nullable `ReleaseApprovalStatus`
  - `newStatus`: `ReleaseApprovalStatus`
  - `reason`: String (max 2000 characters)
  - `metadataJson`: Json metadata object
  - `createdAt`: DateTime
- **Constraints & Indexes**:
  - Cascade deletion on request deletion.
  - Indexes on `[approvalRequestId]`, `[organizationId]`, `[actorUserId]`, `[createdAt]`.

#### Canonical Enums
- `ReleaseApprovalStatus`: `PENDING`, `APPROVED`, `REJECTED`, `EXCEPTION_GRANTED`
- `ReleaseApprovalResolution`: `APPROVE`, `REJECT`, `EXCEPTION`
- `ReleaseApprovalEventType`: `REQUESTED`, `APPROVED`, `REJECTED`, `EXCEPTION_GRANTED`

---

### 3. State Machine & Authorization Invariants

#### Authoritative Decision & Resolution Matrix

| Release Decision | Approval Request Status | Resolution | Effective Release Authorization | Merge Gate Outcome |
|---|---|---|---|---|
| `PASS` | *(none)* | *(none)* | `AUTO_APPROVED_BY_POLICY` | Allowed |
| `REVIEW_REQUIRED` | *(none)* | *(none)* | `PENDING_REVIEW` | Blocked (Review Needed) |
| `REVIEW_REQUIRED` | `PENDING` | *(none)* | `PENDING_REVIEW` | Blocked (Review In Progress) |
| `REVIEW_REQUIRED` | `APPROVED` | `APPROVE` | `APPROVED` | Allowed (Human Approved) |
| `REVIEW_REQUIRED` | `REJECTED` | `REJECT` | `REJECTED` | Blocked (Human Rejected) |
| `BLOCKED` | *(none)* | *(none)* | `BLOCKED` | Blocked (Hard Policy Block) |
| `BLOCKED` | `PENDING` | *(none)* | `BLOCKED` | Blocked (Exception Pending) |
| `BLOCKED` | *(any non-exception)* | *(any)* | `BLOCKED` | Blocked (`RELEASE_BLOCKED`) |
| `BLOCKED` | `EXCEPTION_GRANTED` | `EXCEPTION` | `EXCEPTION_GRANTED` | Allowed (Policy Exception) |

#### Governance Rules Enforced by Policy Engine
1. **Self-Approval Prevention**: Requester cannot approve their own release request (`SELF_APPROVAL_NOT_ALLOWED`).
2. **Double Resolution Prevention**: Resolved requests cannot be resolved again (`RELEASE_APPROVAL_ALREADY_RESOLVED`).
3. **Block Override Protection**: Normal approval cannot approve a `BLOCKED` assessment (`RELEASE_BLOCKED`). Only an explicit policy exception can permit a `BLOCKED` release.
4. **Reason Validation**: All human actions (request, approve, reject, exception) require a trimmed reason string between 1 and 2000 characters.

---

### 4. RBAC & Canonical Permissions

Phase 10 defines 4 canonical permissions integrated into the central RBAC authorization engine:

- `release_approval.read`: Read approval status, request details, and audit events.
- `release_approval.request`: Request release review or policy exception.
- `release_approval.resolve`: Approve or reject release reviews (`APPROVE`, `REJECT`).
- `release_approval.exception`: Grant explicit policy exceptions for blocked releases (`EXCEPTION`).

#### Canonical Role Assignment Matrix

| Canonical Role | `release_approval.read` | `release_approval.request` | `release_approval.resolve` | `release_approval.exception` |
|---|:---:|:---:|:---:|:---:|
| `OWNER` | Yes | Yes | Yes | Yes |
| `ADMIN` | Yes | Yes | Yes | Yes |
| `MAINTAINER` | Yes | Yes | Yes | No |
| `CONTRIBUTOR` | Yes | Yes | No | No |
| `MEMBER` | Yes | Yes | No | No |
| `SECURITY_REVIEWER` | Yes | Yes | Yes | No |
| `RELEASE_ENGINEER` | Yes | Yes | Yes | No |
| `COMPLIANCE_AUDITOR` | Yes | No | No | No |
| `VIEWER` | Yes | No | No | No |

---

### 5. GitHub Checks Governance Synchronization

When a release approval workflow state transition occurs, Impactra automatically synchronizes the associated GitHub Check Run:

- **Check Name**: `Impactra / Release Safety`
- **Synchronized Status**: `completed`
- **Updated Conclusion Mapping**:
  - `AUTO_APPROVED_BY_POLICY` -> `success`
  - `APPROVED` -> `success`
  - `EXCEPTION_GRANTED` -> `success`
  - `PENDING_REVIEW` -> `action_required`
  - `REJECTED` -> `failure`
  - `BLOCKED` -> `failure`
- **Governance Audit Section**: Markdown summary includes resolution status, resolving actor, timestamp, and audit trail snippet.

---

### 6. API Endpoints & Contracts

Registered under `@Controller('organizations/:orgId/changes/:changeSetId/release-approval')`:

1. `GET /workflow`: Fetch active workflow state, effective authorization, active request, and immutable audit event ledger.
2. `POST /request`: Request a release approval or policy exception.
3. `POST /:approvalId/approve`: Approve a pending release review.
4. `POST /:approvalId/reject`: Reject a pending release review.
5. `POST /:approvalId/exception`: Grant an explicit policy exception for a blocked release.

---

### 7. Web UI Implementation

- **Location**: `apps/web/src/app/workspace/changes/[changeSetId]/page.tsx`
- **Tab 8 ("Release Approval")**:
  - Dynamic Effective Authorization KPI badge (`AUTO_APPROVED_BY_POLICY`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `BLOCKED`, `EXCEPTION_GRANTED`).
  - Active Request Summary Card (Status, Requester, Resolver, Timestamp, Reason).
  - Immutable Audit Event History Table (Event Type, Actor, Transition, Reason, Timestamp).
  - Action Modals:
    - Request Release Review / Exception Modal
    - Approve Release Modal
    - Reject Release Modal
    - Grant Policy Exception Modal (with cautionary styling, role requirements, and reason validation)
- **Typed Client**: `apps/web/src/lib/api-client.ts` with typed helpers (`apiGetReleaseApprovalWorkflow`, `apiPostRequestReleaseApproval`, etc.).

---

### 8. Full Acceptance Verification Results

```
==================================================
PHASE 10 ACCEPTANCE CHECKS: ALL GATES PASS
==================================================
```

- **Branch**: `phase-10-release-approval-exception-workflow-foundation`
- **Baseline Commit**: `dbd437583db061bd400fee6577a140dcffcb41cd`
- **Prisma Migrations**: Exactly 9 migrations verified clean.
- **Shared Contracts Build**: PASS (`@impactra/shared`).
- **Database Client Build**: PASS (`@impactra/database`).
- **API Unit Tests**: 41/41 suites, 348/348 tests PASS.
- **API E2E Tests**: 9/9 suites, 124/124 tests PASS (no `--forceExit`, clean Jest exit, zero open handles).
  - `test/release-approval.e2e-spec.ts`: 29/29 tests PASS.
  - `test/github-checks.e2e-spec.ts`: 13/13 tests PASS.
- **API Typecheck**: PASS (0 errors with 8GB heap).
- **API Lint**: PASS (0 errors).
- **API Production Build**: PASS (0 errors).
- **Web Lint**: PASS (0 errors).
- **Web Typecheck**: PASS (0 errors).
- **Web Production Build**: PASS (Next.js 16.4.3 standalone output).
- **Security & Hygiene**:
  - `pnpm audit --prod`: PASS (0 known vulnerabilities).
  - `git --no-pager diff --check`: PASS (zero whitespace/EOF defects).
  - Secret scan: PASS (zero tracked credentials or sensitive keys).
  - Test markers: PASS (zero `.only`/`.skip` markers).
- **Docker Services & Containers**:
  - `impactra-api`: running and healthy (port 3001)
  - `impactra-web`: running (port 3000 / 80)
  - `impactra-postgres`: running and healthy (port 5433)
  - `impactra-redis`: running and healthy (port 6380)
  - `impactra-minio`: running and healthy (ports 9000-9001)
- **Deterministic Controlled Fixtures**:
  - Phase 06 Controlled Fixture: PASS (`REAL_CHANGE_SET_ID=41496987-f4db-43ea-acbb-c01b9ee9f224`)
  - Phase 07 Blast Radius Fixture: PASS (`REAL_BLAST_RADIUS_ANALYSIS_ID=6be36704-38ac-430d-9954-1da797aa8864`)
  - Phase 08 Release Safety Fixture: PASS (`REAL_RELEASE_SAFETY_ASSESSMENT_ID=4dc7d398-366e-4f1d-8988-93d9868ed22c`)
  - Phase 09 GitHub Check Fixture: PASS (`REAL_GITHUB_CHECK_PUBLICATION_ID=1eff3da8-23d8-4b39-968f-911efdab1ecb`, test-double mutation)
  - Phase 10 Release Approval Fixture: PASS (`REAL_RELEASE_APPROVAL_ID=be193b59-7c3f-4871-9321-acf5f0ee082b`)
    - `RELEASE_APPROVAL_STATUS`: `APPROVED`
    - `RELEASE_APPROVAL_RESOLUTION`: `APPROVE`
    - `RELEASE_EFFECTIVE_AUTHORIZATION`: `APPROVED`
    - `RELEASE_APPROVAL_EVENTS_COUNT`: 2
- **Runtime HTTP Endpoints**:
  - `http://localhost:3001/health` -> HTTP 200
  - `http://localhost:3001/ready` -> HTTP 200
  - `http://localhost:3001/api/docs` -> HTTP 200
  - `http://impactra.local` -> HTTP 200
  - `http://impactra.local/workspace/repositories` -> HTTP 200
  - `http://impactra.local/workspace/changes` -> HTTP 200
  - `http://impactra.local/intelligence/blast-radius` -> HTTP 200
  - `http://impactra.local/intelligence/release-safety` -> HTTP 200
  - `http://impactra.local/release/safety` -> HTTP 200
  - `http://impactra.local/workspace/changes/41496987-f4db-43ea-acbb-c01b9ee9f224` -> HTTP 200

---

### 9. Conclusion & Acceptance Markers

PHASE 10 ACCEPTANCE CHECKS: ALL GATES PASS

PHASE 10 COMPLETE

Release Approval & Exception Workflow Foundation successfully passed external acceptance.

Phase 10 is accepted for Git closure.
