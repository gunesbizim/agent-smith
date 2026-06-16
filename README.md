# Agent Smith — Semi-Autonomous Development Pipeline

A single npm package that bootstraps a Claude Code project end to end: it **detects** your tech
stack, **interviews** you about your conventions, **scaffolds** project-aware skills and commands,
**installs and configures** MCP servers, **generates** architecture + best-practice docs, and
stands up a **deterministic architectural quality gate** — then drives a **human-gated
(semi-autonomous) ticket → PR pipeline**.

> **Semi-autonomous, by design.** Agent Smith automates the mechanical work and enforces quality,
> but it keeps a human in the loop: the pipeline has approval gates, and the architecture gate
> hands any regression back to you for an explicit decision. It does not merge unattended.

```bash
npx @gunesbizim/agent-smith init
```

---

## What it does (60-second tour)

Setting up Claude Code for a new repo is tedious: a dozen MCP servers across several JSON files,
skills that must reference your real commands, and conventions Claude has to be taught — every
time. Agent Smith automates that in four steps.

**1 — Analyze.** Scans the repo to detect framework, language, ORM, auth, validation, logging, DB
driver, cache, UI library, state manager, forms, router, rendering, test framework, E2E tool, and
mocking library — reading lock/manifest files (`package.json`, `go.mod`, `Cargo.toml`,
`composer.json`, `requirements.txt`, …) and mapping 100+ known packages to their categories. It
recognizes **38 backend/frontend frameworks across 12 languages**.

**2 — Interview.** Asks ~11 questions about your conventions (branch naming, commit format, PR
checklist, testing, architecture rules, security, code style, dependency-cycle policy, max
complexity). Each has a smart default; `?` gets Claude's elaboration. Answers are saved to
`docs/architecture/decisions.md` and folded into every generated artifact.

**3 — Scaffold.** Generates `/as-*` slash commands and worker skills **customized to your stack** —
not Django defaults. With the `claude` CLI present, it goes further and **LLM-authors** the skills
grounded in your real code: it codifies the best practices your project already follows as enforced
rules, and surfaces recommended improvements as clearly-labelled suggestions.

**4 — Configure.** Writes `.claude/settings.json` (MCP servers + hooks), `.mcp.json`,
`docs/architecture/` (architecture + `best-practices.md`), and `.sentrux/rules.toml` (the quality
gate). Hooks then run automatically every session: health check on start, git-convention + sentrux
gate before commits, and an uncommitted-change/doc check on stop.

End result: restart Claude Code and run `/as-backend`, `/as-frontend`, `/as-test`,
`/as-pr-review`, `/as-documentation`, `/as-git`, `/as-ship`, `/as-insights`, `/as-caveman` — all
referencing your actual stack, conventions, and standards.

---

## What's new in 0.6.0

- **Deterministic Sentrux architecture gate** — a zero-LLM `PreToolUse` hook gates every
  `git commit` / `git push` / `gh pr create` against a saved baseline. Degradation → it asks you
  to approve; improvement → it ratchets the baseline up automatically. The baseline only ever
  moves up. (See *Architecture quality gate* below.)
- **LLM-generated architecture & skills (default-on when `claude` is present)** — architecture
  docs and the six worker skills are authored from your real code, not template-substituted.
  Disable with `--no-llm`. No separate `--llm` flag and no API key — the Claude Code CLI is the LLM.
- **Engineering best practices** — init generates `docs/architecture/best-practices.md` (Followed
  vs Recommended), and every generated skill enforces the *Followed* standards while surfacing
  *Recommended* ones as suggestions.
- **Namespaced commands** — all slash commands are under the `/as-*` namespace to avoid collisions.

---

## Prerequisites

