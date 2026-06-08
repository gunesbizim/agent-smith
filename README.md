# Agent Smith — Autonomous Development Pipeline

Single npm package that auto-configures MCP servers, scaffolds project-aware Claude Code skills, and drives autonomous ticket-to-PR workflows.

One command to bootstrap any project:

```bash
npx @gunesbizim/agent-smith init
```

---

## Prerequisites

| Requirement | Why | Install |
|-------------|-----|---------|
| **Node.js ≥ 20** | Runtime for all JS/TS MCPs (gitnexus, git-memory, playwright, sonarqube, vuetify) | [nodejs.org](https://nodejs.org) |
| **git ≥ 2.30** | Required by git-memory, gitnexus, and all git operations | [git-scm.com](https://git-scm.com) |
| **Python ≥ 3.12** | Required for serena, mempalace, ouroboros (LSP symbol navigation, memory graph, PM agent) | [python.org](https://python.org) or `brew install python` |
| **pipx** | Isolated Python package installer for serena/mempalace/ouroboros | `brew install pipx` or `pip install pipx` |
| **GitHub CLI (`gh`)** | PR creation in autonomous pipeline (optional but recommended) | `brew install gh` or [cli.github.com](https://cli.github.com) |

**Platform support:** macOS, Linux, Windows (PowerShell or WSL2 recommended for Windows).

---

## How It Works

### 1. Project Analysis

Agent Smith scans your repository and identifies:

- **Framework** — 38 backends and 16 frontends across 12 languages
- **Package manager** — npm, pnpm, yarn, Go modules, pip, composer, Cargo
- **Active libraries** — scans lock files and package manifests to find exactly which ORM, auth library, validation library, logger, database driver, cache driver, UI framework, state manager, form library, router, rendering engine, test framework, E2E tool, and mocking library your project actually uses
- **Testing & linting** — pytest, vitest, jest, golangci-lint, ruff, biome, eslint, and more
- **CI/CD** — GitHub Actions, GitLab CI, CircleCI
- **Monorepo** — Turborepo, Nx, Lerna, pnpm workspaces

### 2. MCP Server Auto-Configuration

Agent Smith installs and configures the MCP servers your project needs. Each server has a specific job in the pipeline:

| MCP Server | Role in Pipeline | When It's Used |
|------------|-----------------|----------------|
| **gitnexus** | Code intelligence graph — execution flows, blast radius, impact analysis | **Every phase.** Before any code is read or written, gitnexus maps what depends on what, so changes are surgically precise |
| **git-memory** | Semantic search over git history — past decisions, bug fixes, file timelines | **Planning & Review.** Answers "why was this built this way?" and "is this reverting a deliberate fix?" |
| **serena** | LSP-backed symbol navigation — find, rename, insert, delete symbols safely | **Implementation.** Replaces grep/read/find with precise symbol-level edits and instant diagnostics |
| **playwright** | Deterministic browser automation — navigate, screenshot, fill forms | **Frontend verification & Documentation.** Drives the app in a real browser, captures screenshots per role |
| **chrome-devtools** | Deep debugging — console, network, performance, lighthouse | **Frontend debugging.** Inspects console errors, network failures, computed styles, a11y scores |
| **sonarqube** | Static analysis — issues, quality gates, hotspots, coverage | **Quality gate.** Runs before PR to catch bugs, security holes, and duplication |
| **obsidian** | Knowledge vault — read/write structured documentation | **Documentation.** Writes technical notes and user guides to the team's knowledge base |
| **mempalace** | Persistent memory graph — cross-session knowledge | **Context.** Remembers past decisions, patterns, and preferences across sessions |
| **ouroboros** | PM agent — seed-based interviews, AC generation | **Planning.** Takes business requirements and generates acceptance criteria |
| **jira** | Issue tracking — create, update, search tickets | **Pipeline entry.** A Jira ticket triggers the full autonomous pipeline |
| **vuetify** | Vuetify 3 component API lookup | **Frontend.** Never guesses Vuetify prop/slot/event names |

### 3. Skill Scaffolding & Customization

Agent Smith generates 12 skill files customized to your project:

```
.claude/
├── commands/              ← User-facing slash commands
│   ├── backend.md         ← /backend — implements backend tasks
│   ├── frontend.md        ← /frontend — implements frontend tasks
│   ├── test.md            ← /test — orchestrates test writing
│   ├── pr-review.md       ← /pr-review — orchestrates PR review
│   ├── documentation.md   ← /documentation — generates docs
│   └── git.md             ← /git — conventional commits
├── skills/                ← Worker skills (run in subagents)
│   ├── pr-review-backend/SKILL.md
│   ├── pr-review-frontend/SKILL.md
│   ├── test-backend/SKILL.md
│   ├── test-frontend/SKILL.md
│   ├── docs-backend/SKILL.md
│   └── docs-frontend/SKILL.md
└── settings.json          ← MCP server configs + permissions
```

Each skill is templated with `{{PLACEHOLDER}}` variables that get replaced with your actual stack. For example, in a Go/Echo + React/Zustand project:

- `{{BACKEND_LINT_CMD}}` → `golangci-lint run` (not ruff)
- `{{BACKEND_TEST_CMD}}` → `go test ./...` (not pytest)
- `{{ORM_PACKAGE}}` → `sqlc@v0.3.0` (not Django ORM)
- `{{STATE_PACKAGE}}` → `Zustand@4.5` (not Pinia)

### 4. Autonomous Pipeline

```
Jira Ticket
    │
    ▼
┌─ PLAN ──────────────────────────────────────────┐
│ gitnexus_query → impact → context → route_map   │
│ ouroboros_pm_interview → AC generation          │
│ Produces: scoped implementation plan            │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─ IMPLEMENT ─────────────────────────────────────┐
│ serena find_symbol → insert → replace → diagnose│
│ vuetify component API lookup (frontend)         │
│ gitnexus_detect_changes (mid-impl check)        │
│ Produces: working code, diagnostics clean       │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─ TEST ──────────────────────────────────────────┐
│ Dispatch test-backend + test-frontend skills    │
│ Run pytest/vitest/go test/cargo test            │
│ Produces: all tests passing                     │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─ REVIEW ────────────────────────────────────────┐
│ Self-review via pr-review skills                │
│ gitnexus_shape_check + api_impact               │
│ sonarqube quality gate                          │
│ Produces: review report, blockers fixed         │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─ DOCUMENT ──────────────────────────────────────┐
│ playwright → drive app per role → screenshots   │
│ serena insert_before_symbol → API annotations   │
│ obsidian → write technical notes + user guide   │
│ Produces: docs updated, screenshots captured    │
└─────────────────────────────────────────────────┘
    │
    ▼
┌─ PR ────────────────────────────────────────────┐
│ git add + conventional commit                   │
│ git push + gh pr create                         │
│ Produces: PR linked to Jira ticket              │
└─────────────────────────────────────────────────┘
```

---

## CLI

```
npx @gunesbizim/agent-smith init              # Full project bootstrap
npx @gunesbizim/agent-smith analyze           # Detect tech stack and print report
npx @gunesbizim/agent-smith configure         # Re-run MCP configuration only
npx @gunesbizim/agent-smith doctor            # Health check: MCPs + skills + git
npx @gunesbizim/agent-smith ticket PROJ-123  # Jira ticket → autonomous pipeline
npx @gunesbizim/agent-smith pipeline          # Run pipeline on current branch
```

---

## Supported Stacks

All stacks that gitnexus can index — 38 frameworks across 12 languages.

| Language | Backends | Frontends |
|----------|----------|-----------|
| Python | Django, FastAPI, Flask, Pyramid | — |
| TypeScript/JS | Express, NestJS, Fastify, Koa, Hono, AdonisJS, Next.js API, Nuxt API, Remix, SvelteKit API, FeathersJS | React, Next.js, Vue 3, Nuxt 3, Angular, Svelte, SvelteKit, SolidJS, Qwik, Astro |
| Ruby | Rails, Sinatra | — |
| PHP | Laravel, Symfony, Slim | — |
| Java | Spring Boot, Quarkus, Micronaut, Jakarta EE | — |
| Kotlin | Spring Boot Kotlin, Ktor | — |
| Go | Gin, Echo, Fiber, Chi | — |
| Rust | Actix-web, Axum, Rocket | — |
| C# | ASP.NET Core, Blazor API | Blazor WASM |
| Swift | Vapor | SwiftUI |
| Dart | — | Flutter |
| Scala | Play Framework | — |

**Active library detection** covers 100+ packages across 14 categories (ORM, auth, validation, logging, DB driver, cache, UI, state management, forms, routing, rendering, testing, E2E, mocking).

---

## Verification

```bash
npm test        # 212 tests, 14 test files, zero failures
npx tsc --noEmit # zero type errors
```

## Import / Integrate

```typescript
import { detectProject, installMCPs, scaffoldSkills, customizeSkills } from "@gunesbizim/agent-smith";
```

Or via Smithery: `smithery install agent-smith`

**Repo:** https://github.com/gunesbizim/agent-smith
**License:** MIT
