# Impactra UI / UX Design System & Standards

**Project Name:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform  
**Document Version:** 2.1.0  
**Phase:** Phase 01B-P — Visual Identity Redesign & Detached Local Runtime  

---

## 1. UI / UX Design Vision & Aesthetic Direction

Impactra is an AI-powered software change intelligence and release safety platform designed to analyze software changes before deployment. Its audience consists of principal architects, staff software engineers, technical leads, and release safety teams.

The interface communicates **spacious clarity, technical credibility, modern elegance, and intellectual authority**.

### Distinct Identity vs. Project 1:
- ❌ **No Dense Dark SOC Aesthetic:** Impactra avoids the dark developer dashboard / security operations center aesthetic (dark charcoal `#09090b`, lime accents `#22c55e`, dense telemetry cards, heavy left admin navigation sidebar).
- ❌ **No Left Admin Sidebar:** Navigation is structured around a refined **top horizontal product bar** with integrated global workspace context, fast links, repository status, and quick-action CTAs.
- ❌ **Light-First Default Palette:** Ships with an editorial light theme as the primary experience, featuring a warm off-white canvas (`#fafaf9`), pure white elevation surfaces (`#ffffff`), graphite typography (`#18181b`), and a restrained indigo brand accent (`#4f46e5`).
- ❌ **No Boxed Grid Cramming:** Content breathes with generous vertical spacing (64px–80px sectional rhythm), open typographic data hierarchies, and contextual pipeline representations.
- ✅ **Toggleable Dark Mode:** An equally refined, deep slate dark mode is available on-demand via the header theme toggle, retaining visual harmony without high-contrast neon fatigue.

### Core Design Influences:
- **Linear:** Fast keyboard ergonomics, typographic restraint, crisp iconography.
- **Vercel & Stripe:** Spacious layouts, monochromatic baseline, subtle borders, high-clarity copy.
- **Modern Developer Tooling:** Honest empty states, visual graph pipelines, clear capability mapping.

---

## 2. Core UI Design Principles

1. **Light-First Elegance:** Default interface loads in a clean light mode with persistent theme switching stored via reactive browser state.
2. **Top Horizontal Navigation Bar:** Clean header with brand glyph, core domain links (`Overview`, `Changes`, `Digital Twin`, `Intelligence`, `Release`), search shortcut trigger (`⌘K`), active local status indicator, theme toggle, and repository CTA.
3. **Change-Centric Visual Pipelines:** Software changes are conceptualized horizontally through an interactive pipeline: `Change Ingestion` → `Dependency Resolution` → `Blast Radius Analysis` → `Release Safety Gate`.
4. **Architectural Topology Map:** The Software Digital Twin is showcased through interactive node clusters mapping caller-callee relationships across frontend, gateway, core services, and database layers.
5. **Open Typographic Evaluation Criteria:** Release safety dimensions (API Breaking Changes, Blast Radius Severity, DB Migration Safety, Security Boundary Impact, Test Coverage Delta, Deployment Risk Score) are presented with clear open typography rather than claustrophobic card grids.
6. **Restrained Color Accents:** Indigo (`#4f46e5`) anchors interactive highlights; semantic colors (emerald for verified/safe, amber for warnings, rose for breaking/critical risk) are reserved strictly for deterministic status states.
7. **Subtle Hairline Elevation:** Borders utilize subtle alpha transparency (`rgba(0, 0, 0, 0.08)` in light, `rgba(255, 255, 255, 0.08)` in dark) with soft multi-layer box shadows (`shadow-xs`, `shadow-sm`).
8. **Honest Empty States & Concept Previews:** No mock telemetry numbers, synthetic sparklines, or fabricated safety scores. Unconnected states explicitly explain the capabilities with professional dialogs.
9. **Zero Visual Flashing:** Themes are synchronized on mount using `useSyncExternalStore` without hydration mismatch or theme flicker.
10. **Professional Product Polish:** All visible surfaces use product-relevant language. No implementation-phase badges (Phase 01B, Phase 02), build versions, or development diagnostics appear on end-user screens.

---

## 3. Browser & Product Identity

- **Browser Tab Title:** `Impactra — Software Change Intelligence`
- **Application Title:** `Impactra`
- **Product Descriptor:** `Software Change Intelligence`
- **Long-Form Descriptor:** `AI-Powered Software Change Intelligence & Release Safety Platform`
- **Sub-Page Title Format:** `%s | Impactra` (e.g. `Pull Requests | Impactra`, `System Map | Impactra`, `Release Safety Gate | Impactra`)
- **Favicon & Brand Mark:** Geometric forward impact horizon propagation glyph rendered in SVG (`/icon.svg` and `/favicon.svg`), with dark rounded tile and high-contrast vector arcs.
- **Metadata Base:** Configured to `http://impactra.local`.

