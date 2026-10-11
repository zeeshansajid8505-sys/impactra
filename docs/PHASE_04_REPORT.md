# Phase 04 Report — GitHub App Integration, Installation Lifecycle & Repository Onboarding

**Project Name:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Document Version:** 1.0.0
**Phase:** Phase 04 — GitHub App Integration, Installation Lifecycle & Repository Onboarding
**Git Branch:** `phase-04-github-app-repository-onboarding`
**Status:** Implemented & Verified
**Date:** 2026-09-23

---

## 1. Executive Summary & Phase Objective

Phase 04 establishes the complete, production-grade GitHub App integration, installation lifecycle, secure webhook processing foundation, and repository onboarding workflows for Impactra.

Impactra analyzes pull requests, architecture impact, API contract drift, and database migration safety before code reaches production. To do this safely and securely, Impactra must establish authoritative tenant-to-repository bindings, authenticate with GitHub via short-lived installation access tokens, maintain reliable repository availability metadata, and verify incoming GitHub webhooks with timing-safe cryptographic checks.

### Strict Scope Boundaries & Compliance
In adherence to the platform architectural specifications:
- **Scope**: Connection, authentication, installation lifecycle, metadata onboarding, and secure webhook verification.
- **Strict Prohibitions Enforced**:
  - NO repository source code cloning or tarball downloading.
  - NO arbitrary execution of repository code or Dockerfiles.
  - NO AST or syntax tree parsing of repository code files (deferred to Phase 05+).
  - NO commit or pull request diff ingestion (deferred to Phase 05+).
  - NO Digital Twin system graph generation (deferred to Phase 05+).
  - NO GitHub Checks or Pull Request status comments (deferred to Phase 06+).

---

## 2. Architecture & Monorepo Topology

```
Impactra/
├── apps/
│   ├── web/                                 # Next.js 16.4.0 App Router UI
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   └── workspace/
│   │   │   │       ├── repositories/page.tsx # Full interactive repository onboarding UI
│   │   │   │       └── settings/page.tsx     # Org settings & session management
│   │   │   ├── components/layout/TopNav.tsx  # Connected Repositories navigation link
│   │   │   └── lib/
│   │   │       └── api-client.ts             # Typed GitHub & repository API client methods
│   │   └── ...
│   │
│   └── api/                                 # NestJS 11 Backend API
│       ├── src/
│       │   ├── github/                      # Phase 04 GitHub Module
│       │   │   ├── config/
│       │   │   │   └── github-config.service.ts # Safe config status & PEM decoder
│       │   │   ├── services/
│       │   │   │   ├── github-client.service.ts # Official Octokit & @octokit/auth-app client
│       │   │   │   ├── github-installation-state.service.ts # 256-bit hashed CSRF state
│       │   │   │   ├── github-installation.service.ts # Install lifecycle & token cache
│       │   │   │   ├── github-repository.service.ts # Paginated sync & connect/disconnect
│       │   │   │   └── github-webhook.service.ts # Timing-safe HMAC & event processing
│       │   │   ├── controllers/
│       │   │   │   ├── github.controller.ts # Public status, callback, and webhooks
│       │   │   │   ├── organization-github.controller.ts # Tenant install, sync, disconnect
│       │   │   │   └── organization-repository.controller.ts # Tenant repo CRUD & connect
│       │   │   ├── dto/
│       │   │   │   └── github.dto.ts        # Typed query & callback DTOs
│       │   │   └── github.module.ts         # Module wiring & exports
│       │   ├── authorization/
│       │   │   ├── permissions.enum.ts      # Added GitHub & Repository capabilities
│       │   │   └── permissions.policy.ts    # RBAC role capability mapping
│       │   ├── config/
│       │   │   ├── env.schema.ts            # Optional typed GitHub environment schema
│       │   │   └── configuration.ts         # GitHub configuration registration
│       │   ├── main.ts                      # Raw body capture for webhook verification
│       │   └── app.module.ts                # Registered GithubModule
│       └── test/                            # Unit & E2E integration test suites
│           ├── permissions.policy.spec.ts   # RBAC permission matrix unit tests
│           ├── github-installation-state.spec.ts # CSRF state entropy & hashing tests
│           ├── github-webhook.spec.ts       # HMAC signature & idempotency unit tests
│           ├── github-repository-sync.spec.ts # Pagination & sync unit tests
│           └── github.e2e-spec.ts           # 15-scenario complete E2E integration suite
│
├── packages/
│   ├── shared/                              # Shared types & API contracts
│   │   ├── src/api.ts                       # GitHub & Repository DTO interfaces
│   │   └── src/index.ts
│   └── database/                            # Prisma ORM & PostgreSQL migrations
│       ├── prisma/
│       │   ├── schema.prisma                # GitHub models & enum additions
│       │   └── migrations/
│       │       └── 20260922180000_add_github_app_repository_onboarding/ # Phase 04 migration
│       └── ...
└── docs/
    ├── GITHUB_APP_SETUP.md                  # Comprehensive GitHub App creation guide
    └── PHASE_04_REPORT.md                   # This report
```

