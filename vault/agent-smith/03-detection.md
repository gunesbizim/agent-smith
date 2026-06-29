---
title: Stack Detection
type: doc
tags: [agent-smith, detection, analyze]
updated: 2026-06-17
---

# Stack Detection (the `analyze` layer)

Back to [[index]]. Modules: `src/analyze/*`. Two cooperating signals feed the template
variables consumed by [[04-generation-and-install]]:

- A **heuristic project scan** (`detectProject(rootPath)` → `DetectedProject`) — the
  multi-language cascade for project type, frontend, monorepo layout, packages, architecture.
- An **evidence-driven stack profile** (`gatherAndSynthesizeStack(rootPath)` → `StackProfile`)
  — the authority for the **backend stack and every toolchain command**, derived from the
  project's *own declared files* rather than hardcoded defaults.

> **The headline fix:** detection no longer ships a baked-in stack. The old defaults were a
> Django + Vue + SQL-Server baseline that leaked Python tooling (`ruff`, `pytest`, `manage.py`)
> onto non-Python projects. Now anything not determined from real evidence renders as honest
> `none`, never a borrowed stack.

## Evidence-driven stack pipeline

The new pipeline replaces hardcoded defaults with project-declared evidence. Three modules,
one shared entry point used by both `init` and `analyze`:

1. **`stack-evidence.ts` → `gatherStackEvidence(rootPath)`** — collects raw, language-agnostic
   evidence: build manifests/lockfiles across **all** modules (multi-module/monorepo aware,
   globbed recursively) plus CI/build-script files. It only **collects** — it never interprets.
2. **`stack-synthesizer.ts` → `synthesizeStackProfile(evidence, { useLlm })`** — turns evidence
   into a `StackProfile`. Two paths, neither ever leaks a default stack:
   - **LLM path** (opt-in, needs `claude` on PATH): evidence is fed **inline** to a headless
     `runClaude` call; the model classifies language/framework/ORM/DB/auth/commands and returns
     one line of JSON. Merged **over** the deterministic base (LLM overrides only confident fields).
   - **Deterministic manifest fallback**: per-ecosystem detectors covering **Java (Maven +
     Gradle), Node, Go, Rust, Python**. Reads the project's own manifests/scripts so CI/tests are
     stable offline. Anything it can't determine stays `null`.
3. **`gatherAndSynthesizeStack(rootPath, { useLlm })`** — the shared one-call entry that wires
   evidence → synthesis. Both `init` and `analyze` use it, so the wiring lives in one place.

Contracts live in **`stack-types.ts`**: `StackEvidence`, `EvidenceFile`, `GitNexusEvidence`
(reserved for future structural signal from a GitNexus index — currently always `null`),
`StackProfile`, `StackCommands`.

### Evidence gathered

