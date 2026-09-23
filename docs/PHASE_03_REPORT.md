# Phase 03 Report — Authentication, Organizations, Multi-Tenancy, Session Security & RBAC

**Project Name:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Document Version:** 1.0.0
**Phase:** Phase 03 — Authentication, Organizations, Multi-Tenancy, Session Security & RBAC
**Git Branch:** `phase-03-auth-multitenancy-rbac`
**Status:** Implemented & Verified
**Date:** 2026-09-22

---

## 1. Executive Summary & Phase Objective

Phase 03 establishes the complete, production-grade identity, session security, multi-tenancy, and Role-Based Access Control (RBAC) foundation for Impactra.

Impactra analyzes software changes before deployment (AST diffing, architecture impact, API contract drift, database safety, blast radius). Because all future code evidence, Digital Twin system graphs, pull requests, and release gate policies belong to tenants, strict tenant isolation and server-side authorization must be enforced from day one.

In this phase, we established:
1. **Server-Managed Opaque Sessions**: High-entropy cryptographically secure random session tokens delivered exclusively via `HttpOnly`, `SameSite=Lax`, `Path=/` cookies (`impactra_session`), with SHA-256 token hashes stored durably in PostgreSQL (`Session` table) and cached in Redis.
2. **Password Security**: Direct Argon2id hashing engine (`argon2` runtime dependency with explicit parameters: memoryCost: 64MB, timeCost: 3, parallelism: 4), secure failure semantics (no silent algorithm fallback for new passwords), read-only legacy scrypt verification for backward compatibility, NIST-aligned password complexity enforcement, and constant-time decoy lookups to prevent user enumeration.
3. **Multi-Tenancy & Tenant Boundaries**: `Organization` tenant entity, transactional organization provisioning creating initial `OWNER` memberships atomically, and `TenantGuard` resolving trusted tenant context from headers (`x-organization-id`) or path parameters (`:organizationId`).
4. **Role-Based Access Control (RBAC)**: Comprehensive 9-role hierarchy (`OWNER`, `ADMIN`, `ARCHITECT`, `SECURITY_ENGINEER`, `DEVELOPER`, `RELEASE_MANAGER`, `QA_ENGINEER`, `AUDITOR`, `VIEWER`), centralized capability-based permissions policy, and strict owner safeguards (preventing ownerless organizations, demoting/removing the last owner, self-promotion, and cross-tenant mutations).
5. **Defense-in-Depth Security**: CSRF Origin validation on state-changing requests, Redis-backed brute-force rate limiting on auth endpoints with Docker healthcheck exemptions, credential/token redaction in server logs, and safe error masking.
6. **Frontend Integration**: Complete interactive interfaces in Next.js 16 (`/login`, `/register`, `/onboarding`, `/workspace/settings`), dynamic organization switcher, and session revocation controls.

---

## 2. Architecture & Monorepo Topology