---

## 3. Database Schema & Migration Foundation

### Verified Migration History

The database schema has evolved across three strictly verified and ordered migrations located in `packages/database/prisma/migrations/`:

1. `20260922092317_init_system_metadata`: Baseline system schema and audit metadata foundation (Phase 01–02).
2. `20260922160000_add_auth_organizations_rbac`: Users, credentials, organizations, tenant memberships, sessions, and RBAC foundation (Phase 03).
3. `20260922180000_add_github_app_repository_onboarding`: Phase 04 atomic migration introducing GitHub App installation bindings, CSRF state verification, repository connections, and webhook delivery audit logs.

### Models and Entities

1. **`GitHubInstallationStatus` (Enum)**:
   - Values: `ACTIVE`, `SUSPENDED`, `DELETED`, `DISCONNECTED`.

2. **`GitHubInstallation` (Table `github_installations`)**:
   - Represents a GitHub App installation linked to an Impactra tenant.
   - Fields: `id` (UUID PK), `organization_id` (FK to `organizations`), `github_installation_id` (String UNIQUE, prevents 64-bit int truncation), `account_id` (String), `account_login`, `account_type`, `repository_selection`, `permissions` (JSONB), `events` (JSONB), `status` (Enum), `installed_at`, `suspended_at`, `last_synced_at`, `created_at`, `updated_at`.
   - Constraints: Foreign key to `organizations` with `ON DELETE CASCADE`.

3. **`GitHubInstallationState` (Table `github_installation_states`)**:
   - Ephemeral CSRF installation state binding user and organization.
   - Fields: `id` (UUID PK), `organization_id` (FK), `user_id` (FK to `users`), `state_hash` (String UNIQUE), `expires_at`, `consumed_at`, `created_at`.
   - Security: Only the SHA-256 hash of the 256-bit random state token is persisted.

4. **`RepositoryConnection` (Table `repository_connections`)**:
   - Onboarded repository metadata tracked by Impactra.
   - Fields: `id` (UUID PK), `organization_id` (FK), `github_installation_id` (FK), `github_repository_id` (String), `owner_login`, `name`, `full_name`, `default_branch`, `is_private`, `visibility`, `archived`, `disabled`, `fork`, `html_url`, `available` (Boolean), `connected` (Boolean), `connected_at`, `disconnected_at`, `last_synced_at`, `created_at`, `updated_at`.
   - Constraints: `@@unique([organization_id, github_repository_id])`.
   - **Independent Availability vs Connection State Model**:
     - `available`: Tracks whether the repository currently exists and is accessible via the tenant's GitHub App installation.
     - `connected`: Tracks whether an Impactra tenant administrator has explicitly onboarded the repository for change intelligence analysis.
     - **Four Distinct Lifecycle States**:
       1. `available: true, connected: true`: Active repository actively tracked by Impactra.
       2. `available: true, connected: false`: Repository visible in GitHub installation, available for onboarding, but not yet connected.
       3. `available: false, connected: true`: Repository remains onboarded in Impactra, but GitHub access is temporarily or permanently unavailable (e.g. installation suspended, deleted, or repository unselected/deleted on GitHub). Impactra preserves historical metadata and connection timestamps (`connectedAt`); the UI displays `Connected — GitHub access unavailable` with an explicit `Disconnect` action (never `Connect`).
       4. `available: false, connected: false`: Inactive historical or discovered repository.
     - **Non-Destructive Webhook Semantics**:
       - `installation.deleted`: Sets `gitHubInstallation.status = 'DELETED'`, evicts token cache, marks `available = false`, strictly preserving `connected = true`.
       - `installation.suspend`: Sets `gitHubInstallation.status = 'SUSPENDED'`, records `suspendedAt`, evicts token cache, marks `available = false`, strictly preserving `connected = true`.
       - `installation.unsuspend`: Sets `gitHubInstallation.status = 'ACTIVE'`, clears `suspendedAt = null`, and triggers an authoritative synchronization via `GitHubRepositoryService.syncRepositories`. It does **NOT** blanket-restore all repositories to `available: true`, ensuring stale or removed repositories are never resurrected. If synchronization fails, repositories remain conservatively unavailable.
       - `installation_repositories.removed`: Validates repository IDs with safe runtime type narrowing and marks removed repositories `available = false` while preserving `connected = true`.
       - `repository.deleted`: Strictly scoped to the verified installation and tenant (`organizationId`, `githubInstallationId`, `githubRepositoryId`), preventing any cross-tenant data modification. Webhooks for unbound installations are rejected safely without mutating records.
       - Explicit user-initiated disconnect: The only action permitted to set `connected = false` and `disconnectedAt = now`.

