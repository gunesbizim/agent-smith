# Phase 5 spike — making `src/pipeline/orchestrator.ts` real

Status: **spike complete**. This note records what the spike proved, what it found, and a
go/no-go for the full implementation.

## Goal of the spike

De-risk turning the stub pipeline (`src/pipeline/orchestrator.ts`) into the real end-to-end
flow: `branch-hygiene → engine(TDD) → sentrux → commit → push → PR → pr-review → CI+Sonar green`.
The riskiest novel piece is the **"wait until all CI + Sonar checks are green"** loop.

## What the spike built (proven, TDD'd)

- `src/pipeline/branch.ts` — `decideBranch()` (Phase 1): pure branch-hygiene policy. 11 tests.
- `src/pipeline/ci-status.ts` — `parseGhChecks()` + `evaluateCi()`: pure CI/Sonar status
  evaluation over `gh pr checks --json name,state,bucket,link,workflow`. 19 tests.

Both are **pure** (no I/O), so the loop logic is fully unit-tested; only the thin `gh`/`git`
invocation layer remains as untested glue. This is the de-risking outcome: the hard logic is
isolated and proven.

## The CI-green loop shape (proven feasible)

```
loop until terminal or attempt budget:
  raw    = execSync(`gh pr checks <pr> --json name,state,bucket,link,workflow`)   // I/O glue
  checks = parseGhChecks(raw)                                                     // pure ✓
  eval   = evaluateCi(checks)                                                     // pure ✓
  if eval.status === "green"   → done
  if eval.status === "pending" → sleep + re-poll
  if eval.status === "failed"  → pull logs for eval.failed, attempt fix, push, re-poll (counts budget)
```

`evaluateCi` already surfaces `sonar.{present,green}` separately, so Sonar can be a first-class
loop target (gap #4 in the original analysis) without extra parsing.

## Findings / unknowns (the reason for go/no-go)

1. **Engine integration is the real cost, not the CI loop.** `executeImplementPhase` etc. are
   prose stubs that describe MCP/serena calls. Making them real means driving the headless
   `src/engine/tdd-engine.ts` (which already does RED→GREEN + opus/sonnet) from the orchestrator,
   or shelling `claude -p`. That handoff (engine ↔ pipeline) is the largest unknown.
2. **`gh` auth in headless runs.** `gh pr checks --watch` needs an authenticated `gh`. In
   cron/headless contexts the claude.ai-style MCP auth may be absent; the loop must fail-closed
   with a clear "authenticate gh" message rather than hang.
3. **Sonar issues, not just the gate.** `evaluateCi` tells us whether the Sonar *check* is green.
   Pulling individual Sonar *issues* (for false-positive triage, Phase 4) needs the `sonarqube`
   MCP (`src/install/registry.ts:98`) or the Sonar web API — out of scope for the CI gate itself.
4. **No CI lint/sentrux job server-side.** eslint + sentrux run only in the local pre-push gate.
   A real pipeline should also add those as GitHub checks (`.github/workflows/ci.yml`) so the
   loop catches what local gates would.
5. **Network sandbox.** The dev sandbox blocks sockets (`EADDRNOTAVAIL`) and SSH (push). Any
   integration test that actually calls `gh`/`git push` must be opt-in / mocked.

## Go / no-go

**GO — incrementally.** The pure cores (`branch.ts`, `ci-status.ts`) are landed and proven, so
the executable pipeline can be built on top with low risk. Recommended order for Phase 5-proper:

1. Extend `PipelinePhase` with `branch` and `ci` phases (+ `PhaseResult` already fits).
2. Add a thin, injectable command runner (`runner: (cmd) => string`) so phases are testable with
   a mocked `gh`/`git` — never call `execSync` directly inside a phase.
3. Wire `executePRPhase` (commit/push/`gh pr create`) and a new `executeCiPhase` using
   `parseGhChecks`/`evaluateCi`, with the attempt-budget loop above.
4. Defer engine integration (finding #1) to its own phase — it is the biggest chunk and should
   not block the CI-loop work.

**No-go condition:** if engine↔pipeline integration (finding #1) proves to need a major engine
refactor, keep the front half prose-only (`/as-flow`) and let the TS pipeline own only the
deterministic back half (branch → commit → push → PR → CI-green). That split still delivers the
desired flow without a risky engine rewrite.