```
Impactra/
├── apps/
│   ├── web/                                 # Next.js 16.3.5 App Router UI
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── login/page.tsx           # Enterprise login interface
│   │   │   │   ├── register/page.tsx        # Registration with live password validation
│   │   │   │   ├── onboarding/page.tsx      # Initial organization setup
│   │   │   │   ├── workspace/settings/page.tsx # Org profile, RBAC members & sessions UI
│   │   │   │   └── layout.tsx               # Root layout wrapped with AuthProvider
│   │   │   ├── components/layout/TopNav.tsx # Organization switcher, role badge, sign out
│   │   │   └── lib/
│   │   │       ├── api-client.ts            # Typed credentials-enabled HTTP client
│   │   │       └── auth-context.tsx         # Reactive AuthContext & useAuth hook
│   │   └── ...
│   │
│   └── api/                                 # NestJS 11 Backend API
│       ├── src/
│       │   ├── auth/                        # Authentication & credential management
│       │   │   ├── auth.controller.ts       # Register, login, logout, me, change-password, reset
│       │   │   ├── auth.service.ts          # Authentication logic & session issuance
│       │   │   ├── auth.module.ts
│       │   │   ├── dto/                     # RegisterDto, LoginDto, ChangePasswordDto, ResetDto
│       │   │   ├── guards/auth.guard.ts     # HttpOnly cookie session validation guard
│       │   │   ├── decorators/              # @CurrentUser, @CurrentSession, @Public
│       │   │   └── services/
│       │   │       ├── password.service.ts  # Argon2id / scrypt hashing & policy validation
│       │   │       └── token.service.ts     # Crypto random generation & SHA-256 hashing
│       │   ├── sessions/                    # Durable session lifecycle & revocation
│       │   │   ├── sessions.service.ts      # Fast Redis cache + PostgreSQL authority
│       │   │   └── sessions.module.ts
│       │   ├── organizations/               # Multi-tenant boundary
│       │   │   ├── organizations.controller.ts # Org CRUD & profile updates
│       │   │   ├── organizations.service.ts    # Transactional org creation with OWNER
│       │   │   ├── organizations.module.ts
│       │   │   ├── guards/tenant.guard.ts   # Authoritative organization membership verification
│       │   │   └── decorators/              # @CurrentOrganization, @CurrentMembership
│       │   ├── memberships/                 # RBAC governance & team management
│       │   │   ├── memberships.controller.ts # Member listing, role update, remove, invite
│       │   │   ├── memberships.service.ts    # Owner safeguards & privilege checking
│       │   │   └── memberships.module.ts
│       │   ├── authorization/               # Centralized capability policy
│       │   │   ├── permissions.enum.ts      # Granular capability definitions
│       │   │   ├── permissions.policy.ts    # Role-to-permission mapping table
│       │   │   ├── guards/permissions.guard.ts # Route-level capability enforcement
│       │   │   └── decorators/require-permissions.decorator.ts
│       │   ├── common/guards/
│       │   │   ├── csrf-origin.guard.ts     # Origin verification for cookie mutations
│       │   │   └── rate-limiter.guard.ts    # Redis throttling with in-memory fallback
│       │   ├── app.module.ts                # Monolith root wiring all Phase 03 modules
│       │   └── main.ts                      # Cookie middleware, CORS credentials, Swagger
│       └── test/                            # Unit & E2E integration test suites
│           ├── password.service.spec.ts     # Argon2id / scrypt unit tests
│           ├── token.service.spec.ts        # Token entropy & SHA-256 tests
│           ├── permissions.policy.spec.ts   # RBAC permission matrix unit tests
│           ├── tenant.guard.spec.ts         # Tenant context & boundary tests
│           ├── owner-safeguards.spec.ts     # Owner protection & privilege escalation tests
│           └── auth.e2e-spec.ts             # Complete E2E integration suite
│
└── packages/
    ├── shared/                              # Shared types & API contracts
    │   ├── src/api.ts                       # UserDto, OrgDto, MembershipDto, SessionDto, AuthResponse
    │   └── src/index.ts
    └── database/                            # Prisma ORM & PostgreSQL migrations
        ├── prisma/
        │   ├── schema.prisma                # User, Organization, Membership, Session, Tokens
        │   └── migrations/
        │       ├── 20260922092317_init_system_metadata/
        │       └── 20260922160000_add_auth_organizations_rbac/ # Phase 03 migration
        └── ...
```

---

## 2.1 Dependencies Added & Verified

1. **`argon2` (`^0.41.1`)** in `apps/api` (`dependencies`):
   - Direct runtime dependency for Argon2id memory-hard password hashing.
   - Enabled in `pnpm-workspace.yaml` under `allowBuilds` (`'argon2': true`, `'argon2@0.41.1': true`).
2. **`cookie-parser` (`^1.4.7`)** in `apps/api` (`dependencies`):
   - Direct runtime middleware for parsing `HttpOnly` session cookies in NestJS.