5. **`GitHubWebhookDelivery` (Table `github_webhook_deliveries`)**:
   - Idempotent delivery log for incoming GitHub webhooks.
   - Fields: `id` (UUID PK), `github_delivery_id` (String UNIQUE), `event`, `action`, `github_installation_id`, `organization_id`, `payload_sha256`, `status`, `received_at`, `processed_at`, `failure_code`, `attempt_count`.

---

## 4. Security Architecture & Threat Defense

1. **Route-Scoped Raw Body Buffer Capture for Webhooks**:
   Express body parsing in `apps/api/src/main.ts` is explicitly route-scoped:
   - Dedicated middleware mounts specifically to `/github/webhooks` with a 5MB payload limit and captures the unmodified buffer (`req.rawBody = buf`) for HMAC signature validation.
   - Global API endpoints apply a conservative 1MB limit without raw body caching.
   - This eliminates memory footprint bloat, prevents denial-of-service (DoS) memory exhaustion from arbitrary payload caching, and guarantees bit-for-bit cryptographic fidelity during signature checks.

2. **Race-Safe Atomic Compare-and-Set (CAS) State Consumption**:
   To prevent race conditions and concurrent callback exploits:
   - `GitHubInstallationStateService.consumeStateForUser` executes an ownership check (`stateRecord.userId !== currentUserId`) *before* any database write. Unauthorized callers trigger `ForbiddenException` without consuming or burning the token, preserving it for the legitimate user.
   - The state consumption executes an atomic conditional write via Prisma `updateMany`:
     ```ts
     const updateResult = await databaseService.client.gitHubInstallationState.updateMany({
       where: {
         id: stateRecord.id,
         consumedAt: null,
         userId: currentUserId,
         expiresAt: { gt: new Date() },
       },
       data: { consumedAt: new Date() },
     });
     if (updateResult.count !== 1) {
       throw new ConflictException('Installation state token was consumed concurrently or has expired.');
     }
     ```
   - This guarantees that exactly one request succeeds among concurrent requests, while any competing concurrent request fails with `409 Conflict`.

3. **Timing-Safe HMAC-SHA256 Verification**:
   The `GitHubWebhookService` verifies incoming `x-hub-signature-256` headers using `crypto.createHmac('sha256', secret)` and `crypto.timingSafeEqual` between expected and actual byte buffers, preventing side-channel timing attacks.

4. **High-Entropy Installation CSRF Defense**:
   Installation initiation generates 32 bytes of cryptographically secure random data (`crypto.randomBytes(32)`), storing only the SHA-256 digest in PostgreSQL with a 15-minute TTL. The callback consumes this token in a single-use transaction.

5. **Cross-Tenant Installation Hijacking Prevention**:
   The callback explicitly checks whether `githubInstallationId` is already bound to another tenant. If already bound, the request is rejected with `409 Conflict`.

6. **Unknown Installation Protection**:
   Incoming `installation.created` webhooks without prior user-initiated OAuth state are NEVER automatically bound to any tenant.

