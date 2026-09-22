# @impactra/database

Persistence and ORM foundation layer for Impactra platform, built on Prisma ORM and PostgreSQL.

## Architecture & Multi-Tenancy Strategy

### Foundational Schema
This package provides the Prisma schema and client generation for PostgreSQL.
In Phase 02, the schema contains only the foundational `SystemMetadata` model to verify migrations, database connectivity, and readiness probes without fabricating premature business domain models.

### Future Multi-Tenancy Constraint
Impactra is architected as an enterprise multi-tenant platform. All future domain tables (organizations, repositories, pull requests, digital twin graphs, release evaluations) will adhere to:
1. **Explicit Tenant Keys**: Every tenant-scoped entity will contain a `tenantId` (or `organizationId`) foreign key referencing the tenant entity.
2. **PostgreSQL Row-Level Security (RLS)**: PostgreSQL tables will enforce RLS policies parameterized by the session tenant variable (e.g., `current_setting('app.current_tenant_id')`).
3. **Database Client Tenant Isolation**: Prisma extensions or transaction-level session parameters will ensure every query executed in the context of a tenant request automatically sets the tenant context.
4. **No Full Rewrite Required**: The foundational database structure, migrations directory, and connection pooling established here will cleanly receive tenant-scoped models and RLS migrations in Phase 03+.

## Scripts
- `pnpm db:generate`: Generates Prisma client types from `schema.prisma`.
- `pnpm db:migrate:dev`: Runs development migrations against the local PostgreSQL instance.
- `pnpm db:migrate:deploy`: Applies pending migrations in production / container environments.
