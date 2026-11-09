# Contributing to Impactra

Thank you for your interest in contributing to Impactra! We are building an enterprise-grade AI-powered software change intelligence and release safety platform. To maintain our high standards of architectural integrity, determinism, and security, all contributors must follow these guidelines.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and professional environment for all contributors. Please treat others with respect and constructive feedback.

---

## Development Environment Setup

### Prerequisites
- **Node.js:** `^24.21.0` (or active 24.x LTS)
- **pnpm:** `12.3.4` (managed via Corepack: `corepack enable && corepack prepare pnpm@12.3.4 --activate`)
- **Docker & Docker Compose:** Docker Desktop or Docker Engine on Linux

### Initial Setup
```bash
# 1. Clone repository and install dependencies
git clone https://github.com/zeeshansajid8505-sys/impactra.git
cd impactra
pnpm install

# 2. Configure local environment
cp .env.example .env

# 3. Build shared contracts and database client
pnpm --filter @impactra/shared build
pnpm --filter @impactra/database build

# 4. Start local backing services (PostgreSQL, Redis, MinIO)
docker compose up -d impactra-postgres impactra-redis impactra-minio

# 5. Apply database migrations
pnpm --filter @impactra/database exec prisma migrate deploy

# 6. Start development servers
pnpm dev
```

---

## Branch & Commit Conventions

### Branch Naming
- Features: `feat/<feature-name>`
- Bugfixes: `fix/<issue-name>`
- Documentation: `docs/<topic>`
- Performance: `perf/<optimization>`
- Refactoring: `refactor/<scope>`

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```text
<type>(<scope>): <short description>

[optional body]

[optional footer]
```
Examples:
- `feat(release-policy): add protected path glob evaluation rule`
- `fix(github-checks): handle rate limit retry backoff on check run updates`
- `docs(readme): add architecture sequence diagram`

---

## Database Migration Rules

1. **Historical Migrations are Immutable:** Existing migrations in `packages/database/prisma/migrations/` must NEVER be edited or deleted.
2. **Schema Changes:** Modify `packages/database/prisma/schema.prisma` and generate a new migration using:
   ```bash
   pnpm --filter @impactra/database exec prisma migrate dev --name <migration_name>
   ```
3. **Zero Downtime Migrations:** All schema alterations must be backward-compatible (e.g. nullable new columns, additive tables). Never drop active columns in a single release.
4. **Migration Testing:** Test both forward application (`prisma migrate deploy`) and clean database initialization before submitting PRs.

---

## Quality Gates & Testing Requirements

Before opening a pull request, all automated quality gates must pass locally:

```bash
# 1. Typecheck all packages
pnpm turbo run typecheck

# 2. Lint all packages
pnpm turbo run lint

# 3. API Unit Tests
pnpm --filter @impactra/api test

# 4. API End-to-End Tests (natural exit, zero open handles)
pnpm --filter @impactra/api exec jest --config test/jest-e2e.json --runInBand --detectOpenHandles

# 5. Production Web Build
pnpm --filter @impactra/web build

# 6. Dependency Vulnerability Audit
pnpm audit --prod

# 7. Whitespace & Formatting Hygiene
git --no-pager diff --check
```

### Testing Rules
- **No `--forceExit`:** Jest must terminate naturally. If open handles occur, track down unclosed database connections, timers, or event listeners.
- **No Forbidden Markers:** Never commit `.only()` or `.skip()` test markers.
- **Deterministic Assertions:** Tests must not rely on wall-clock time, randomized order, or external internet connectivity.

---

## Security & Repository Hygiene Expectations

- **Zero Committed Secrets:** Never commit `.env` files, API keys, private keys (`.pem`), database connection strings with real credentials, or production tokens.
- **Log Sanitization:** Ensure any new log outputs sanitize user credentials, authorization headers, and internal IPs using `sanitizeLogContent`.
- **RBAC Enforcement:** All new API endpoints must be guarded with appropriate permission decorators (`@RequirePermissions(...)`) and validate tenant organization boundaries.

---

## Pull Request Process

1. Ensure all quality gates pass locally.
2. Push your feature branch and open a Pull Request against `main`.
3. Fill out the PR description with:
   - Summary of changes
   - Motivation and context
   - Test coverage evidence
   - Verification commands executed
4. Maintain a clean commit history without merge conflicts.
5. Await review and approval from platform maintainers.