3. **`@types/cookie-parser` (`^1.4.8`)** in `apps/api` (`devDependencies`):
   - TypeScript definitions for `cookie-parser`.
4. **`lucide-react` (`^0.475.0`)** in `apps/web` (`dependencies`):
   - UI icons for tenant switcher, password toggle, and tabbed workspace settings.

---

## 3. Authentication & Session Security Strategy

### Server-Managed Opaque Sessions
Instead of storing long-lived bearer tokens or JWTs in client-side storage (`localStorage` / `sessionStorage`), Impactra implements server-managed opaque sessions:
- **Token Generation**: 32 cryptographically secure random bytes generated via `crypto.randomBytes(32).toString('base64url')` (256 bits of entropy).
- **Hashed Persistence**: Only the SHA-256 hash (`sessionTokenHash`) is stored in the PostgreSQL database. If database records are ever compromised, session tokens cannot be derived from stored hashes.
- **Cookie Security**:
  ```http
  Set-Cookie: impactra_session=<token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
  ```
  - `HttpOnly`: Inaccessible to client JavaScript, mitigating Cross-Site Scripting (XSS) session theft.
  - `SameSite=Lax`: Mitigates Cross-Site Request Forgery (CSRF) on state-changing requests while permitting top-level navigation.
  - `Secure`: Dynamically set to `true` in production (`https://`).
  - `Path=/`: Valid across all product API and frontend routes.
- **Fast Session Cache**: Active session metadata is cached in Redis (`impactra:session:<hash>`) with a 5-minute TTL to accelerate frequent requests while maintaining PostgreSQL as the durable identity store.
- **Session Revocation**:
  - `POST /auth/logout`: Immediately revokes the current session and clears the cookie.
  - `POST /auth/logout-all`: Revokes all active sessions for the user across all devices.
  - `POST /auth/change-password`: Automatically revokes all other active sessions while preserving the current session.

---

## 4. Password Security

- **Direct Argon2id Hashing**: Directly imports and utilizes the `argon2` native runtime package with explicit OWASP-recommended parameters (`type: argon2.argon2id`, `memoryCost: 65536` [64MB], `timeCost: 3` iterations, `parallelism: 4` threads). Fails securely by throwing an internal error if hashing fails, preventing any silent algorithm downgrades or insecure fallbacks for new passwords.
- **Legacy Scrypt Verification**: Read-only verification support for existing `$scrypt$` hashes is retained strictly for backward compatibility, preventing any interruption to existing accounts while guaranteeing that all newly minted credentials use Argon2id exclusively.
- **NIST Password Policy**: Enforces a minimum length of 8 characters, maximum 128 characters, with at least one uppercase letter, one lowercase letter, and one number or special character.
- **Enumeration Prevention**:
  - `POST /auth/login` returns a generic error (`"Invalid email or password."`) on both missing accounts and incorrect passwords.
  - Constant-time decoy password verification is executed when an email is not found to prevent timing-based user enumeration.
  - `POST /auth/password-reset/request` always returns a generic response (`"If an account exists with this email address, password reset instructions have been generated."`).

---

## 5. Multi-Tenancy & Tenant Boundaries

### Transactional Organization Provisioning
When a user creates an organization via `POST /organizations`, the operation runs in an atomic Prisma transaction:
1. Creates the `Organization` record with a unique URL-safe slug.
2. Creates the initial `OrganizationMembership` linking the organization to the caller with `role = OWNER`.
Both records succeed together or both roll back, ensuring an organization can never exist without an assigned owner.

### Authoritative Tenant Context Resolution (`TenantGuard`)
- Client requests specify the active organization context via:
  - Route parameter `:organizationId` (e.g. `/organizations/:organizationId/members`), or
  - Header `x-organization-id` (e.g. `x-organization-id: <uuid>`).
