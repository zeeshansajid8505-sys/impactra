# Changelog

All notable changes to the **Impactra** platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-08

### Added

#### Release Policy Configuration & Enforcement Foundation (Phase 11)
- **Multi-Factor Release Policies:** Configurable, versioned release policies supporting 7 rule types: `MAX_RISK_SCORE`, `MINIMUM_RISK_LEVEL`, `BLAST_RADIUS_THRESHOLD`, `CRITICAL_SIGNAL_PRESENT`, `HIGH_SIGNAL_COUNT`, `PROTECTED_PATH_CHANGED`, and `REQUIRE_APPROVAL`.
- **Precedence Hierarchy Engine:** 5-tier evaluation specificity: Repository Branch &rarr; Repository Default &rarr; Organization Branch &rarr; Organization Default &rarr; Built-in Fallback (`impactra-release-safety-v1`).
- **Non-Mutating Policy Preview:** Test-evaluate any policy against historical change sets without persisting assessment records or mutating release gates.
- **Immutable Policy Snapshot:** Extended `ReleaseSafetyAssessment` with immutable `policySnapshotJson` capturing policy state, version, rules, and outcomes at evaluation time.
- **Policy Management Workspace:** Comprehensive web interface at `/workspace/release-policies` for creating, editing, previewing, activating, and archiving policies.

#### Release Approval & Exception Workflows (Phase 10)
- **Peer Review Governance:** Two-person approval workflow with self-approval protection preventing PR authors from approving their own changes.
- **Break-Glass Policy Exceptions:** Explicit exception grant mechanism for blocked releases with mandatory reasoning, role enforcement (`RELEASE_MANAGER`, `ADMIN`), and audit logging.
- **Effective Authorization Resolution:** Deterministic effective release authorization synthesizing policy decisions, peer approvals, and policy exceptions.
- **Immutable Audit Event Ledger:** Append-only event tracking for all request, approve, reject, and exception actions.
- **Web Approval Workspace:** Release approval tab in change detail with status KPI badge, active request cards, and action modals.

#### GitHub Checks & Automated Release Gate (Phase 09)
- **GitHub Check Run Integration:** Automated check runs named `Impactra / Release Safety` published directly to pull requests via GitHub Checks API.
- **Rich Markdown Summaries:** Check run output formatted with risk scores, severity radars, categorized signal breakdowns, and policy outcomes.
- **Idempotency & Deduplication:** Safe idempotent updates preventing duplicate Check Runs per pull request commit SHA.

#### Deterministic Release Safety Engine (Phase 08)
- **Multi-Signal Risk Scoring:** 0–100 deterministic scoring engine evaluating code, architecture, security, database migration, and test impact signals.
- **Composite Risk Categorization:** Four release safety decisions (`ALLOW`, `REQUIRE_REVIEW`, `BLOCK`, `EXCEPTION_GRANTED`) and risk levels (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Explainability Payload:** Detailed architectural rationale and recommendations associated with each evaluation.

#### Deterministic Blast Radius Analysis (Phase 07)
- **Cycle-Safe Graph Traversal:** Multi-hop traversal engine tracking transitive dependencies up to 50 hops deep.
- **Evidence Path Reconstruction:** Exact dependency paths showing why downstream components are impacted.
- **Affected Node Categorization:** Classification of impacted entities across services, packages, databases, and routes.

#### Pull Request & Change Ingestion Engine (Phase 06)
- **Git Diff & AST Ingestion:** Parse GitHub pull request diffs, changed files, and hunk metadata into immutable ChangeSet revisions.
- **Twin Change Mapping:** Projecting changed code entities directly onto the Software Digital Twin graph.

#### Repository Ingestion & Digital Twin Engine (Phase 05)
- **Source Tree Analysis:** Archive extraction, AST parsing, and manifest scanning for TypeScript, JavaScript, and monorepo configurations.
- **Topological Graph Persistence:** Living Digital Twin graph model stored in PostgreSQL with typed nodes and edges.
- **Archive Security:** Decompression bomb protection, symlink rejection, path traversal prevention, and memory limits.

#### GitHub App Integration (Phase 04)
- **GitHub App Installation Flow:** State-token verification, installation lifecycle management, and repository synchronization.
- **Secure Webhooks:** HMAC-SHA256 signature verification for GitHub webhook event streams.

#### Authentication, Multi-Tenancy & RBAC (Phase 03)
- **Multi-Tenant Isolation:** Complete organization boundary separation across all database queries and domain models.
- **9 Canonical Roles:** Granular RBAC (`OWNER`, `ADMIN`, `ARCHITECT`, `SECURITY_ENGINEER`, `DEVELOPER`, `RELEASE_MANAGER`, `QA_ENGINEER`, `AUDITOR`, `VIEWER`).
- **Secure Sessions:** HttpOnly, SameSite cookies with Argon2 password hashing.

#### Infrastructure & Monorepo Foundation (Phases 01B & 02)
- **Modular Monolith Architecture:** Turborepo monorepo with `@impactra/shared`, `@impactra/database`, `@impactra/config`, `@impactra/ui`, `apps/api`, and `apps/web`.
- **Production-Ready Docker:** Multi-stage Alpine containerization with Nginx reverse proxy, PostgreSQL 17, Redis 7, and MinIO S3-compatible storage.
- **Comprehensive API Documentation:** Interactive Swagger / OpenAPI documentation at `/api/docs`.

### Changed
- Standardized package versions to `1.0.0` across the monorepo.
- Upgraded `.env.example` with 9 comprehensive production configuration sections.
- Hardened storage layer to seamlessly support both local MinIO and production AWS S3/Cloudflare R2 services.
- Enhanced CORS, CSRF, and security headers for production HTTPS deployments.
