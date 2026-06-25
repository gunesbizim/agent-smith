# HANDOFF — Intent router / in-session orchestrator (next task)

> Written for a fresh-context session. Read this first. Repo: `/Users/gunesbizim/Desktop/projects/agent-smith`.
> `agent-smith` is npm-linked globally → the global `agent-smith` runs THIS repo's `dist/`
> (rebuild with `npm run build` after source changes; self-reports `0.9.1`, ahead of the tag).
> Product rule: **human-gated, never "fully autonomous"** — keep that framing in code, prompts, and docs.

## The goal of the upcoming task

Let a developer write a **free-form prompt** in a normal Claude Code session, and have Claude:

1. **Classify** the request (backend / frontend / fullstack / test / docs / review / refactor; feature vs bug).
2. **Initiate the correct agent-smith flow** — e.g. a backend feature → the **gated TDD engine** with backend agents + sentrux; a frontend task → the frontend flow; etc.
3. **Orchestrate** the run, tracking steps / thinking / artifacts.
4. **Keep the human in the loop** (approval gates preserved) — propose-and-gate, never silently auto-execute.
5. **Improve over time** via the correction-artifact loop (D1), not RL.

This is the "works both ways" idea: the strict TDD engine exists as the headless `agent-smith run`;
this task brings it (and the routing) **into** an interactive Claude Code session.

## What already exists (reuse — do NOT rebuild)

| Capability | Where | Notes |
|---|---|---|
| Gated TDD engine: `understand → red → plan → code → review → pr` | `src/engine/tdd-engine.ts` (`runEngine`) | RED is a hard gate (`red-proof.json`); CODE verifies full suite green + each red test now passing; stamps `green-proof.json` with a tree fingerprint. Effects are **injectable** (`callAgent`, `runTests`, `runGate`) — that's the seam for in-session use. |
| CLI entry to the engine | `src/cli/run.ts` (`agent-smith run <ticket\|task>`), registered `src/cli/index.ts:109` | Headless: spawns `claude -p` per phase. `ApprovalGate` = `none`/`plan`/`all`. Resumable (`--resume`). |
| Specialist agents | `.claude/skills/` worker skills + `.claude/commands/as-*.md` | backend, frontend, test, pr-review, documentation, git, ship, insights, caveman, handoff. |
| Architecture gate | `sentrux gate .` + `hooks/pre-tool-sentrux-gate.js` | Fail-closed on error in the engine's `defaultRunGate`. |
| TDD enforcement at commit | `hooks/pre-tool-tdd-gate.js` | Hard-denies commit/push/PR unless `green-proof.json` (fingerprinted to the current tree) proves the red tests pass. **Only active when an engine run is live** (`.agent-smith/runs/current` pointer) — interactive edits are NOT gated today. |
| Step/thinking/artifact tracking | `src/engine/event-store.ts` (events.jsonl), `artifacts/`, `agent-smith dashboard`, `hooks/post-tool-agent-telemetry.js` | Already event-sourced + observable. Reuse this for in-session runs so artifacts/telemetry stay unified. |
| Model routing | engine uses Opus plan/review, Sonnet code | Matches the standing pref (Opus plans, Sonnet codes). |

## What is genuinely NEW (build this)

1. **Intent router / classifier** — the missing piece. Given free-form text, produce
   `{ side, kind, gates: {tdd, sentrux}, agents: [...] }`. No existing plan item is exactly this;
   closest neighbors are A2 (reasoning/execution split) and A7 (hierarchical planning).
2. **In-session engine bridge** (`/as-tdd`) — a slash command + skill that drives the same phase loop
   using the session's **Task subagents** (not nested headless `claude -p`), while writing the **same
   engine artifacts** (`red-proof.json` / `green-proof.json` / the `current` pointer / events.jsonl)
   so the existing deterministic TDD-gate hook enforces it. This is a prerequisite for the router.
3. **Dispatcher** `/as "<free text>"` — runs [1], proposes the flow, **confirms with the human**, then
   drives [2]. Optionally a passive `UserPromptSubmit` nudge that suggests the flow (opt-in).
4. **Improvement loop** — wire to **D1 (correction-artifact loop)**: flag uncertainties → human resolves
   → checked-in artifacts → next run reads them first. This is the longest pole and is "no code written" yet.

## Suggested build order

- (a) `/as-tdd` in-session engine bridge (reuse `runEngine` seams or re-drive the phases with Task subagents; reuse `red-proof.ts`/green-proof + `event-store`).
- (b) Intent router + `/as` dispatcher with a mandatory confirm + easy override.
- (c) D1 improvement loop (its own track; see `stuff/plans/D1-correction-artifact-loop.md`).

## Constraints & risks (do not skip)

- **Misclassification** — a "backend" prompt that touches frontend, or a one-liner forced through full TDD. The confirm step + override are mandatory, not optional.
- **Human-in-the-loop is the product** — the router proposes and gates; it must not silently auto-run.
- **Nested-claude vs subagents** — in-session, prefer Task subagents over spawning headless `claude -p` (auth, telemetry, and artifact unification).
- **Don't confuse `pipeline`/`ticket` (stubs, `executePhase` returns hardcoded success) with the real `agent-smith run` engine.** Build on `run`.
- Follow **smith-mode** for the build itself (stage map → delegate → failable verification → self-critique).

## Related plans (consolidate, don't duplicate)

`stuff/plans/00-index.md` is the master plan. Relevant: **A1** (event-sourced engine — largely realized as the TDD engine), **A2**, **A7**, and **D1** (the improvement spine). Consider adding a new plan file for the **intent-router/orchestrator** in that directory, in the same format, before writing code.

## Repo / session state at handoff time

- Branch **`fix/windows-install-compat`** pushed; **PR #64** open (Windows install fixes + permission/doctor fix + README usage guide). CI running, including a new **`test-windows`** job (`windows-latest`). Watch it to green; it's the first real Windows verification.
- Local at handoff: `npm test` 807/807, `npx tsc --noEmit` clean, `sentrux gate .` holds vs the committed baseline.
- `.sentrux/baseline.json` was restored to the committed version (the SessionStart hook auto-saves it to the current tree each session — don't commit a downward ratchet).
- Untracked planning files live under `stuff/` (this doc included) and are not part of PR #64.
