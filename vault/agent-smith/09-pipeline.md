---
title: Semi-Autonomous Pipeline
type: doc
tags: [agent-smith, pipeline, jira, semi-autonomous]
updated: 2026-06-30
---

# Semi-Autonomous Pipeline

Back to [[index]]. The ticket → PR flow. **Semi-autonomous, not fully autonomous** — built around
human-in-the-loop approval gates; the sentrux gate hands regressions back to a human and it does not
merge unattended.

> **Two paths.** The **real runtime engine** shipped (roadmap A1) as
> [[02-cli-commands#run (TDD-first runtime engine)|`agent-smith run`]] (`src/engine/tdd-engine.ts`).
> The legacy `agent-smith ticket`/`pipeline` commands still use the **stub** orchestrator
> (`src/pipeline/orchestrator.ts`, `executePhase` returns hardcoded success) and now **preview** the
> planned phases with a yellow banner pointing to `run`. Use `run` for execution.

## TDD-first runtime engine (`agent-smith run`) — the real path

`src/engine/` is a Node conductor that drives **one headless `claude -p` call per phase/subtask**
(each a fresh context) on top of the Claude CLI. **Opus** plans/thinks/reviews; **Sonnet** writes
tests and code. Every run is an append-only event log under `.agent-smith/runs/<id>/events.jsonl`
(`src/engine/event-store.ts`); state is a pure projection (`run-state.ts`), so a run **resumes** by
replaying the log. All external effects (model calls, test runs, the sentrux gate, approval prompts)
are injectable, so the conductor is fully unit-tested.

**TDD phase sequence** (replaces the stub's implement-then-test order):

| Phase | Model | Output artifact | Failable check |
|---|---|---|---|
| UNDERSTAND | opus | `scenarios.md`, `test-plan.json` | ≥1 unit + ≥1 feature test |
| RED | sonnet | test files, `red-proof.json` | every NEW test present AND failing (not a mere non-zero exit; a collection error is invalid — see `red-proof.ts`) |
| PLAN | opus | `subtasks.json`, `todo.md` | every failing test claimed by ≥1 subtask |
| CODE | sonnet (1 fresh call/subtask) | edits, `green-proof.json` | targeted tests pass, no regressions; loop to green |
| REVIEW | opus | `gate_result` | sentrux gate — **no architecture degradation** |
| PR | — | readiness | hand off to gated `/as-ship` |

**Approval gates** (`gates.ts`, real — not the old auto-approve stub): `none` (full-auto), `plan`
(default; pause after PLAN before CODE), `all` (before every phase). A required pause in a
non-interactive context becomes a clean `paused` run, resumable with `--resume`.

**Deterministic enforcement (feature 7 — reduce reliance on agent compliance):** the
[[05-hooks-and-events#`pre-tool-tdd-gate.js` (deterministic TDD gate)|TDD gate hook]] hard-blocks
commit/push/PR unless the red tests are verified green on the current tree, and the sentrux gate
blocks degradation — both run before any commit, zero LLM, zero tokens.

**Tracking UI (feature 8):** [[02-cli-commands#dashboard|`agent-smith dashboard`]] tails the event
log live. The legacy stub flow below remains only for the preview commands.

## Pure pipeline helpers (pulling the stub toward real)

Two **pure, unit-tested** modules now back the deterministic back half of the flow. Both are
side-effect-free (no `git`/`gh`/`execSync` inside) so their logic is fully testable; only a thin
invocation layer remains as glue.

| Module | Function(s) | Role | Tests |
|---|---|---|---|
| `src/pipeline/branch.ts` | `decideBranch()` | Branch hygiene: fork a fresh branch from **updated** `origin/main` unless continuing an existing issue. `create` paths always emit `git fetch origin` **before** `git switch -c … origin/<base>`, so a branch never forks from stale local `main`. Wired into the `/ship` preflight. | 11 |
| `src/pipeline/ci-status.ts` | `parseGhChecks()`, `evaluateCi()` | CI/Sonar gate: parse `gh pr checks --json name,state,bucket,link,workflow`, derive `green`/`pending`/`failed` (fail dominates pending; `skipping` counts green), and surface **Sonar as a first-class target** via `sonar.{present,green}`. | 19 |

**`evaluateCi` green allowlist and pending-by-default semantics (PR #65):**
`evaluateCi` maps check states to outcomes using an **explicit green allowlist**: only `pass`
and `skipping` are treated as green. Any state not in the allowlist — including `""`, unknown
strings, or absent fields — is treated as **pending, never green**. Consequences:

- A freshly-opened PR with **no checks yet** returns `pending`, not `green`. The CI phase
  will wait rather than falsely reporting success.
- An **unknown bucket/state** from a new check type is conservatively pending until it
  resolves to a known-green value.
- The CI phase returns overall `green` **only when every check** — including Sonar — has
  individually resolved to an allowlisted state. Fail dominates pending; a single `fail`
  short-circuits to `failed` regardless of the rest.

For the sentrux remediation behaviour that runs inside `/as-ship` before the CI phase, see
[[08-sentrux-quality-gate#Bounded remediation loop in /as-ship and /as-pr-review]].

**Phase 5 spike** (history): an earlier spike de-risked the "wait until all CI + Sonar green"
loop and returned **GO incrementally** — land the pure cores first, then a thin injectable command
runner plus a real `executePRPhase`/`executeCiPhase`, deferring engine↔pipeline integration as the
largest unknown. Those cores are now landed and proven; the planning notes that tracked this work
(the former `stuff/plans/` archive) were removed once the vault became the canonical documentation.

---

## Legacy stub orchestrator (preview only)

## Phases (in order)

`["branch", "plan", "implement", "test", "review", "docs", "pr", "ci"]` — `runPipeline(ctx, deps)`
loops them, recording `PhaseResult` per phase and **halting immediately on the first failure**.
`branch`, `pr` and `ci` are now **real** (injectable `PipelineDeps.run`/`sleep`): `branch` applies
`decideBranch`, `pr` pushes + `gh pr create`, `ci` polls `gh pr checks` through `evaluateCi` and
never reports success until all CI + Sonar are green. `plan`/`implement`/`test`/`review`/`docs`
remain stubs pending engine↔pipeline integration (Phase 5 spike, deferred).

```
Jira ticket / branch diff
        ▼
PLAN       gitnexus_query → impact → context; (ouroboros AC generation) → scoped plan
        ▼
IMPLEMENT  sentrux session_start (baseline) → gitnexus impact + find/navigate symbols
           → sentrux rescan (catch cycles mid-impl)
        ▼
TEST       run the project's test suites
        ▼
REVIEW     sentrux check_rules (hard blocker) + session_end (regression gate)
           + self-review via pr-review skills (arch / security / coverage / quality)
        ▼
DOCS       playwright screenshots per role + API annotations + Obsidian notes
        ▼
PR         git add + conventional commit + push + gh pr create  → PR linked to ticket
```

## Approval gates

`shouldPause(phase, gate)` — gate comes from the CLI flags:

| Gate | Set by | Behavior |
|---|---|---|
| `none` | `--auto` | never pause |
| `plan` | `--approve-plan` / default | pause before PLAN only |
| `all` | `--approve-all` | pause before every phase |

`requestApproval(phase)` currently auto-approves (logs intent); interactive prompting is the
Milestone-6 work. Resume support: `--from <phase>` / `ctx.phasesCompleted` lets the loop restart
after the last completed phase.

## Context & result shapes

```ts
PipelineContext {
  ticketId, ticketTitle, ticketDescription,
  acceptanceCriteria: string[], branch,
  approvalGate: "none" | "plan" | "all",
  phasesCompleted: PipelinePhase[],
  phaseResults: Map<PipelinePhase, PhaseResult>
}
PhaseResult {
  phase, success, summary,
  filesChanged: string[], errors: string[], warnings: string[],
  qualitySignal?: { before, after, bottleneck }   // populated by REVIEW (sentrux session_end)
}
```

## Jira entry

`src/jira/ticket-parser.ts` parses ticket text into technical requirements
(`extractTechnicalRequirements`) that seed the PLAN phase's acceptance criteria. The live Jira
fetch goes through the `jira` MCP ([[06-mcp-servers]]) — wired in Milestone 5/6.

## How the gate plugs in

The pipeline's REVIEW phase mirrors the always-on commit/push gate
([[08-sentrux-quality-gate]]): `session_start` at IMPLEMENT saves the baseline, `session_end` at
REVIEW fails the pipeline on regression, and `check_rules` is a hard blocker before PR. So even
even the semi-autonomous path cannot ship an architectural regression without a human accepting it.