- `TenantGuard` **never trusts unverified client claims**. It queries `OrganizationMembership` for the authenticated `request.user.id` and the requested `organizationId`.
- If the user is not a member, access is rejected with `403 Forbidden`.
- When verified, `request.organization` and `request.membership` are attached to the execution context.

---

## 6. Role-Based Access Control (RBAC) & Owner Safeguards

### Role Hierarchy & Capability Matrix
Impactra establishes 9 enterprise roles:

| Role | Organization Read | Organization Update | Member Read | Member Invite | Role Update | Member Remove |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **OWNER** | Yes | Yes | Yes | Yes | Yes | Yes |
| **ADMIN** | Yes | Yes | Yes | Yes | Yes (Restricted) | Yes (Restricted) |
| **ARCHITECT** | Yes | No | Yes | No | No | No |
| **SECURITY_ENGINEER** | Yes | No | Yes | No | No | No |
| **DEVELOPER** | Yes | No | Yes | No | No | No |
| **RELEASE_MANAGER** | Yes | No | Yes | No | No | No |
| **QA_ENGINEER** | Yes | No | Yes | No | No | No |
| **AUDITOR** | Yes | No | Yes | No | No | No |
| **VIEWER** | Yes | No | Yes | No | No | No |

### Strict Owner Safeguards
1. **No Ownerless Organizations**: An organization cannot exist without an OWNER.
2. **Last Owner Demotion Protection**: An OWNER cannot be demoted if they are the last remaining OWNER of the organization (`400 Bad Request`).
3. **Last Owner Removal Protection**: An OWNER cannot be removed if they are the last remaining OWNER (`400 Bad Request`).
4. **Self-Promotion Prevention**: A member cannot elevate their own role to OWNER (`403 Forbidden`).
5. **ADMIN Privilege Ceiling**: An ADMIN cannot alter the role of an OWNER, cannot remove an OWNER, and cannot promote another member to OWNER (`403 Forbidden`). Only an existing OWNER can grant the OWNER role.
6. **Cross-Tenant Isolation**: Membership mutations verify that the target `membershipId` belongs to the validated `organizationId` (`404 Not Found`).

---

## 7. Security Controls & Threat Model Mitigations

| Threat | Security Mitigation Implemented |
| :--- | :--- |
| **Account Takeover** | Argon2id hashing, brute-force rate limiting, password complexity validation, session revocation on password change. |
| **Session Theft / XSS** | Cryptographically random tokens (256-bit entropy), stored only as SHA-256 hashes, transmitted solely via `HttpOnly` cookies. |
| **Session Fixation** | A completely fresh session is minted and stored upon every successful login or registration. |
| **CSRF** | `SameSite=Lax` cookies combined with `CsrfOriginGuard` validating `Origin` / `Referer` on all state-changing requests. |
| **Cross-Tenant Data Leakage** | `TenantGuard` authoritative database membership verification on all tenant-scoped routes. |
| **Privilege Escalation** | Centralized `PermissionsGuard` and immutable database role resolution; client headers cannot claim roles. |
| **User Enumeration** | Constant-time decoy password verification and generic login/reset messages. |
| **Sensitive Data in Logs** | `LoggingMiddleware` and `AllExceptionsFilter` sanitize connection strings, passwords, and tokens before logging. |

---

## 8. Implemented API Endpoints

### Authentication & Sessions (`/auth`)
- `POST /auth/register`: Register user, hash password, establish session cookie (`201 Created`).
- `POST /auth/login`: Authenticate credentials, issue session cookie (`200 OK`).
- `POST /auth/logout`: Revoke session, clear cookie (`200 OK`).
- `POST /auth/logout-all`: Invalidate all active sessions for caller (`200 OK`).
- `GET /auth/me`: Retrieve current user, active session, and accessible organizations (`200 OK`).
- `POST /auth/change-password`: Change password, invalidate other sessions (`200 OK`).
- `POST /auth/password-reset/request`: Generate single-use hashed reset token (`200 OK`).
- `POST /auth/password-reset/confirm`: Reset password using valid unexpired token (`200 OK`).
- `GET /auth/sessions`: List active device sessions for current user (`200 OK`).
- `DELETE /auth/sessions/:sessionId`: Revoke specific session (`200 OK`).

