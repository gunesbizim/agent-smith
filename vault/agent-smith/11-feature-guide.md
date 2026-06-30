---
title: Feature Guide
type: doc
tags: [agent-smith, feature-guide, features]
updated: 2026-06-29
---

# Feature Guide

Back to [[index]].

A single, scannable index of **every feature Agent Smith ships** — the CLI, the generated
`/as-*` slash commands, the worker skills, the execution-discipline layer, model routing, the
hooks, the MCP servers, the architecture gate, and the two delivery paths (the stubbed pipeline
and the real TDD runtime engine). For each feature: **what it does**, **how to use it** (the
exact command / slash command / trigger, with a concrete example), and a `[[wikilink]]` to the
deep-dive note. Everything here is sourced from the real tree (`src/`, `hooks/`, `templates/`,
`.sentrux/`) — accuracy over length, so every "how to use" is real.

---

## 1. CLI commands (`agent-smith …`)

Defined in `src/cli/index.ts`. `agent-smith --version` reads the real version from
`package.json` at runtime. Deep dive: [[02-cli-commands]].

| Feature | What it does | How to use it (example) |
|---|---|---|
| **init** | Full project bootstrap: detect → interview → scaffold commands/skills → write MCP + hooks + arch docs + `.sentrux/` + CLAUDE.md managed block; LLM-authors skills as the final step. | `npx @gunesbizim/agent-smith init` — non-interactive: `agent-smith init --auto --yes` |
| **analyze** | Detect the stack and print a report (synthesized `StackProfile`, real toolchain commands, template vars). Writes nothing. | `agent-smith analyze` — machine output: `agent-smith analyze --json`; LLM-refined detection: `agent-smith analyze --llm` |
| **configure** | (Re)install and configure MCP servers only, no full bootstrap. | `agent-smith configure --mcp gitnexus,git-memory --yes` |
| **doctor** | Read-only health check: deps, MCP binaries on PATH, config files present, git state → `healthy`/`degraded`/`unhealthy`. | `agent-smith doctor` |
| **ticket `<id>`** | *Stub (Milestone 6)* — parses the approval gate and **previews** the planned phases for a Jira ticket; points you at `run`. | `agent-smith ticket PROJ-123 --approve-plan` |
| **pipeline** | *Stub (Milestone 6)* — **previews** the planned phases on the current branch; real phase logic lives in `src/pipeline/`. | `agent-smith pipeline --auto` |
| **run `<input>`** | **Real** TDD-first runtime engine (roadmap A1) — drives understand → red → plan → code → review → pr as headless Claude calls, event-sourced per run. | `agent-smith run PROJ-123 --approve-plan` or `agent-smith run "add rate limiting to the login endpoint"` |
| **dashboard** | Local zero-dependency web UI tailing run event logs — shows every agent call (model, phase, tokens, cost, duration, tools/MCP used). Binds `127.0.0.1` only. | `agent-smith dashboard` then open the printed URL (default port 4575) |