- **Manifests** (`MANIFEST_GLOBS`): `pom.xml`, `build.gradle(.kts)`, `settings.gradle(.kts)`,
  `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `requirements*.txt`, `setup.cfg`,
  `Gemfile`, `composer.json`, `*.csproj`, `*.sln`, `mix.exs`, `pubspec.yaml`.
- **CI / build scripts** (`CI_GLOBS`): GitHub Actions workflows, `.gitlab-ci.yml`, `Makefile`,
  `justfile`, `tox.ini`, `.pre-commit-config.yaml`, `Taskfile.yml` — the most reliable source
  for the project's *real* commands.
- `node_modules`, `vendor`, `dist`, `build`, `target`, `.git`, `.venv` are never descended.
  Files are read verbatim, truncated at 20k chars, de-duplicated, and returned with stable,
  repo-relative POSIX paths. Reads never throw — an unreadable file is skipped.

### `StackProfile`

`language` / `languageVersion` (real parsed version, e.g. `<java.version>17</java.version>` →
`17`; `go 1.22` → `1.22`; never a fabricated number), `framework` / `frameworkDetail`, `orm`,
`dbEngine`, `authMethod`, `roleModel`, `roleValues` (concrete role names **only** if evidenced,
else `none`), `importStyle`, `loggingPattern`, `commands` (`test`/`lint`/`format`/`typecheck`/
`migrate`), `confidence` (0–1), `evidenceRefs` (supporting file paths), and `source`
(`"llm"` | `"manifest-fallback"`). Unknown fields are `null`/empty — never silently filled.

## Heuristic scan

1. **`project-detector.ts`** — language/framework/ORM/DB/test/lint/CI cascade.
2. **`package-scanner.ts`** — parse lock files, map packages to categories + versions.
3. **`architecture-sniffer.ts`** — detect architecture patterns; `probeSentrux()` for metrics.
4. **`best-practice-mapper.ts`** — fold everything (incl. the `StackProfile`) into `TemplateVariables`.
5. **`source-dir.ts`** — resolve which directories hold code.
6. **`llm-analyzer.ts`** — optional LLM refinement merged over the heuristics.

## project-detector.ts

A language-by-language cascade keyed on manifest/marker files, then content greps.

**Backends (~38 frameworks across 12 languages):**

| Language | Trigger files | Frameworks (detection signal) |
|---|---|---|
| Python | `manage.py`, `pyproject.toml`, `requirements.txt`, `setup.py` | Django (`manage.py`), FastAPI (`FastAPI` in `main.py`), Flask (`flask`), Pyramid |
| Node TS/JS | `package.json` (root/`backend`/`server`/`api`) | NestJS, Fastify, Koa, Hono, AdonisJS, Express, FeathersJS, Next API, Nuxt API, Remix, SvelteKit API (by dependency, in priority order) |
| Ruby | `Gemfile` | Rails (`rails`), Sinatra |
| PHP | `composer.json` | Laravel, Symfony, Slim |
| Java/JVM | `pom.xml`, `build.gradle(.kts)` | Spring Boot, Quarkus, Micronaut, Jakarta EE, Ktor (Kotlin), Play (Scala) |
| Go | `go.mod` | Gin, Echo, Fiber, Chi |
| Rust | `Cargo.toml` | Actix-web, Axum, Rocket |
| C# | `*.csproj`, `*.sln` | ASP.NET Core, Blazor API |
| Swift | `Package.swift` | Vapor |

**ORM detection** is language-specific (`detectPythonORM`, `nodeORM`, Go/Rust/PHP/Ruby keyword
matches): Django ORM, SQLAlchemy, Tortoise, Prisma, Drizzle, TypeORM, MikroORM, Knex, Mongoose,
Sequelize, GORM, Ent, Diesel, SeaORM, sqlc, Doctrine, Eloquent, ActiveRecord, Entity Framework,
Dapper, JPA/Hibernate, MyBatis, …

> **Spring/JVM ORM fix:** `spring-boot-starter-data-jpa` does **not** contain the substring
> `spring-data-jpa`, so JPA detection now matches the broader `data-jpa` plus direct
> `hibernate` / `jakarta.persistence` / `javax.persistence` markers.
>
> **Real Go version:** `languageVersion` is parsed from the `go X.Y` directive via
> `goModVersion()`, falling back to `""` — no more hardcoded `1.22` / `1.25`.
>
> **Facts-only Go ORM/auth (B3):** `goORM()` returns an ORM **only** when `go.mod`
> proves it (gorm/sqlx/ent) or `sqlc.yaml`/`yml`/`json` is present. pgx and lib-pq are
> **drivers, not ORMs** → `orm: null` (never the old fabricated `"sqlc"`). `detectDatabase`
> shares this single source of truth with the framework branch, so the two never disagree.
> `goAuth()` asserts `"JWT"` only with a real jwt dependency, else `"unknown"`. Drivers still
> prove the engine (pgx/lib-pq → postgres).

**Frontends (~20):** Vue 3 / Nuxt 3, React / Next / Gatsby / Remix / React Native, Angular,
Svelte / SvelteKit, SolidJS, Qwik, Astro — by dependency; plus non-npm: Blazor WASM, HTMX,
Alpine.js (HTML greps), Flutter (`pubspec.yaml`), SwiftUI (`*.swift`). UI library, state
manager, i18n library, and TypeScript usage are sub-detected per framework.

**Monorepo:** `workspaces` in `package.json`, `nx.json`, `turbo.json`, `lerna.json`,
`pnpm-workspace.yaml` — then scans `apps/`, `packages/`, `services/`, `libs/`.

**Database:** Django settings grep, Rails `database.yml`, Go driver imports, Node DB packages →
postgres/mysql/sqlite/mongodb/clickhouse. **Testing/Linting/CI:** pytest, vitest, jest, mocha,
go test, cargo test, phpunit, xunit; ruff/flake8/pylint, eslint/biome, clippy, golangci-lint;
GitHub Actions / GitLab CI / CircleCI / Jenkins.

> This module holds the highest-complexity functions in the repo (`detectBackend` cc≈70). It is
> the documented refactor target — see [[08-sentrux-quality-gate]].

## package-scanner.ts

`scanPackages(rootPath)` → `PackageUsage`. Parses **npm/pnpm/yarn** (`package.json` + monorepo
subdirs, `pnpm-lock.yaml` for exact versions), **Go** (`go.mod`), **Python** (`requirements.txt`,
`pyproject.toml`), **PHP** (`composer.json`), **Rust** (`Cargo.toml`). Maps **100+ packages
across 14 categories** to canonical names + versions:

`ORM · Auth · Validation · Logging · DB driver · Cache · UI · State · Form · Router · Rendering ·
Test framework · E2E · Mocking`

(e.g. `@prisma/client`→Prisma, `golang-jwt/jwt`→golang-jwt, `zod`→Zod, `pino`→Pino,
`go-redis`→go-redis, `vuetify`→Vuetify, `zustand`→Zustand, `react-hook-form`→react-hook-form,
`pixi.js`→PixiJS, `@playwright/test`→Playwright, `msw`→MSW).

## architecture-sniffer.ts

`sniffArchitecture(root, project)` → `ArchitecturePattern[]`. Detects, e.g.:

- **Backend:** hexagonal-architecture, service-repository-pattern, class-based-views-only,
  role-decorator-auth, absolute-imports, structured-logging, pii-encryption,
  openapi-annotations, audit-immutability.
- **Frontend:** composition-api-script-setup, internationalization, typescript-strict,
  pinia-store-layering, vuetify-design-system.

Also exports **`probeSentrux(root)`** — runs the `sentrux` binary (if installed) to read live
cycle count / max cyclomatic complexity / coupling grade, feeding init's quality-gate seeding.

## best-practice-mapper.ts

`mapBestPractices(project, patterns, defaults, packageUsage?, stackProfile?)` →
`TemplateVariables` (~70 keys): backend/frontend frameworks + versions,
test/lint/typecheck/dev-server commands, ORM, auth, role system, import style, DB engine,
logging pattern, API docs library, pre-push gates, sentrux thresholds, project metadata (name,
repo, git host, default branch), and a `{CATEGORY}_PACKAGE` + `{CATEGORY}_PACKAGE_VERSION` pair
per detected package.

**StackProfile is the authority for the backend.** `mapBestPractices` now accepts an optional
`StackProfile` and, when present, calls `applyStackProfile(vars, profile)` **last** — after the
heuristic mapping and after neutralization. It derives **all** backend command vars
(`BACKEND_TEST_CMD`, `_LINT_CMD`, `_FORMAT_CMD`, `_TYPE_CHECK_CMD`, `BACKEND_MIGRATE_CMD`) from
the profile's `commands`, plus language/framework/ORM/DB/auth/role/import/logging. Every command
is set explicitly, so none can fall back to a borrowed default; an unknown command becomes honest
`none`. Pre-push gates are rebuilt from the profile's lint/test/typecheck. `applyStackProfile`
no-ops when no backend language was determined, keeping honest defaults. Being applied last is
exactly what stops Python tooling appearing on a Java (or Go, Rust, …) project.

**Honest neutralization:** when a side isn't detected, backend/frontend vars are explicitly set
to `none` (via `neutralizeBackendVars`/`neutralizeFrontendVars`) instead of leaking defaults —
so CLI tools and libraries don't get a phantom web stack. This works in tandem with the now
stack-agnostic `DEFAULT_TEMPLATE_VARS` (`src/shared/templates.ts`), whose every backend/frontend
field is already `none` — the prior Django + Vue + SQL-Server baseline (the source of the leaked
Python tooling) is gone.

## source-dir.ts

`detectSourceDirs` / `resolveSourceDirs` / `writeSourceConfig`. Order: detected backend/frontend
dirs → conventional roots (`src`, `lib`, `app`, `backend`, `frontend`, …) → monorepo workspaces
→ interactive prompt (TTY) → fallback `["src"]`. Result is written to
`.claude/agent-smith/config.json` and read by the [[05-hooks-and-events#Stop — stop-change-detector.js|Stop hook]] for
layout-agnostic change classification.

## LLM refinement

> Two LLM touch-points share the same `runClaude` chokepoint but are distinct: the
> **stack synthesizer's** LLM path (above) classifies the *backend stack/commands* from inline
> evidence, while `llm-analyzer.ts` refines the *heuristic `DetectedProject`* (project type,
> backend/frontend labels). See also [[01-architecture]] and [[04-generation-and-install]].

`src/analyze/llm-analyzer.ts → refineWithLlm(cwd, project)` (used by `analyze --llm`; `init`
uses the same `runClaude` chokepoint for generation, on by default unless `--no-llm`):

1. `gatherEvidence(cwd)` — top-level listing + truncated manifest files (`package.json`,
   `go.mod`, `Cargo.toml`, …) within a 16k-char budget.
2. `runClaudeAnalysis()` — `claude -p` in a **private temp dir**, **tools off, MCP off**
   (`--strict-mcp-config --mcp-config {}`), 90s timeout. Running in-repo would boot the project's
   SessionStart hooks/MCP and hang, so it runs isolated.
3. The model returns **one line of JSON** classifying projectType/backend/frontend; `mergeStack()`
   overlays it on the heuristic result (heuristic stays the base; LLM overrides only confident fields).
4. Best-effort: missing binary, timeout, or unparseable output → silent fallback to heuristics.