### Organizations (`/organizations`)
- `POST /organizations`: Transactionally create organization with initial `OWNER` membership (`201 Created`).
- `GET /organizations`: List organizations caller belongs to (`200 OK`).
- `GET /organizations/:organizationId`: Get organization metadata (requires `organization.read`).
- `PATCH /organizations/:organizationId`: Update organization profile (requires `organization.update`).

### Memberships & RBAC (`/organizations/:organizationId/members`)
- `GET /organizations/:organizationId/members`: List members and roles (requires `membership.read`).
- `POST /organizations/:organizationId/members`: Add or invite member (requires `membership.invite`).
- `PATCH /organizations/:organizationId/members/:membershipId`: Update member role (requires `membership.role.update`, enforces owner safeguards).
- `DELETE /organizations/:organizationId/members/:membershipId`: Remove member from organization (requires `membership.remove`, enforces owner safeguards).

---

## 9. Frontend User Interfaces

1. **Login (`/login`)**:
   - Clean enterprise credentials form with corporate email and password input.
   - Accessible password visibility toggle.
   - Generic error alerts preventing user enumeration.
   - Intelligent redirection: users without organizations are directed to `/onboarding`, while established users enter the workspace (`/`).
2. **Registration (`/register`)**:
   - Full name, corporate email, password, and confirmation inputs.
   - Interactive live checklist validating 8+ characters, uppercase, lowercase, number/symbol, and password matching.
   - Onboarding redirection.
3. **Onboarding (`/onboarding`)**:
   - Guides newly registered engineers through creating their initial organization.
   - Displays organization display name and customizable URL slug preview.
   - Highlights the multi-tenant isolation guarantee.
4. **Organization Switcher & Account Menu (`TopNav`)**:
   - Dynamic organization switcher displaying current active organization, slug, and assigned role badge.
   - Dropdown list with checkmarks for switching between multiple organizations.
   - User profile dropdown showing authenticated user details, link to settings, and one-click sign out.
5. **Workspace Settings (`/workspace/settings`)**:
   - **Organization Profile Tab**: Displays immutable tenant ID, organization display name, and slug update form for authorized roles.
   - **Members & Access Control Tab**: Full member roster with avatars, roles, join dates, role change dropdowns, member removal, and team invitation dialog with copyable development links.
   - **Account Security & Sessions Tab**: Password change form, active device session table with current session indicators, and one-click "Revoke All Other Sessions" capability.

---

## 10. Database Schema Models & Migration

Migration created: `20260922160000_add_auth_organizations_rbac/migration.sql`

- `users`: Core identity table with unique email, name, password hash, and verification timestamps.
- `organizations`: Tenant boundary with unique slug and name.
- `organization_memberships`: Unique composite `(organization_id, user_id)` with `MembershipRole` enum and cascade deletes.
- `sessions`: Session records with unique `session_token_hash`, user association, expiry, revocation, and device metadata.
- `password_reset_tokens`: Single-use tokens with unique `token_hash`, user foreign key, and expiration.
- `email_verification_tokens`: Verification tokens with unique `token_hash`.
- `organization_invitations`: Team invitations with unique `token_hash`, organization ID, inviter ID, and expiration.

---

## 11. Test Coverage & Verification

### Verified Test Summary
- **Unit Test Suites**: 8 passed, 8 total
- **Unit Tests**: 43 passed, 43 total
- **E2E Test Suites**: 2 passed, 2 total
- **E2E Tests**: 19 passed, 19 total
- **Total Test Suites**: 10 passed, 10 total
- **Total Tests**: 62 passed, 62 total