7. **Redis Installation Token Caching**:
   Installation tokens are cached in Redis (`impactra:github:inst-token:<id>`) with an expiration safety buffer (expiring 90 seconds before GitHub's token expiry). Tokens are instantly evicted upon app disconnection, suspension, or deletion.

---

## 5. Role-Based Access Control (RBAC) Matrix

Four new capability permissions were added to `Permission` enum and wired into `ROLE_PERMISSIONS`:
- `GITHUB_INSTALLATION_READ` (`github_installation.read`)
- `GITHUB_INSTALLATION_MANAGE` (`github_installation.manage`)
- `REPOSITORY_READ` (`repository.read`)
- `REPOSITORY_MANAGE` (`repository.manage`)

| Role | Installation Read | Installation Manage | Repository Read | Repository Manage |
| :--- | :---: | :---: | :---: | :---: |
| **OWNER** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ |
| **ARCHITECT** | ✅ | ❌ | ✅ | ❌ |
| **SECURITY_ENGINEER** | ✅ | ❌ | ✅ | ❌ |
| **DEVELOPER** | ✅ | ❌ | ✅ | ❌ |
| **RELEASE_MANAGER** | ✅ | ❌ | ✅ | ❌ |
| **QA_ENGINEER** | ✅ | ❌ | ✅ | ❌ |
| **AUDITOR** | ✅ | ❌ | ✅ | ❌ |
| **VIEWER** | ✅ | ❌ | ✅ | ❌ |

> [!NOTE]
> In accordance with the least-privilege principle, `REPOSITORY_MANAGE` (connecting/disconnecting repositories and triggering on-demand repository synchronizations) is strictly restricted to **OWNER** and **ADMIN** roles. Non-administrative engineering roles (`ARCHITECT`, `DEVELOPER`) maintain read-only access to connected repositories and installation metadata.

---

## 6. API Endpoints & Contracts

### Public & GitHub Integration Routes (`GitHubController`)
- `GET /github/config/status`: Safe configuration status check without exposing secrets.
- `GET /github/installations/callback`: Callback endpoint handling CSRF consumption, tenant binding, and frontend redirect. Authenticated with `AuthGuard` and session cookies; strictly validates that the authenticated `currentUserId` matches the user who initiated the state token (`state.userId === currentUserId`). Rejects unauthenticated requests (401), mismatched users (redirect with error), and replay attempts (redirect with error).
- `POST /github/webhooks`: Raw body HMAC-SHA256 verified webhook receiver handling ping, installation, installation_repositories, and repository events. Fails closed if `GITHUB_WEBHOOK_SECRET` is unconfigured (401). Enforces strict verification ordering: (1) structural header validation -> (2) HMAC signature verification -> (3) delivery idempotency check -> (4) event dispatch -> (5) delivery state persistence.

### Tenant GitHub Routes (`OrganizationGitHubController`)
- `POST /organizations/:organizationId/github/installations/start`: Generates CSRF state and returns install URL (`GITHUB_INSTALLATION_MANAGE`).
- `GET /organizations/:organizationId/github/installation`: Returns current installation metadata (`GITHUB_INSTALLATION_READ`).
- `DELETE /organizations/:organizationId/github/installation`: Disconnects installation and marks repos unavailable (`GITHUB_INSTALLATION_MANAGE`).
- `POST /organizations/:organizationId/github/sync`: Triggers live repository pagination sync (`REPOSITORY_MANAGE`).

### Tenant Repository Routes (`OrganizationRepositoryController`)
- `GET /organizations/:organizationId/repositories`: Lists repositories with search, connection filters, and pagination (`REPOSITORY_READ`).
- `POST /organizations/:organizationId/repositories/:repositoryId/connect`: Connects repository for change intelligence (`REPOSITORY_MANAGE`).
- `POST /organizations/:organizationId/repositories/:repositoryId/disconnect`: Disconnects repository (`REPOSITORY_MANAGE`).

---

## 7. Frontend Integration (`/workspace/repositories`)

The frontend repository management interface was implemented in Next.js 16 App Router at `/workspace/repositories`:
- **State A (Loading)**: Clean indeterminate loading spinner.
- **State B (Not Configured)**: Informative banner showing which environment variables are required with a link to setup docs.
- **State C (Configured, Not Installed)**: Explains metadata boundary and provides an "Install Impactra GitHub App" button.
- **State D (Installed, 0 Repos)**: Shows linked GitHub organization and prominent "Sync Repositories" action.
- **State E (Synchronized)**:
  - Statistics bar showing Total Discovered, Active Connected, and Available in App.
  - Search input with clear button.
  - Status filter pills: All, Connected, Not Connected.
  - Interactive table displaying repository name (with external link), default branch, private/public badge, GitHub availability, and Connect/Disconnect toggles. Connect/Disconnect actions are conditionally rendered only for users with `OWNER` or `ADMIN` roles.
  - Pagination controls allowing navigation through multi-page repository listings.
- **State F (Disconnect App)**: Owner/Admin action to disconnect installation with confirmation.
- **Callback Notifications**: Listens to `?installation=success` or `?installation=error` URL parameters and displays dismissible alerts while cleaning URL query string.
- **Navigation**: Added "Connected Repositories" link to both desktop profile dropdown and mobile menu in `TopNav.tsx`.

---

## 8. Test Coverage & Verification

### Unit Test Suites (12 suites, 86 total tests)
1. **`env.schema.spec.ts`**: Configuration parsing, coercion, and validation.
2. **`health.service.spec.ts`**: Infrastructure dependencies health and readiness.
3. **`http-exception.filter.spec.ts` (4 tests)**: Exception filtering, formatting, credential redaction, and recognized 413 `entity.too.large` body-parser mapping.
4. **`password.service.spec.ts`**: Argon2id hashing, timing safety, and complexity checks.
5. **`token.service.spec.ts`**: 256-bit crypto randomness, URL-safe base64, and SHA-256 hashing.
6. **`permissions.policy.spec.ts`**: 9-role authorization matrix extended with Phase 04 capabilities, verifying `REPOSITORY_MANAGE` restriction strictly to OWNER/ADMIN and rejection for DEVELOPER/ARCHITECT/VIEWER.
7. **`tenant.guard.spec.ts`**: Tenant resolution and boundary isolation.
8. **`owner-safeguards.spec.ts`**: Multi-tenancy privilege escalation and owner protection.
9. **`github-installation-state.spec.ts` (10 tests)**: Verifies 256-bit entropy, SHA-256 state hashing, single-use consumption, expiration rejection, atomic ownership enforcement via `consumeStateForUser` (unauthorized user callbacks reject with 403 without burning tokens, permitting legitimate users to complete installation), argument validation, atomic compare-and-set (CAS) race-condition resilience via `Promise.allSettled` (guaranteeing exactly 1 winner, 1 rejected, and single database consumption), and deterministic CAS loser rejection with `ConflictException`.
10. **`github-webhook.spec.ts`**: Verifies HMAC-SHA256 signature verification, rejection of unconfigured secrets, rejection of invalid signatures before idempotency checks, duplicate delivery idempotency, installation lifecycle events (created, deleted, suspend, authoritative unsuspend sync, conservative fallback), malformed payload resilience without `any`, tenant/installation-scoped repository deletion, and unbound installation rejection.
11. **`github-repository-sync.spec.ts`**: Verifies repository metadata pagination sync, availability reconciliation without deletion, and connect/disconnect toggling.
12. **`github-token.spec.ts`**: Verifies official `@octokit/auth-app` strategy configuration, installation token minting, Redis caching with 90s safety margin, invalidation on lifecycle events, and base64 PEM decoding.

### E2E Integration Suites (3 suites, 44 total tests/scenarios)
1. **`health.e2e-spec.ts` (3 tests)**: Health probes and readiness.
2. **`auth.e2e-spec.ts` (16 tests/scenarios)**: User lifecycle, sessions, and multi-tenant RBAC.
3. **`github.e2e-spec.ts` (25 tests/scenarios)**:
  1. Config status endpoint returns non-sensitive status.
  2. Installation start without auth returns 401.
  3. Installation start with VIEWER role returns 403.
  4. Installation start with OWNER returns 201 with install URL and 64-char state token.
  5. Callback without authentication returns 401.
  6. Callback with missing parameters redirects with error.
  7. Callback with mismatched user (state initiated by User A, invoked by User B) redirects with error while preserving state unconsumed.
  8. Callback with valid state and matching user binds installation and redirects with success.
  9. Callback state replay attempt is rejected and redirects with error.
  10. Active installation query returns metadata.
  11. Repository sync endpoint populates repositories.
  12. Repository list query returns synced repositories with pagination.
  13. Connect repository marks repo as connected for OWNER.
  14. Connect repository with VIEWER role returns 403 Forbidden.
  15. Disconnect repository marks repo as disconnected for OWNER.
  16. Disconnect repository with VIEWER role returns 403 Forbidden.
  17. Webhook receiver processes signed delivery.
  18. Webhook receiver detects duplicate delivery and returns idempotent response.
  19. Webhook receiver rejects invalid HMAC signature with 401.
  20. Disconnect installation marks installation as DISCONNECTED.
  21. Standard JSON request >1MB returns 413 Payload Too Large.
  22. Standard JSON request just below 1MB limit reaches controller logic rather than 413.
  23. GitHub webhook request >5MB returns 413 Payload Too Large.
  24. Small valid signed webhook verifies exact HMAC and succeeds (200).
  25. Webhook with one-byte altered body rejects HMAC with 401 Unauthorized.

**Total Monorepo Automated Tests:** 15 suites, 130 tests passing (86 unit tests + 44 E2E scenarios).

---

## 9. Quality Gate & Security Hardening Details

### A. Next.js ESLint Flat Configuration & React Hook Architecture
- **Flat Config Schema Validation**:
  - Failure Diagnostic: `pnpm --filter @impactra/web run lint` failed with `TypeError: Key "plugins": Expected object, received array.`
  - Root Cause: `eslint-config-next/core-web-vitals` exported legacy config objects with `plugins: ['@next/next']` as an array rather than an object map required by ESLint 9 Flat Config.
  - Resolution: Updated `apps/web/eslint.config.mjs` to import native `nextConfig` directly from `'eslint-config-next'` (exporting valid flat config objects), and explicitly appended core-web-vitals rules (`@next/next/no-html-link-for-pages: error`, `@next/next/no-sync-scripts: error`), alongside standard global ignores. Pinned `next` and `eslint-config-next` to `16.4.0`.

- **React `react-hooks/set-state-in-effect` Architectural Corrections**:
  Once the ESLint 9 flat configuration successfully evaluated, the React hooks linter identified three genuine architectural `set-state-in-effect` violations in `apps/web/src/app/workspace/repositories/page.tsx`:
  1. *URL Callback Feedback Violation (line ~76)*:
     - Root Cause: Synchronous `setFeedback({...})` invocation inside a `useEffect` watching `searchParams`.
     - Resolution: URL callback messages are now derived pure data via `useMemo` (`callbackFeedback`). Separate action-triggered feedback state (`actionFeedback`) handles user operations (sync, connect, disconnect). Active feedback is derived via `actionFeedback ?? callbackFeedback`. The history effect purely cleans `window.location.pathname` via `window.history.replaceState` without touching any React state.
  2. *Initial Installation Fetch & Loading Mutation Violation (line ~126)*:
     - Root Cause: `useEffect(() => { void refreshInstallation(); }, [refreshInstallation])` invoked a handler that executed synchronous `setLoading(true)` on render.
     - Resolution: Refactored the effect to initiate asynchronous `Promise.all([apiGetGitHubConfigStatus(), apiGetGitHubInstallation(orgId)])` work directly, applying state updates strictly inside `.then(...)` and `.catch(...)` completion callbacks. Implemented a cancellation token (`let cancelled = false; return () => { cancelled = true; };`) preventing stale organization race conditions. Loading state is purely derived from request/organization identity: `isInstallationLoading = Boolean(activeOrg && loadedInstallationOrgId !== activeOrg.organization.id)`.
  3. *Repository Empty State Clearing Violation (line ~153)*:
     - Root Cause: Synchronously calling `setRepositories([])` and `setTotalRepos(0)` inside `useEffect` when an organization was unselected or disconnected.
     - Resolution: Removed synchronous state clearing from the effect. The effect returns early if disconnected or unselected. Displayed repositories and totals are derived dynamically:
       ```ts
       const canLoadRepositories = Boolean(activeOrg && installation && installation.status !== 'DISCONNECTED');
       const visibleRepositories = canLoadRepositories && loadedReposOrgId === activeOrg?.organization?.id ? repositories : [];
       const visibleTotalRepos = canLoadRepositories && loadedReposOrgId === activeOrg?.organization?.id ? totalRepos : 0;
       ```
       The repository fetch effect executes asynchronously with a 250ms debounce and cancellation guard, updating state solely inside `.then(...)` callbacks.
- **Rule Integrity**: No ESLint rules were disabled (`eslint-disable` was not used), no files were ignored, and no types were cast to `any`.
- **Final Lint Result**: `pnpm --filter @impactra/web run lint` exits code 0 with 0 errors and 0 warnings.

### B. Production Dependency Audit Posture & pnpm Workspace Overrides
- **11 Production Vulnerabilities Diagnosed & Resolved**:
  1. **Next.js RCE in `next/og` ImageResponse (CRITICAL, `>=16.2.0 <16.3.6`)** and related Next.js advisories requiring `>=16.3.8`:
     - Updated `apps/web/package.json` to `"next": "16.4.0"` and `"eslint-config-next": "16.4.0"`.
  2. **`source-map-js` (`>=1.0.0 <1.2.2`)** via Next.js PostCSS dependency tree:
     - Added workspace override `source-map-js: '>=1.2.2'`.
  3. **`sharp` (`<0.35.5`)** via Next.js image dependency tree:
     - Added workspace override `sharp: '>=0.35.5'`.
  4. **`multer` (`>=2.2.0 <2.4.0`)** previously pinned to vulnerable `2.3.0`:
     - Updated workspace override to `multer: '2.4.0'`.
  5. **`js-yaml` (`>=5.0.0 <=5.4.0`)** via `@nestjs/swagger`:
     - Added workspace override `js-yaml: '>=5.4.1'`.
- **Stale `pnpm.overrides` Warning in Root `package.json`**:
  In pnpm 9+/12+ workspace mode, root `package.json`'s `"pnpm": { "overrides": { ... } }` is deprecated, triggering the warning:
  `The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.overrides"`
  Removed the obsolete `"pnpm"` block from root `package.json`. Canonical workspace overrides reside exclusively in `pnpm-workspace.yaml` under `overrides:`. Frozen install (`pnpm install --frozen-lockfile`) completes with zero warnings.
- **Production Audit Result**: All production packages across `@impactra/database`, `@impactra/shared`, `@impactra/api`, and `@impactra/web` resolve cleanly with zero vulnerabilities (`0 known production vulnerabilities`).

### C. HTTP 413 Payload Too Large Error Handling
- **Root Cause**: When request payloads exceeded configured limits (1MB for general API, 5MB for GitHub webhooks), Express `body-parser` threw an error with `status: 413` / `type: 'entity.too.large'`. Because this was an Express Error rather than a NestJS `HttpException`, the global `AllExceptionsFilter` treated it as an unhandled generic error and returned HTTP 500 Internal Server Error.
- **Resolution**: Updated `AllExceptionsFilter` in `apps/api/src/common/filters/http-exception.filter.ts` to inspect error status:
  ```typescript
  } else if (
    (typeof (exception as any)?.status === 'number' && (exception as any).status === 413) ||
    (typeof (exception as any)?.statusCode === 'number' && (exception as any).statusCode === 413) ||
    (exception as any)?.type === 'entity.too.large'
  ) {
    statusCode = HttpStatus.PAYLOAD_TOO_LARGE;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  }
  ```
- Added unit tests in `http-exception.filter.spec.ts` and E2E tests in `github.e2e-spec.ts` verifying that oversized standard JSON (>1MB) and oversized webhook JSON (>5MB) return structured HTTP 413 without leaking internal parser details.

### D. Route-Scoped Raw Body Security & Request Typing
- Replaced unsafe `any` in `apps/api/src/main.ts` with explicit `RawBodyRequest` interface extending Express `Request` with `rawBody?: Buffer`.
- Middleware mounts specifically to `/github/webhooks` with 5MB limit and captures raw buffer for HMAC verification. Standard API endpoints use a 1MB limit without raw body caching.

### E. Concurrency Test Semantics & CAS Security Invariant
- **Scheduling Analysis**: In concurrent execution of `consumeStateForUser(state, userId)`, if Execution A completes its CAS update before Execution B completes its initial read, Execution B observes `consumedAt !== null` and correctly throws `BadRequestException`. Alternatively, if both observe `consumedAt === null` simultaneously, one wins the CAS and the other receives `count === 0` producing `ConflictException`.
- **Test Alignment**: In `github-installation-state.spec.ts`, the concurrency test verifies the fundamental invariant: exactly 1 request fulfills, exactly 1 request is rejected with either `BadRequestException` or `ConflictException`, the state is consumed once, and replay is rejected. A second deterministic test explicitly verifies the CAS loser (`count === 0`) path producing `ConflictException`.

### F. Physical Database Schema & Snake-Case Column Mapping Proof
- In `packages/database/prisma/schema.prisma`, model `GitHubWebhookDelivery` maps to physical PostgreSQL table `github_webhook_deliveries` (`@@map`) with snake_case columns:
  - `githubDeliveryId` -> `github_delivery_id` (`@map`)
  - `githubInstallationId` -> `github_installation_id` (`@map`)
  - `organizationId` -> `organization_id` (`@map`)
  - `payloadSha256` -> `payload_sha256` (`@map`)
  - `receivedAt` -> `received_at` (`@map`)
  - `processedAt` -> `processed_at` (`@map`)
  - `failureCode` -> `failure_code` (`@map`)
  - `attemptCount` -> `attempt_count` (`@map`)
- Queries against `information_schema.columns` must match `column_name = 'github_delivery_id'`.

### G. GitHub E2E Test Fixture Bootstrap Fix
- **Failure Diagnostic & Root Cause**:
  During E2E test setup in `apps/api/test/github.e2e-spec.ts`, the Express middleware configuration invoked `app.use(urlencoded({ extended: true, limit: '1mb' }))`. However, line 6 only imported `{ json }` from `'express'`, omitting `urlencoded`. Node threw `ReferenceError: urlencoded is not defined` during module initialization, preventing the entire GitHub E2E suite from bootstrapping.
- **Resolution**:
  Updated line 6 in `apps/api/test/github.e2e-spec.ts` to `import { json, urlencoded } from 'express';`. Preserved route-scoped 5MB raw body parser for `/github/webhooks`, 1MB global payload limits, `AllExceptionsFilter`, and `AppValidationPipe`. Both E2E run 1 and run 2 passed completely (3 suites, 44 scenarios passing with 100% idempotency).

---

## 10. Source-Level Security Closure & Concurrency Invariants

### 1. Webhook Claim-Before-Dispatch Ordering
- In `apps/api/src/github/services/github-webhook.service.ts` (`processWebhook`), execution strictly adheres to the hardened security pipeline:
  1. Header presence checks (`x-github-delivery`, `x-github-event`).
  2. Cryptographic HMAC-SHA256 signature verification (`verifySignature`). Invalid signatures or missing secrets immediately throw `UnauthorizedException`, producing **zero** database delivery rows.
  3. Payload hash and metadata calculation (`payloadSha256`, `githubInstallationId`, `organizationId`).
  4. **Atomic DB Claim (`gitHubWebhookDelivery.create`) BEFORE any business side effects**.
  5. Event dispatch (`handleEvent`) is executed **strictly by the winning claim**.
  6. Durable completion update: On success, updates claimed row to `status: 'processed'`, `processedAt: new Date()`. On handler failure, updates claimed row to `status: 'failed'`, `failureCode: msg.slice(0, 255)`, and rethrows without deleting the record.

### 2. Database UNIQUE / P2002 Concurrency Boundary
- The unique database constraint on `githubDeliveryId` (`@unique @map("github_delivery_id")`) serves as the authoritative concurrency boundary.
- When concurrent requests arrive with the same `deliveryId`, the database permits exactly one row insertion. Losers receive Prisma error code `P2002` (or unique constraint violation error), which is caught by `isUniqueConstraintError` to immediately return `{ received: true, duplicate: true, handled: true, deliveryId }` without executing side effects or mutating state.

### 3. Concurrent Duplicate Test Execution
- Verified in `apps/api/test/github-webhook.spec.ts` via `Promise.all([processWebhook(...), processWebhook(...)])` with identical delivery IDs and valid signatures.
- Confirms:
  - Persistent claim attempted concurrently.
  - Exactly 1 winner executes side effects (`mockInstallationService.evictInstallationToken` called exactly once).
  - Exactly 1 response is marked duplicate (`duplicate: true`).
  - Exactly 1 durable row exists in the delivery table (`status: 'processed'`).

### 4. GitHub App Authentication Boundary (@octokit/auth-app & @octokit/rest)
- Handled in `apps/api/src/github/services/github-client.service.ts` and `apps/api/src/github/config/github-config.service.ts`.
- Uses official `@octokit/auth-app@8.3.1` (`createAppAuth`) for GitHub App identity and installation authentication, and `@octokit/rest@22.0.1` (`Octokit`) for API communication and pagination.
- **Handwritten JWT Signing Removed**: Custom JWT construction (`crypto.createSign`, `RSA-SHA256`, manual header/payload assembly) has been completely eliminated from production code.
- **Lazy/No-Credential Startup**: Authentication strategies are lazily initialized on demand (`getAppAuth`, `getAppOctokit`). When credentials (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`) are absent in local development, application bootstrap succeeds without error.
- **App Auth vs. Installation Auth Separation**:
  - `getInstallation`: Authenticated as GitHub App via `getAppOctokit().rest.apps.getInstallation(...)`.
  - `createInstallationToken`: Minted via `auth({ type: 'installation', installationId })`.
  - `listInstallationRepositories`: Scoped to installation token via `getInstallationOctokit(token)` with `octokit.paginate(...)`.

### 5. Token Cache Expiry Safety Margin & Invalidation Lifecycle
- In `apps/api/src/github/services/github-installation.service.ts` (`getInstallationToken`), installation access tokens minted from GitHub are cached in Redis under `impactra:github:inst-token:${githubInstallationId}`.
- Cache TTL is computed with an explicit 90-second safety margin below provider expiration: `ttlSeconds = Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000) - 90)`. Guarded against `NaN` and negative TTLs so malformed expirations cannot create unsafe cache entries.
- Disconnect (`disconnectInstallation`), suspend (`handleInstallationEvent`), and delete (`handleInstallationEvent`) trigger immediate token cache eviction via `evictInstallationToken`.

### 6. Private Key Handling & Isolation
- Private key is ingested via `GITHUB_APP_PRIVATE_KEY_BASE64` or `GITHUB_APP_PRIVATE_KEY`.
- Never logged, never returned in API responses, and never stored in PostgreSQL or Redis.
- Public config status endpoint (`/github/config/status`) exposes only boolean configuration flags (`privateKeyConfigured: boolean`).

---

## 11. Phase Signoff

All requirements for Phase 04 are completely implemented, verified, hardened, and strictly isolated to the connection and metadata onboarding scope.
