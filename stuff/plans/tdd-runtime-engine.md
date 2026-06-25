# Agent Smith — TDD-First Runtime Engine (A1 realized)

> Work log + plan. Read this first on any continuation. Multi-session effort.

## Context / why

Today agent-smith only *scaffolds* Claude Code config; `src/pipeline/orchestrator.ts` is a stub
(prints phases, executes nothing — roadmap A1). The user wants agent-smith converted into a real
**runtime engine on top of the Claude Code CLI**, driving a **TDD-first** workflow, while keeping
every existing `/as-*` command, skill, and hook working unchanged (additive). All current protocols
hold: smith-mode discipline, semi-autonomous/human-gated framing, Conventional Commits, vault
doc-upkeep, **run `sentrux gate` on every PR and ratchet architecture upward, never degrade**.

## Decisions (locked with user 2026-06-23)

- **Engine** = Node conductor driving headless `claude -p` (one call = fresh context). Additive.
- **Model split**: Opus for thinking/planning/review, Sonnet for coding. Tests are code → Sonnet writes
  them from an Opus-authored test plan.
- **Ticket input**: live Jira via Atlassian MCP + free-text task.
- **Dashboard**: local zero-dep web page now; EventSource seam for future Azure API.
- **Scope**: everything, in one effort (delivered as logical, sentrux-passing commits).

## TDD phase sequence (replaces implement-then-test)

| # | Phase | Model | Input | Output artifact | Failable check |
|---|-------|-------|-------|-----------------|----------------|
| a | UNDERSTAND | opus | ticket/task + stack + arch docs | `scenarios.md` (manual+automation), `test-plan.json` (unit+feature) | schema-valid, ≥1 unit + ≥1 feature, symbols exist |
| b | RED | sonnet writes | test-plan | test files + `red-proof.json` | suite run once; every NEW test present AND failing |
| c | PLAN | opus | scenarios+plan+red-proof | `subtasks.json` + `todo.md` | every red test claimed by ≥1 subtask |
| d | CODE | sonnet (1 fresh call/subtask) | one subtask + its red tests | edits + `code-log.jsonl` | targeted tests pass, no regressions; loop to green |
| e | REVIEW/PR | opus + deterministic hooks | green suite + diff | `review.json` + PR | TDD gate (green) + sentrux gate (no degradation) |

## Architecture (3 converged design agents)

- **Shared seam**: `src/analyze/claude-runner.ts` gains optional `model` + `runClaudeDetailed()` (usage/duration/status). Additive — existing callers untouched.
- **Run dir**: `.agent-smith/runs/<id>/` → `events.jsonl` (append-only, source of truth), `run.json`, `artifacts/`, plus TDD artifacts (`scenarios.md`, `test-plan.json`, `red-proof.json`, `subtasks.json`, `todo.md`). `current` pointer file = active run. Gitignored.
- **Events**: discriminated union, one JSON/line, monotonic `seq`. `agent_call_started`/`agent_call_finished` pair per headless call. Reducer `projectRunState()` rebuilds state → resume/idempotency.
- **Hooks (additive, deterministic, before sentrux gate)**: `pre-tool-tdd-gate.js` (hard-deny commit/push/PR if previously-red tests still failing; fail-open when no active run → backward compat), `post-tool-agent-telemetry.js` (PostToolUse matcher **`Agent`** → append interactive calls to `.agent-smith/runs/interactive-<sid>/events.jsonl`). Clone `pre-tool-sentrux-gate.js` pattern (stdin parse, tree-fingerprint cache, stdout verdict, fail-open).
- **Dashboard**: `agent-smith dashboard` → `node:http` + SSE tailing `runs/*/events.jsonl`. `EventSource` interface (LocalFsEventSource now; RemoteApiEventSource = future Azure drop-in). Self-contained `templates/dashboard/index.html`. Merges engine + interactive via one normalizer.
- **Single source of truth for test prose**: engine reuses scaffolded `test-backend`/`test-frontend` SKILL.md; new shared `templates/prompts/tdd-*.md` use existing `resolveTemplate()`.

## Key capability facts (verified via claude-code-guide)

- Subagent model: `model:` frontmatter in `.claude/agents/*.md`; per-call override; values opus/sonnet/haiku/fable/id/inherit.
- Subagent dispatch tool is **`Agent`** (NOT Task). PreToolUse/PostToolUse fire on it; PostToolUse gives `resolvedModel,totalTokens,totalDurationMs,usage`. `SubagentStart`/`SubagentStop` also exist.
- Hooks can append JSONL reliably. Skills can pin `model` (turn-scoped) or `context: fork` + `agent`.

## Build stages — ALL COMPLETE ✅ (branch `feat/tdd-runtime-engine`)

1. ✅ Foundation: runClaude `--model` + `runClaudeDetailed`; `src/engine/{run-dir,events,event-store,run-state}.ts` + tests.
2. ✅ Conductor + TDD phases + `agent-call` + `gates` + `red-proof` + `parse` + `prompts` + `fingerprint` + tests.
3. ✅ Hooks: `pre-tool-tdd-gate.js` + `post-tool-agent-telemetry.js` (+ `.d.ts`) + scaffold registration + tests.
4. ✅ Dashboard: `src/dashboard/*` + `templates/dashboard/index.html` + `agent-smith dashboard` + tests (incl. live smoke).
5. ✅ CLI `run` + Jira (`fetchJiraTicket` via Atlassian MCP, best-effort) + `ENGINE_PLAN_MODEL`/`ENGINE_CODE_MODEL` vars.
6. ✅ Honesty banner reframe (points to `run`) + ROADMAP "A1 shipped" + roadmap-honesty test rewrite. orchestrator.ts kept as-is (legacy preview only).
7. ✅ Vault doc upkeep (01/02/05/09). Verify: build ✓, typecheck ✓, vitest 741 ✓, sentrux gate ✓ (6312→6316, no degradation). NOTE: eslint not installed locally — CI must run it.

## Not done / follow-ups
- No live end-to-end run against a real model yet (conductor unit-tested with stubbed agent calls).
- Jira live fetch likely null headless (claude.ai Atlassian needs interactive auth) → free-text/seed fallback is the common path.
- Not committed/pushed (awaiting user). Committing will trip the sentrux hook → auto-ratchet baseline 6312→6316.

## Risks (carry forward)

- RED false negatives: a test that errors on import ≠ a test that asserts-and-fails. `red-proof.json` records per-test status; require collected+FAIL, not just non-zero exit. RED writer + gate share ONE parser (`red-proof.ts`).
- Test-command portability: `BACKEND_TEST_CMD`="none" → fail-open, never run literal "none". Per-runner status parsing (pytest/jest/go/cargo); generic fallback downgrades gate to "ask human".
- Backward-compat: TDD hook must fail-open with no active run (the `current` pointer guard). Add a scaffold/hooks test asserting all prior hooks still registered.
- execFileSync blocks; coding calls exceed 90s default → engine passes large per-phase timeout.
- `.agent-smith/runs/` must be gitignored in scaffolded repos too.

## Verification (end-to-end)

`npm run build && npm run typecheck && npm test && npm run lint`, then `sentrux gate .` (must not degrade).
Engine smoke: `agent-smith run "tiny task" --dir <fixture>` produces a run dir with events; `agent-smith dashboard` renders it.