### Unit Test Suites (`apps/api/test/`)
1. `env.schema.spec.ts` (10 tests): Validates required environment variables, port/SSL coercion, fast-fail error reporting, and `COOKIE_SECURE` resolution logic (development/test default `false`, production default `true`, and explicit boolean/string overrides).
2. `health.service.spec.ts` (3 tests): Tests service liveness probe and readiness probe across PostgreSQL, Redis, and MinIO storage dependencies with unhealthy failure modes.
3. `http-exception.filter.spec.ts` (3 tests): Tests `AllExceptionsFilter` structured `ApiErrorResponse` formatting, internal error sanitization, stack trace masking, and credential/token redaction via `sanitizeLogContent`.
4. `password.service.spec.ts` (9 tests): Tests password complexity policy (minimum 8 chars, uppercase, lowercase, numbers/symbols), direct Argon2id hashing (asserting `$argon2id$` prefix and strict absence of scrypt for new passwords), constant-time verification, malformed hash rejection, and legacy scrypt backward compatibility.
5. `token.service.spec.ts` (4 tests): Tests 256-bit crypto randomness, URL-safe base64 encoding, deterministic SHA-256 hashing, and opaque hex token generation.
6. `permissions.policy.spec.ts` (4 tests): Tests centralized capability matrix across all 9 roles, verifying administrative permissions for `OWNER`/`ADMIN`, read-only access for `DEVELOPER`/`VIEWER`, and `hasAllPermissions` multi-capability checks.
7. `tenant.guard.spec.ts` (4 tests): Tests unauthenticated rejection (`401 Unauthorized`), missing tenant context (`400 Bad Request`), cross-tenant access denial (`403 Forbidden`), and trusted tenant/membership context attachment.
8. `owner-safeguards.spec.ts` (6 tests): Tests prevention of demoting last owner (`400 Bad Request`), self-promotion to owner (`403 Forbidden`), admin tampering with owners (`403 Forbidden`), cross-tenant membership updates (`404 Not Found`), and removing the last owner (`400 Bad Request`).

### E2E Integration Suites (`apps/api/test/`)
1. `health.e2e-spec.ts` (3 tests): Validates `/health` liveness probe, `/ready` dependency probe, and error masking.
2. `auth.e2e-spec.ts` (16 tests/scenarios):
   1. User registration sets `HttpOnly` session cookie (`201 Created`).
   2. Duplicate email registration rejected with `409 Conflict`.
   3. Login fails with invalid password using generic message (`401 Unauthorized`).
   4. `GET /auth/me` returns identity when cookie is provided (`200 OK`).
   5. `GET /auth/me` rejects unauthenticated callers (`401 Unauthorized`).
   6. CSRF verification: Authenticated mutation with untrusted origin (`http://evil.example`) is rejected (`403 Forbidden`).
   7. CSRF verification: Authenticated mutation with missing Origin/Referer is rejected (`403 Forbidden`).
   8. Organization creation with allowed Origin transactionally assigns `OWNER` role (`201 Created`).
   9. User B registration and verification of cross-tenant access rejection (`403 Forbidden`).
   10. User A invites User B to Organization A as `DEVELOPER` with allowed Origin (`201 Created`).
   11. User B (`DEVELOPER`) cannot update organization profile (`403 Forbidden`).
   12. User B cannot elevate themselves to `OWNER` (`403 Forbidden`).
   13. Owner safeguards: User A cannot demote the last remaining `OWNER` (`400 Bad Request`).
   14. Session management: Targeted revocation of second independent session, verifying second session is revoked (`401 Unauthorized`) while original session remains valid (`200 OK`).
   15. Password change updates credentials and invalidates other sessions (`200 OK`).
   16. Logout revokes session and clears cookie (`200 OK`). Subsequent authenticated requests rejected (`401 Unauthorized`).

