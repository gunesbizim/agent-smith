---
title: CLI Commands
type: doc
tags: [agent-smith, cli, commands, flows]
updated: 2026-06-29
---

# CLI Commands

Back to [[index]]. Defined in `src/cli/index.ts` (Commander). Each command lazy-imports its
module. `agent-smith --version` reads the **real version from `package.json`** at runtime
(resolved relative to the compiled `dist/cli/index.js`) — it is no longer a hardcoded string.

```
agent-smith init        # full bootstrap
agent-smith analyze     # detect stack and print report
agent-smith configure   # (re)configure MCP servers only
agent-smith doctor      # health check
agent-smith ticket <id> # Jira ticket → planned-phase PREVIEW (stub; use `run`)
agent-smith pipeline    # planned-phase PREVIEW on branch (stub; use `run`)
agent-smith run <input> # TDD-first runtime engine (real execution) — A1 shipped
agent-smith dashboard   # local web UI tracking all agent calls
```

---

## run (TDD-first runtime engine)

**`src/cli/run.ts → runCommand(input, opts)`** — the real execution engine (roadmap A1). Drives
`understand → red → plan → code → review → pr` as orchestrated headless-Claude calls via
`src/engine/tdd-engine.ts`. **Opus** plans/thinks/reviews; **Sonnet** writes tests and code; one
`claude -p` call per subtask = fresh context. Every run is event-sourced under
`.agent-smith/runs/<id>/events.jsonl`. See [[09-pipeline]] for the phase model.

`input` is either a Jira key (`PROJ-123` → best-effort fetch via the Atlassian MCP, falling back
to a task seed) or a free-text task. Model routing is overridable per-project via the
`ENGINE_PLAN_MODEL` / `ENGINE_CODE_MODEL` template vars.

**Flags:** `--auto` (no gates), `--approve-plan` (default; pause after PLAN before CODE),
`--approve-all`, `--resume <runId>`, `--model-plan <m>`, `--model-code <m>`, `--test-cmd <cmd>`,
`--dir <dir>`.

## dashboard

**`src/cli/dashboard.ts → dashboardCommand(opts)`** — local zero-dependency web UI (node:http +
SSE) tailing `.agent-smith/runs/*/events.jsonl`. Shows every agent call (model, phase, tokens,
cost, duration, status) for engine runs AND interactive sessions (captured by the
`post-tool-agent-telemetry` hook). Binds to `127.0.0.1` only. Future remote/Azure API is a
drop-in via the `EventSource` seam (`src/dashboard/event-source.ts`).

