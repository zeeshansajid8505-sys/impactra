# Impactra

### AI-Powered Software Change Intelligence & Release Safety Platform

Impactra analyzes software changes before deployment and helps engineering teams understand what can break, what parts of the system may be affected, what security risks may be introduced, and how safe the change is to release.

---

## Project Status

| Dimension | Status | Notes |
| :--- | :--- | :--- |
| **Project Status** | **Phase 01B-P Completed** | Visual identity redesign & detached Docker runtime established |
| **Frontend Shell** | **Live (`apps/web`)** | Next.js 16.3.5, React 19, Tailwind CSS v4, App Router |
| **Product Identity** | **Configured** | Browser Tab: `Impactra — Software Change Intelligence`, custom SVG favicon |
| **Design System** | **Light-First Editorial UI** | Warm off-white canvas, graphite typography, restrained indigo accent, toggleable dark mode |
| **Local Domain** | **`http://impactra.local`** | Persistent container runtime on HTTP port 80 (with port 3000 fallback) |
| **Production Code** | **Foundation Shell Only** | Zero product feature code started |
| **Core Product Features** | **Not Started** | Ingestion, Digital Twin engine, and analyzers deferred to Phase 02+ |

---

## Two Execution Modes

### 1. PERSISTENT PRODUCT-LIKE LOCAL MODE (Preferred)

Runs the production-optimized Next.js standalone container in detached mode. **This mode continues running even after VS Code and your terminal session are closed.**

- **Preferred Address:** **`http://impactra.local`** (Port 80)
- **Direct Port Fallback:** **`http://localhost:3000`**

#### Step A: Configure Windows Hosts File (One-time Manual Step)
Because modifying the Windows hosts file requires Administrator privileges, add this single line manually:

1. Open Notepad as **Administrator** (Start → type "Notepad" → Right-click → "Run as administrator").
2. Open: `C:\Windows\System32\drivers\etc\hosts`
3. Add this line at the bottom:
   ```
   127.0.0.1 impactra.local
   ```
4. Save the file.

#### Step B: Port 80 Availability Check
Before launching, verify whether port 80 is available on your machine:

```powershell
Get-NetTCPConnection -LocalPort 80 -ErrorAction SilentlyContinue
```
*(Or in cmd: `netstat -ano | findstr :80`)*

- If the command produces **no output**, port 80 is free.
- If an existing Windows service (such as IIS / `w3svc` or Skype) is listening on port 80, do **not** kill it. You can access the container directly via the fallback URL `http://localhost:3000`.

#### Step C: Start Detached Container
```bash
# Build and start container in the background
docker compose up -d --build

# Verify container is running
docker compose ps

# View container logs (optional)
docker compose logs -f

# Stop the container when desired
docker compose down
```

Open your browser at:
👉 **`http://impactra.local`** *(or `http://localhost:3000`)*

---

### 2. DIRECT DEVELOPMENT MODE (Local HMR)

For active frontend development with Next.js hot-module reloading:

```bash
# 1. Install dependencies
pnpm install

# 2. Start development server
pnpm dev
```

Open your browser at:
👉 **`http://localhost:3000`**

---

## Repository Structure

```
Impactra/
├── apps/
│   └── web/                     # Next.js 16 App Router frontend application
│       ├── src/
│       │   ├── app/             # App Router pages, layouts, and icon.svg
│       │   ├── components/      # Layout (TopNav, BrandMark), dashboard, and shared components
│       │   ├── lib/             # Navigation config, constants, and utilities
│       │   └── styles/          # globals.css with Tailwind v4 design tokens
│       ├── public/              # Static assets (icon.svg, favicon.svg)
│       ├── next.config.mjs      # Next.js config (standalone output enabled)
│       └── package.json
│
├── packages/
│   ├── config/                  # Shared base tsconfig and lint rules
│   │   ├── tsconfig.base.json
│   │   └── package.json
│   ├── shared/                  # Domain types, risk levels, and category definitions
│   │   ├── src/index.ts
│   │   └── package.json
│   └── ui/                      # Reusable UI primitives (Button, Badge, Card, StatusPill)
│       ├── src/index.ts
│       └── package.json
│
├── docs/
│   ├── PROJECT_FOUNDATION.md    # Architecture strategy, boundaries, and technical blueprint
│   ├── UI_DESIGN_SYSTEM.md      # Visual identity, tokens, and component architecture
│   └── PHASE_01B_REPORT.md      # Comprehensive Phase 01B-P delivery and verification report
│
├── Dockerfile                   # Multi-stage production container build (Node 24, pnpm 12)
├── compose.yaml                 # Detached local container configuration (ports 80 & 3000)
├── .dockerignore                # Production container ignore rules
├── package.json                 # Monorepo root with Turborepo scripts
├── pnpm-workspace.yaml          # pnpm 12 workspace & build approvals configuration
├── turbo.json                   # Turborepo task pipeline
├── .gitignore                   # Workspace gitignore
└── README.md                    # This document
```

---

## Quality Gates & Verification Commands

```bash
# Typecheck all packages
pnpm run typecheck

# Lint check (ESLint flat config)
pnpm run lint

# Monorepo production build
pnpm run build

# Production dependency security audit
pnpm audit --prod

# Check git whitespace & formatting
git diff --check

# Validate Docker compose configuration
docker compose config
```

---

## Documentation Index

- [Project Foundation & Architecture Strategy](docs/PROJECT_FOUNDATION.md)
- [UI/UX Design System & Standards](docs/UI_DESIGN_SYSTEM.md)
- [Phase 01B-P Delivery Report & Verification](docs/PHASE_01B_REPORT.md)

---

## License

Proprietary — All rights reserved.