**Key `init` flags** ([[02-cli-commands#init]]): `--auto` (skip interview), `--dry-run`,
`--dir <dir>`, `--caveman` (compress generated `.md`), `--no-interview`, `--no-llm` (force
deterministic templates), `--yes` (approve MCP installs), `--no-install` (config only),
`--regen-skills` (re-run LLM skill generation past the once-per-repo marker).

**Key `run` flags** ([[02-cli-commands#run (TDD-first runtime engine)]]): `--auto` (no gates),
`--approve-plan` (default), `--approve-all`, `--resume <runId>`, `--model-plan <m>`,
`--model-code <m>`, `--test-cmd <cmd>`, `--dir <dir>`.

---

## 2. `/as-*` slash commands

Generated into `.claude/commands/as-*.md` from `templates/commands/`. Each is an orchestrator a
human invokes in a Claude Code session. Deep dive: [[07-skills-and-commands]].

| Command | What it does | How to use it (example) |
|---|---|---|
| **/as-backend** | Senior backend engineer — plan → GitNexus impact → RED-first tests → Sonnet implements → lint/typecheck/tests. | `/as-backend add a soft-delete flag to the Order entity` |
| **/as-frontend** | Senior full-stack frontend — same flow + **mandatory Playwright visual verification** before declaring a UI change done (never ship UI unseen). | `/as-frontend build the invoice list view with role-gated actions` |
| **/as-test** | Test orchestrator — classify target (backend/frontend/both), dispatch test skills to fresh Sonnet subagents, relay results. A failing side fails the whole command. | `/as-test src/services/order.ts` |
| **/as-pr-review** | PR-review orchestrator — sentrux remediation gate first, per-side reviews, **5-lens adversarial critic panel**, severity-graded synthesis. | `/as-pr-review` (full branch diff) or `/as-pr-review 61` |
| **/as-documentation** | Documentation orchestrator — detect what changed on the branch, dispatch `docs-backend` / `docs-frontend` in fresh subagents → Obsidian. | `/as-documentation latest` |
| **/as-ship** | Gated-autonomous path from finished work to a green PR; includes conventional-commit + push (`/as-git` was removed and folded into this command). | `/as-ship PROJ-123` |
| **/as-insights** | Project insights analyst — read arch docs/decisions/config + sentrux health, output good/issues/actions/health-score. | `/as-insights` |
| **/as-handoff** | Handoff orchestrator — write a structured `HANDOFF.md` and hand remaining work to fresh subagents when context is crowded (~60%+) or on request. | `/as-handoff` (infers task from git state if no args) |
| **/as-caveman** | Toggle ultra-compressed communication; auto-pauses for destructive/security/confusing moments. | `/as-caveman ultra` (levels: `lite`/`full`/`ultra`/`off`) |

### /as-pr-review — thin dispatcher + adversarial critics inside the skills

- `/as-pr-review` is now a **thin dispatcher**: it detects which sides changed and routes to
  `pr-review-backend` and/or `pr-review-frontend`. The adversarial critic panel now lives inside
  those skills, scoped per side.
- **Step 0 — sentrux remediation playbook:** run `sentrux gate .` *before* any review. On
  regression, **STOP** all review steps and dispatch one fresh subagent per regressed dimension
  to restore the baseline (behavior-preserving), re-running the gate up to 3 rounds; on
  improvement, save and ratchet the baseline.
- **Critic panel (inside each review skill):** five parallel adversarial lenses — security,
  performance, simplicity, maintainability, DX — each tries to *refute* the change; uses
  gitnexus (impact) and sentrux (quality) per lens.
- **Synthesis:** false-positive triage first (dropped findings auditable); then severity-driven
  action — **critical + high → auto-fix and block the verdict**; **medium + low → never block**,
  left for follow-up; a lone single-critic finding is capped at **medium** so one noisy lens
  cannot block a merge; "high-confidence-real" = ≥2 lenses flag the same issue.

### /as-ship — gated commit → PR → review → CI-green

- **Hard stops:** never on `main`/`master`; abort if tests/lint/typecheck/secrets fail; abort
  if a sentrux regression survives the bounded remediation loop.
- **Branch hygiene:** always fork from updated remote `main`; a fresh branch when the current
  one belongs to a different issue (backed by `src/pipeline/branch.ts`, [[09-pipeline]]).
- **Sentrux fix-loop:** on regression, attempt bounded remediation (max 3 rounds); on
  improvement, `sentrux gate . --save` and commit the baseline ratchet.
- **Flow:** conventional commit (with ticket) → push → `gh pr create --fill` → review-and-fix
  loop (max `{{SHIP_MAX_FIX_ATTEMPTS}}`, default 3, only confident blockers) → poll CI to green.

---

## 3. Worker skills (`.claude/skills/<name>/SKILL.md`)

Run in fresh subagents, dispatched by the orchestrators above. Templates in
`templates/skills/`. Deep dive: [[07-skills-and-commands]].

| Skill | What it does | How it's used (trigger) |
|---|---|---|
| **pr-review-backend** | Review backend diff against architecture rules — violations, role enforcement, security, logging, imports, tests; sentrux gate + false-positive check per finding. | Dispatched by `/as-pr-review` when the diff touches backend dirs |
| **pr-review-frontend** | Review frontend diff — component compliance, i18n parity, store/API layering, UI-library usage, role-aware UI, TS quality, coverage. | Dispatched by `/as-pr-review` when the diff touches frontend dirs |
| **test-backend** | Write/extend backend tests — services, views, repos, permissions, audit, encryption; **RED-first** + fail-closed role coverage (401/403). | Dispatched by `/as-test` for backend targets |
| **test-frontend** | Write/extend frontend tests — components, views, stores, API fns, role-gated rendering, i18n keys; **RED-first** + mount factories + API mocking. | Dispatched by `/as-test` for frontend targets |
| **docs-backend** | API annotations + endpoint/schema docs + a technical note in the Obsidian vault (falls back to `docs/`). | Dispatched by `/as-documentation` when backend changed |
| **docs-frontend** | Human-readable user docs — drive the running app via Playwright MCP, screenshot per role into gitignored `.playwright-mcp/`, write the guide to Obsidian. | Dispatched by `/as-documentation` when frontend changed |
| **smith-mode** | Execution-discipline skill (see §4). | Referenced by every command + the SessionStart hook |
| **handoff** | Session-continuity skill behind `/as-handoff` — inventory from artifacts → write `HANDOFF.md` (8 fixed sections) → one fresh subagent per open subtask → collect/verify/self-critique. | Dispatched by `/as-handoff`; paired with PreCompact + UserPromptSubmit hooks |
| **smoke-test** | Post-PR verification — launch the app, hit health/smoke checks, walk the migrate/smoke/rollback checklist, emit a go/no-go verdict. | Run manually after a merge or before a release |
| **pr-critic-\*** panel | Five **adversarial** critics (`security`, `performance`, `simplicity`, `maintainability`, `dx`) — each tries to *refute* the change from one angle and emits findings (`{severity, file, line, problem, fix, falsePositive}`); never a sole verdict. | Dispatched in parallel by `/as-pr-review` Step 3.5 |

> Helper stubs are also installed verbatim to teach the model how to drive the MCP servers:
> `gitnexus/{guide,exploring,impact-analysis,debugging,refactoring,cli}` and
> `git-memory/{search,debug,index,status}`.

---

## 4. smith-mode — execution discipline

**What it does:** enforces a staged loop on any task spanning multiple files, sources, or
sessions — **(1) stage map → (2) delegate independent stages → (3) failable verification →
(4) skeptical self-critique** — and is explicit that trivial single-pass tasks skip it.
Vendored from `mrtooher/smith-mode`, copied verbatim into `.claude/skills/smith-mode/`.

**How to use it:** it triggers automatically when a task is large, or explicitly when you say
"do this thoroughly" / "be systematic" / "deep work mode". Every `/as-*` command and the
SessionStart hook point the model at `.claude/skills/smith-mode/SKILL.md`. Deep dive:
[[00-overview]] (and [[07-skills-and-commands#smith-mode — execution discipline]]).

---

## 5. Subagent model routing

**What it does:** the runtime engine routes work by cognitive load — **Opus** plans, thinks, and
reviews; **Sonnet** writes tests and code — one `claude -p` call per phase/subtask (fresh
context). Source: `src/engine/tdd-engine.ts` (`DEFAULT_PLAN_MODEL = "opus"`,
`DEFAULT_CODE_MODEL = "sonnet"`).

**How to use it:** automatic in `agent-smith run`; override per run with `--model-plan <m>` /
`--model-code <m>`, or per project via the `ENGINE_PLAN_MODEL` / `ENGINE_CODE_MODEL` template
vars. The orchestrators mirror the policy (e.g. `/as-test` dispatches Sonnet subagents,
`/as-documentation` uses Opus to decide what to document and Sonnet to execute). Deep dive:
[[09-pipeline]].

---

## 6. Hooks & Claude Code events

Deterministic, zero-LLM scripts in `hooks/`, merged into `.claude/settings.json` at init. Deep
dive: [[05-hooks-and-events]].

| Hook | Event | What it does (trigger) |
|---|---|---|
| **session-start-doctor.js** | SessionStart | Injects a health check (git state, `.claude/skills`, MCP availability, GitNexus index freshness) and surfaces smith-mode each session. |
| **pre-tool-sentrux-gate.js** | PreToolUse (Bash) | Before `git commit`/`push`/`gh pr create`: scans the tree (fingerprint-cached), blocks degradation, ratchets improvements. |
| **pre-tool-tdd-gate.js** | PreToolUse (Bash) | Before commit/push/PR: denies until proven-RED tests are verified GREEN (`red-proof`/`green-proof`); allows silently when no active TDD run. |
| **pre-tool-git-guard.js** | PreToolUse (Bash) | Conventional-commit + pre-push reminders; warns on destructive rebase/reset. |
| **pre-tool-permission-guard.js** | PreToolUse (Bash) | A9 policy — denies Bash commands per `.claude/agent-smith/permissions.json`; fails open if absent. |
| **post-tool-agent-telemetry.js** | PostToolUse (Agent) | Logs subagent model/tokens/cost/duration into the interactive run log (feeds the dashboard). |
| **stop-change-detector.js** | Stop | At session end: detects uncommitted changes + docs gaps, runs the gate, suggests `/ship`/`/git`/`/documentation`. |
| **pre-compact-handoff.js** | PreCompact | Safety-net `HANDOFF-autosnapshot.md` before context compaction; fail-open. |
| **user-prompt-handoff-nudge.js** | UserPromptSubmit | One-time nudge to run `/as-handoff` at ~60% context fill. |

**How to use them:** automatic once installed — they run on the named Claude Code events; no
manual invocation.

---

## 7. MCP servers

Registered from `src/install/registry.ts` during `init`/`configure`. Deep dive:
[[06-mcp-servers]].

| Server | Scope | Role |
|---|---|---|
| **gitnexus** | project | Code-intelligence graph — impact, call chains, blast radius. |
| **git-memory** | project | Semantic search over git history — why code changed, file timelines. |
| **sentrux** | project | Real-time architecture sensor — quality score, layer/boundary rules, test-gap. |
| **playwright** | project | Browser automation — screenshots/snapshots (frontend only; artifacts to `.playwright-mcp/`). |
| **chrome-devtools** | project | Deep browser debugging — console/network/perf (frontend only). |
| **laravel-boost** | project | Laravel-aware routes/models/schema/docs (Laravel backends only; manual install). |
| **obsidian** | local | Read/write the docs vault (per-developer, never committed; needs `OBSIDIAN_VAULT_PATH`). |
| **sonarqube** | user | Static analysis — issues, quality gates, coverage (needs `SONARQUBE_TOKEN`). |
| **vuetify** | user | Vuetify 3 component docs (props/slots/events). |
| **mempalace** | user | Persistent knowledge-graph memory. |
| **jira** | user | Jira/Confluence — issues, JQL, epics (needs `JIRA_API_TOKEN`). |

**How to use them:** `agent-smith configure` installs/registers; browser MCPs are added only
when a frontend is detected, and `obsidian` prompts for the vault path.

---

## 8. Sentrux quality gate

**What it does:** a deterministic architectural regression gate. `sentrux` derives a quality
signal (0–10000) from acyclicity, depth, complexity-equality, redundancy, and modularity;
`sentrux gate` compares the working tree to a saved **baseline** (`.sentrux/baseline.json`),
`sentrux check` enforces `.sentrux/rules.toml` thresholds. Deep dive: [[08-sentrux-quality-gate]].

**How to use it:** mostly automatic — the PreToolUse hook blocks degrading commits and ratchets
improvements; the `/as-pr-review` Step 0 and `/as-ship` fix-loop run a **bounded remediation
loop** (max 3 rounds) that dispatches subagents to restore the baseline before failing.
Manually: `sentrux gate .`, `sentrux check .`, ratchet with `sentrux gate . --save`.

---

## 9. Semi-autonomous pipeline (`ticket` / `pipeline`)

**What it does:** the human-gated phase flow `branch → plan → implement → test → review → docs →
pr → ci`. The **`branch`, `pr`, and `ci` phases are real** (`src/pipeline/branch.ts` does fresh-
branch-from-updated-main hygiene; `src/pipeline/ci-status.ts` polls `gh pr checks` via
`evaluateCi` and never reports green until all CI **and Sonar** pass). The middle phases
(`plan`/`implement`/`test`/`review`/`docs`) remain **stubs** pending engine↔pipeline
integration. Deep dive: [[09-pipeline]].

**How to use it:** today these CLI commands **preview** the planned phases (`agent-smith ticket
<id>`, `agent-smith pipeline`) — use `agent-smith run` for real execution. Approval gates:
`--auto` (none), `--approve-plan` (default), `--approve-all`.

---

## 10. TDD runtime engine (`agent-smith run`)

**What it does:** the real execution path — a Node conductor that drives **UNDERSTAND → RED →
PLAN → CODE → REVIEW → PR**, one headless `claude -p` call per phase/subtask, each with a
failable check (e.g. RED requires every new test present *and failing*; CODE loops to green with
no regressions; REVIEW runs the sentrux gate). Every run is an append-only event log under
`.agent-smith/runs/<id>/events.jsonl`, so a run **resumes** by replaying the log. Deep dive:
[[09-pipeline]].

**How to use it:** `agent-smith run "<task or PROJ-123>"`; pause/resume with `--approve-plan`
(default) + `--resume <runId>`; watch live with `agent-smith dashboard`.

---

See also: [[00-overview]] · [[02-cli-commands]] · [[05-hooks-and-events]] ·
[[06-mcp-servers]] · [[07-skills-and-commands]] · [[08-sentrux-quality-gate]] · [[09-pipeline]].