**Tool visibility (PR #61).** The dashboard now surfaces which tools — including MCP
(`mcp__*`) tools — each agent call used. The `AgentCallFinishedEvent` (`src/engine/events.ts`)
carries an optional `tools?: Record<string, number>` map of per-tool call counts for that agent
(e.g. `{ "Read": 12, "mcp__gitnexus__query": 3 }`). `normalizeRun` (`src/dashboard/normalize.ts`)
copies that map onto the call DTO (`if (e.tools) dto.tools = e.tools`), exposed as the matching
optional `tools?` field on `AgentCallDTO` (`src/dashboard/types.ts`). The UI
(`templates/dashboard/index.html`) renders these as a per-call breakdown of pill badges beneath
the prompt summary — sorted by descending count, with `mcp__*` tools highlighted in the Opus
accent color — and a run-level **MCP** badge in each run's summary line showing the total count of
`mcp__*` calls across the run (omitted when zero). This makes the MCP-first grounding used by LLM
skill generation visible: a synthetic engine run written under `.agent-smith/runs/` after
generation tallies per-agent tool usage from the run transcript so the dashboard shows exactly
which tools and MCP servers the generation reached for.

**Flags:** `--port <n>` (default 4575, falls back if taken), `--run <id>`, `--dir <dir>`,
`--no-open`.

---

## init

**`src/cli/init.ts → initCommand(opts)`** — full project bootstrap. The orchestrator that runs
the entire [[01-architecture#Layered data flow (the `init` pipeline)|init pipeline]].

**Flags:**

| Flag | Default | Effect |
|---|---|---|
| `--platform <p>` | `claude-code` | Target platform (also Cursor/Continue scaffolding) |
| `--auto` | off | Skip the interactive interview |
| `--dry-run` | off | Do everything except write files |
| `--dir <dir>` | cwd | Target project directory |
| `--caveman` | off | Compress generated `.md` ~75% ([[04-generation-and-install#Caveman compression]]) |
| `--no-interview` | (interview on) | Skip the conventions interview |
| `--no-llm` | (LLM on if `claude` present) | Force the deterministic template/heuristic path |
| `--yes` | off | Approve MCP installs without prompting |
| `--no-install` | (install on) | Skip MCP binary install (config files still written) |
| `--regen-skills` | off | Re-run LLM skill generation even if it already ran for this repo (bypasses the once-per-repo marker, P3) |

**Step-by-step flow:**

1. `checkDependencies()` — verify Node/npm/git (Python/pipx/gh advisory). [[04-generation-and-install#Dependency check]]
1b. `ensureGhCli()` — best-effort auto-install of the GitHub CLI (`gh`) when missing, so the
   git/ship PR workflows work. No-sudo only (brew/winget/choco/linuxbrew); otherwise prints a
   manual hint. Never blocks init. `gh` still needs a one-time `gh auth login`. Skipped on `--dry-run`.
2. `detectProject(cwd)` — heuristic stack detection; refined by LLM unless `--no-llm`. [[03-detection]]
3. `sniffArchitecture(cwd, project)` — detect architecture patterns.
4. `scanPackages()` + `gatherAndSynthesizeStack()` + `mapBestPractices()` — gather evidence
   (`gatherStackEvidence → synthesizeStackProfile`, LLM unless `--no-llm`/`--dry-run`), then
   build `TemplateVariables`. The synthesized `StackProfile` is the authority for the backend
   stack and toolchain commands. [[03-detection]]
5. `probeSentrux(cwd)` — seed `SENTRUX_MAX_CYCLES`/`MAX_CC` (enforce vs ratchet mode). [[08-sentrux-quality-gate#Seeding the threshold values]]
6. `runInterview()` + `applyInterviewAnswers()` — unless `--auto`/`--no-interview`. [[04-generation-and-install#Project interview]]
7. `scaffoldCommands()` — write `.claude/commands/as-*.md`.
8. `scaffoldSkills()` — write worker + helper skill stubs.
9. `customizeSkills()` — `{{VAR}}` substitution + framework-specific stripping.
10. `writeArchitectureDocs()` — `docs/architecture/*` (template, or LLM-grounded if enabled).
11. *(generation moved to the FINAL step — see step 20, P3)*.
12. `writeSentruxRules()` — `.sentrux/rules.toml`.
13. `installSentrux()` — **late step**: scaffold `.sentrux/rules.toml` + a starter `baseline.json`
    (the gate's regression reference, previously never written). Idempotent — preserves an
    existing `.sentrux/` config; skipped on `--dry-run`. [[08-sentrux-quality-gate]]
14. `cavemanCompress()` — only with `--caveman`; compress `.claude/skills` + `docs/architecture`.
14b. **Install MCP binaries (Step 9, after the interview):** `selectServersToInstall({project})` →
    `resolveConsent()` (batch approve; `--yes`/`--auto` skip prompt, `--no-install` declines, non-TTY
    declines — never hangs) → `installMCPs({project})` with a `cli-progress` bar. Skipped on `--dry-run`.
    [[06-mcp-servers#Programmatic install (init Step 9)]]
15. `configureMCPs()` — stack-aware MCP config bundle (browser MCPs only if frontend exists).
16. `scaffoldConfigs()` — platform config files.
17. `resolveSourceDirs()` + `writeSourceConfig()` — record source dirs for the Stop hook.
18. `scaffoldHooks()` — copy hook scripts + merge hook config into `settings.json`. [[05-hooks-and-events]]
19. `writeClaudeMd()` — write/refresh the agent-smith-managed block in `CLAUDE.md`
    (between `<!-- agent-smith:start -->` / `<!-- agent-smith:end -->`), enumerating every
    scaffolded `/as-*` command and skill. Non-destructive — user content outside the markers is
    preserved; creates `CLAUDE.md` if absent.
20. `generateSkills(targetDir, { useProjectMcp:true, suppressHooks:true, regen })` — **FINAL step**
    (P3): LLM-author the worker skills now that MCP + hooks + CLAUDE.md exist, so the spawn uses
    the project's MCP servers with project hooks suppressed. Once-per-repo via marker
    (`--regen-skills` bypasses); only if LLM on and not `--dry-run`. On success writes the marker
    and renders the [[04-generation-and-install#LLM-authored skills|skills report]].

**Writes:** `.claude/commands/`, `.claude/skills/`, `.claude/settings.json`, `.mcp.json`,
`.claude/agent-smith/config.json`, `docs/architecture/`, `.sentrux/rules.toml`,
`.sentrux/baseline.json`, `hooks/`, `CLAUDE.md` (managed block).

---

## analyze

**`src/cli/analyze.ts → analyzeCommand(opts)`** — detect the stack and print a report. Does not
write project config.

**Flags:** `--json` (machine output), `--llm` (opt-in LLM refinement of detection).

**Flow:** `detectProject(cwd)` → if `--llm`, `refineWithLlm(cwd, project)` (merges an LLM stack
classification over the heuristic result) → `sniffArchitecture()` →
`gatherAndSynthesizeStack()` (evidence gather + synthesize; LLM only when `--llm`) →
`mapBestPractices()` → prints project type, backend, frontend, testing, linting, database,
CI/CD, a **`Stack (synthesized — <source>, confidence …)`** section (language, framework, ORM,
database, auth, and the real test/lint/format/migrate commands, shown only when a language was
synthesized), and the first 16 template variables. With `--json`, prints
`{ project, patterns, stackProfile, templateVariables }`.

> **`--llm` here refines *detection only*** — it is unrelated to documentation/Obsidian. See
> [[03-detection#LLM refinement]].

---

## configure

**`src/cli/configure.ts → configureCommand(opts)`** — (re)install and configure MCP servers
without a full bootstrap.

**Flags:** `--mcp <a,b,c>` (subset of servers), `--scope <project|user|all>` (reserved),
`--yes` (approve installs), `--no-install` (skip installs, still write config).

**Flow:** `checkDependencies()` → `detectProject()` → `resolveConsent()` → `installMCPs({ servers, project })` → prompt for `OBSIDIAN_VAULT_PATH`
if unset (interactive) → `detectProject()` + `configureMCPs()` (writes **all** server scopes,
including local-scope obsidian, into `.mcp.json`) + `scaffoldConfigs()` →
`ensureGitignore()` (adds `.playwright-mcp/`). There is no separate `claude mcp add` /
`registerLocalMCPs` step — it was removed; nothing writes `~/.claude.json`. See [[06-mcp-servers]].

---

## doctor

**`src/cli/doctor.ts → doctorCommand()`** — read-only health check. Writes nothing.

Reports, with ✓/⚠/✗:
- **Dependencies:** Node, npm, git (required); Python, gh (advisory — `init` auto-installs gh best-effort; doctor only reports + suggests `gh auth login`).
- **MCP binaries on PATH:** gitnexus, git-memory, sentrux.
- **Config files present:** `.claude/settings.json`, `.mcp.json`, `as-backend.md`,
  `as-frontend.md`, `pr-review-backend/SKILL.md`, `docs-frontend/SKILL.md`, `.sentrux/rules.toml`.
- **Git state:** current branch / is-a-repo.

Overall: `unhealthy` (any fail) / `degraded` (any warn) / `healthy`.

---

## ticket `<ticketId>`

**`src/cli/ticket.ts → ticketCommand(id, opts)`** — *stub (Milestone 6)*. Parses the approval
gate and prints the intended pipeline shape; Jira fetch and the semi-autonomous engine are not yet
wired.

**Flags → approval gate:** `--auto` → `none`; `--approve-all` → `all`; `--approve-plan`/default
→ `plan`. Branch convention shown: `<ticket>-auto`. See [[09-pipeline]].

---

## pipeline

**`src/cli/pipeline.ts → pipelineCommand(opts)`** — *stub (Milestone 6)*. Flags `--auto` and
`--from <phase>` are reserved. The real phase logic lives in
`src/pipeline/orchestrator.ts` ([[09-pipeline]]).