### Cookie Security & Same-Site Local API Host Architecture
1. **Configurable Cookie Security (`COOKIE_SECURE`)**:
   - `apps/api/src/config/env.schema.ts` parses `COOKIE_SECURE` with default fallback to `(NODE_ENV === 'production')`.
   - In local Docker unencrypted HTTP runtime (`http://impactra.local` / `http://localhost:3000`), `COOKIE_SECURE: "false"` is explicitly configured in `compose.yaml` so browsers store and transmit cookies over plain HTTP without rejecting them.
   - In production HTTPS deployments, `COOKIE_SECURE=true` is strictly enforced.
2. **Dynamic Same-Site Local API Host (`getApiBaseUrl`)**:
   - `apps/web/src/lib/api-client.ts` resolves API endpoints dynamically via `window.location.protocol + '//' + window.location.hostname + ':3001'`.
   - When accessed via `http://impactra.local`, client requests target `http://impactra.local:3001`, preserving first-party same-site cookie affinity under `SameSite=Lax`.
   - When accessed via `http://localhost:3000`, client requests target `http://localhost:3001`.
   - Explicit `NEXT_PUBLIC_API_URL` overrides are honored for remote staging/production endpoints.
   - SSR requests safely fall back to internal Docker service networking (`http://impactra-api:3001`).

### Runtime Authentication Lifecycle Verification (Docker Runtime)
- **Target Host**: `http://impactra.local:3001` (Origin: `http://impactra.local`)
- **Container Environment**: `NODE_ENV=production`, `COOKIE_SECURE=false`
- **Registration**: `POST /auth/register` -> `201 Created`
  - Returned `Set-Cookie` attributes: `impactra_session=<REDACTED>; Path=/; HttpOnly; SameSite=Lax` (`Secure` flag correctly absent for local HTTP).
- **Authenticated Identity**: `GET /auth/me` with cookie -> `200 OK`
- **Organization Provisioning**: `POST /organizations` with `Origin: http://impactra.local` -> `201 Created`, caller granted `OWNER` role.
- **Organization Listing**: `GET /organizations` with cookie -> `200 OK`, created tenant present.
- **CSRF Negative Validation**: State-changing request with `Origin: http://evil.example` -> `403 Forbidden` (`Cross-Site Request Forgery (CSRF) origin verification failed.`).
- **Session Revocation (Logout)**: `POST /auth/logout` -> `200 OK`, session cleared.
- **Revoked Cookie Probe**: `GET /auth/me` using revoked cookie -> `401 Unauthorized` (`Invalid or expired session. Please log in again.`).
- **Database & Storage Status**: All 9 PostgreSQL tables present and verified, Redis responds `PONG`, MinIO health check reports live.
- **Cleanup**: Temporary runtime test accounts and tenant records purged in FK-safe order (final temporary record count = 0).

---

## 12. Known Limitations & Deferred Capabilities

1. **External Email Delivery**: Real transactional SMTP/SES dispatching for password resets and invitations is deferred. Secure cryptographic token generation, hashing, and single-use validation are fully implemented and exposed via developer links in non-production environments.
2. **PostgreSQL Row-Level Security (RLS)**: Phase 03 enforces tenant isolation authoritatively at the application and guard layer (`TenantGuard`). Native PostgreSQL RLS policies parameterized by session context (`app.current_tenant_id`) will be introduced alongside tenant-scoped repository and analysis models in Phase 04+.
3. **Hardware MFA / WebAuthn**: Multi-Factor Authentication via TOTP or FIDO2/WebAuthn is deferred to a dedicated security hardening phase.
4. **Audit Logging Service**: Action-level audit trail tables for compliance governance will be established alongside the Software Digital Twin change ledger.

---

## 13. Phase 04 Handoff

With the identity, session, multi-tenancy, and RBAC foundation verified:
- Every future repository connection, webhook ingestion, AST analysis, and release gate will be strictly partitioned by `organizationId`.
- The `TenantGuard` and `@CurrentOrganization()` decorators are ready for immediate use across future controller endpoints.