| Requirement | Why | Install |
|-------------|-----|---------|
| **Node.js ≥ 20** | Runtime for the CLI and JS MCPs (gitnexus, git-memory, playwright, …) | [nodejs.org](https://nodejs.org) |
| **git ≥ 2.30** | Required by git-memory, gitnexus, and all git operations | [git-scm.com](https://git-scm.com) |
| **Python ≥ 3.12** | serena, mempalace (LSP symbol navigation, memory graph) | [python.org](https://python.org) or `brew install python` |
| **pipx** | Isolated Python installer for serena/mempalace | `brew install pipx` |
| **GitHub CLI (`gh`)** | PR creation in the pipeline (optional) | `brew install gh` |
| **sentrux** | Architectural quality gate (optional but recommended) | `brew install sentrux/tap/sentrux` |

**Platforms:** macOS, Linux, Windows (PowerShell or WSL2 recommended).

---

## How it works

### 1. Project analysis

Detects framework (38 across 12 languages), package manager (npm/pnpm/yarn, Go modules, pip,
Composer, Cargo), the active libraries actually in use (100+ packages across 14 categories),
testing & linting, CI/CD, and monorepo tooling. Optional `analyze --llm` refines the stack
classification with a headless Claude pass.

### 2. MCP server auto-configuration

Each server has a job in the pipeline; browser servers are installed only when a frontend is
detected:

| MCP server | Role |
|------------|------|
| **gitnexus** | Code-intelligence graph — impact/blast-radius, execution flows. Used every phase. |
| **git-memory** | Semantic search over git history — "why was this built this way?" |
| **serena** | LSP symbol navigation + symbolic edits. Implementation phase. |
| **sentrux** | Architectural sensor + quality gate. Review phase + commit/push gate. |
| **playwright** | Headless browser automation — screenshots per role. Frontend verify & docs. |
| **chrome-devtools** | Deep debugging — console, network, performance, lighthouse. |
| **sonarqube** | Static analysis — issues, quality gate, hotspots, coverage. |
| **vuetify** | Vuetify 3 component API lookup. |
| **obsidian** | Read/write the knowledge vault (documentation). |
| **mempalace** | Persistent knowledge-graph memory. |
| **ouroboros** | PM agent — seed interviews, acceptance-criteria generation. |
| **jira** | Issue tracking — entry point for the ticket pipeline. |

### 3. Skills, commands & best practices

Generates nine `/as-*` commands and six worker skills (`pr-review-backend/frontend`,
`test-backend/frontend`, `docs-backend/frontend`), plus gitnexus/git-memory helper skills. Each
worker skill is customized to your stack via `{{PLACEHOLDER}}` substitution and framework-specific
section stripping; with the `claude` CLI present they are LLM-authored from your real code.

Every skill is grounded in two generated docs: `docs/architecture/{backend,frontend}-architecture.md`
(binding rules) and `docs/architecture/best-practices.md` — a Followed/Recommended split. Skills
**enforce** the Followed standards and **suggest** the Recommended ones (never blocking on them).

### 4. Hooks — the per-session safety loop

Configured into `.claude/settings.json` and shipped to `hooks/`:

- **SessionStart** — health check (git state, MCP presence, index freshness) and saves the sentrux
  baseline for the session.
- **PreToolUse (Bash)** — a git-convention guard (advisory) and the **deterministic sentrux gate**
  (below) before `git commit` / `git push` / `gh pr create`.
- **PreToolUse/PostToolUse (memory writes)** — suspends/resumes caveman mode so stored memories are
  full prose.
- **Stop** — classifies the diff (layout-agnostic), nudges toward `/as-git` or `/as-ship` and
  `/as-documentation`, and re-checks the gate.

### 5. Architecture quality gate (Sentrux)

A baseline (`.sentrux/baseline.json`) and rules (`.sentrux/rules.toml`) are written at init. The
`PreToolUse` hook compares the working tree against the baseline on every commit/push/PR — **no
LLM, no tokens**. Degradation → it asks you to approve (never auto-approves a regression);
improvement → it saves and ratchets the baseline up automatically. Cached by a working-tree
fingerprint so commit-then-push scans once.

### 6. Semi-autonomous pipeline (ticket → PR)

The orchestrator drives six phases — **PLAN → IMPLEMENT → TEST → REVIEW → DOCUMENT → PR** — with
**human approval gates** (`--approve-plan` default, `--approve-all`, or `--auto`). The REVIEW phase
runs the sentrux rule check + regression gate as hard blockers. This is a **human-in-the-loop**
flow; the Jira fetch and full autonomous engine are in active development.

```
Jira ticket / branch diff
   ▼ PLAN       gitnexus query/impact/context → scoped plan        (approval gate)
   ▼ IMPLEMENT  sentrux session_start → serena edits → rescan
   ▼ TEST       run the project's test suites
   ▼ REVIEW     sentrux check_rules + session_end (hard blockers) + pr-review skills
   ▼ DOCUMENT   playwright screenshots + API annotations + Obsidian notes
   ▼ PR         conventional commit + push + gh pr create
```

---

## CLI

```
npx @gunesbizim/agent-smith init              # full bootstrap (LLM on if `claude` present; --no-llm to disable)
npx @gunesbizim/agent-smith analyze [--llm]   # detect tech stack and print report
npx @gunesbizim/agent-smith configure         # (re)install + configure MCP servers only
npx @gunesbizim/agent-smith doctor            # health check: deps, MCPs, config files, git
npx @gunesbizim/agent-smith ticket PROJ-123   # Jira ticket → semi-autonomous pipeline
npx @gunesbizim/agent-smith pipeline          # run the pipeline on the current branch
```

Common `init` flags: `--auto` / `--no-interview` (skip the interview), `--dry-run`, `--dir <dir>`,
`--caveman` (~75% token-compress generated docs), `--no-llm`.

---

## Supported stacks

38 frameworks across 12 languages, plus active-library detection across 14 categories.

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

For CLI tools and libraries with no web tier, detection neutralizes the backend/frontend defaults
so skills scope themselves to what actually exists.

---

## Verification

```bash
npm run typecheck   # tsc --noEmit — zero type errors
npm test            # vitest — 431 tests across 31 files
sentrux gate .      # architectural regression gate
```

## Import / integrate

```typescript
import { detectProject, installMCPs, scaffoldSkills, customizeSkills } from "@gunesbizim/agent-smith";
```

**Repo:** https://github.com/gunesbizim/agent-smith · **License:** MIT