---

## 4. Design Token Specifications

Declared as CSS custom properties in `apps/web/src/styles/globals.css` with `@custom-variant dark` in Tailwind CSS v4:

| Token | Light (Default) | Dark | Purpose |
| :--- | :--- | :--- | :--- |
| `--background` | `#fafaf9` (warm stone-50) | `#09090b` (zinc-950) | Page canvas |
| `--surface` | `#ffffff` (pure white) | `#121215` (zinc-900 elevated) | Primary surfaces & cards |
| `--surface-raised` | `#f4f4f5` (zinc-100) | `#18181b` (zinc-900) | Nested panels, inputs |
| `--surface-subtle` | `#e4e4e7` (zinc-200) | `#27272a` (zinc-800) | Hover backgrounds |
| `--border` | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.08)` | Standard hairline borders |
| `--border-strong` | `rgba(0, 0, 0, 0.16)` | `rgba(255, 255, 255, 0.16)` | Active state borders |
| `--text-primary` | `#18181b` (zinc-900) | `#fafafa` (zinc-50) | Main headlines & titles |
| `--text-secondary` | `#52525b` (zinc-600) | `#a1a1aa` (zinc-400) | Body & descriptions |
| `--text-muted` | `#a1a1aa` (zinc-400) | `#71717a` (zinc-500) | Metadata, hints, hashes |
| `--accent` | `#4f46e5` (indigo-600) | `#6366f1` (indigo-500) | Primary actions & active tabs |
| `--accent-hover` | `#4338ca` (indigo-700) | `#4f46e5` (indigo-600) | Button hover state |
| `--success` | `#059669` (emerald-600) | `#10b981` (emerald-500) | Safe status, passing checks |
| `--warning` | `#d97706` (amber-600) | `#f59e0b` (amber-500) | Non-blocking warnings |
| `--danger` | `#dc2626` (red-600) | `#ef4444` (red-500) | Breaking changes, blockers |
| `--info` | `#0284c7` (sky-600) | `#0ea5e9` (sky-500) | Informational tags |

---

## 5. Frontend Component Hierarchy (`apps/web`)

```
src/
├── app/
│   ├── layout.tsx              # Root HTML, light theme default, metadata, SVG icon
│   ├── page.tsx                # Home route (renders AppShell + OverviewDashboard)
│   ├── icon.svg                # Next.js App Router SVG favicon
│   ├── changes/                # Changes domain routes (PRs, commit diffs)
│   ├── digital-twin/           # Digital Twin system map & graph views
│   ├── intelligence/           # Blast radius, security, architecture intelligence
│   ├── release/                # Release safety decision gate
│   └── workspace/              # Repository connectivity & workspace settings
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx        # Responsive wrapper with top navigation
│   │   ├── TopNav.tsx          # Spacious horizontal top bar with links & CTAs
│   │   ├── BrandMark.tsx       # Geometric forward impact horizon propagation glyph
│   │   ├── ThemeContext.tsx    # Reactive light/dark theme provider
│   │   └── ThemeToggle.tsx     # Theme switcher button
│   │
│   ├── dashboard/
│   │   ├── OverviewDashboard.tsx      # Master layout orchestrator (generous 16-20 spacing)
│   │   ├── HeroSection.tsx            # Large typography headline, value prop, CTAs
│   │   ├── ChangePipelineVisual.tsx   # 4-stage pipeline concept preview
│   │   ├── DigitalTwinMap.tsx         # Interactive software topology graph
│   │   ├── ReleaseSafetySection.tsx   # Open typographic 6-criteria safety evaluation
│   │   ├── AnalysisCapabilities.tsx   # 6 continuous change analysis engines
│   │   └── RecentChangesSection.tsx   # Elegant empty state with Connect Repository action
│   │
│   └── shared/
│       ├── ExplanatoryModal.tsx# Roadmap explanation modal for unconfigured integrations
│       └── PlaceholderPage.tsx # Route placeholder for sub-pages
│
└── styles/
    └── globals.css             # Tailwind v4 theme tokens, fonts, and dark mode variants
```

---

## 6. Access Modes & Local Domain Configuration

| Mode | Command | URL | Description |
| :--- | :--- | :--- | :--- |
| **Persistent Product-Like Local Mode** | `docker compose up -d` | **`http://impactra.local`** | Detached production container on port 80 (with port 3000 fallback). Persists after closing VS Code. |
| **Direct Development Mode** | `pnpm dev` | **`http://localhost:3000`** | Next.js development server with hot module replacement. |

### Manual Windows Hosts File Configuration for `impactra.local`:
Add the following line to `C:\Windows\System32\drivers\etc\hosts`:
```
127.0.0.1 impactra.local
```
