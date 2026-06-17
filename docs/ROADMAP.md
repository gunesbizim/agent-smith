# Roadmap — execution-engine work (prerequisite-gated)

Agent-smith is **human-gated, not autonomous**. Most of the scorecard (Phases 0–4 and the
buildable scopes of Phase 5) ships as artifacts the existing Claude Code runtime executes — no
execution engine required. The items below are deliberately **deferred**: they depend on a real
execution engine that does not exist yet, and shipping a half-built one would re-introduce exactly
the dishonesty that [B9] removed (the `ticket`/`pipeline` commands are labelled *experimental —
orchestration not yet wired*).

> **Hard prerequisite.** `src/pipeline/orchestrator.ts` `executePhase` returns a hardcoded
> `{ success: true }` — it logs phases but executes nothing. A1 must build *both* the engine and
> the work it records. Per its plan, **do not start until the team commits to agent-smith owning
> execution** (the "different product" decision). It is multi-week, high-risk, and not next-sprint.

## A1 — Event-sourced workflow engine (foundation)

Turn the stub orchestrator into a durable engine: every run is an append-only event log
(`RUN_CREATED`, `PLAN_GENERATED`, `PATCH_APPLIED`, `TEST_EXECUTED`, `PR_OPENED`, …) under
`.agent-smith/runs/<id>/events.jsonl`, enabling resume, replay, audit, and a timeline view.

**Realistic bridge (first increment):** don't build Temporal — reuse the seam that already
exists. `runClaude` (`claude-runner.ts`) shells out to headless Claude; the first real engine is
**orchestrated repeated headless-Claude calls** (plan → implement → test → review), with
agent-smith owning state/retry/verification *between* calls and appending an event per boundary.
Gate: a real ticket producing an actual PR closes the B9 honesty gap for real.

See `stuff/plans/A1-event-sourcing.md`.

## A10 — Native observability (gated on A1)

Spans/snapshots/replay built on A1's event log (each phase = a span). Token timelines already
come from the bundled `claude-tokenstein` MCP — integrate, don't rebuild. OTel-shaped output for
standard observability stacks. See `stuff/plans/A10-observability.md`.

## Engine-gated scopes of already-landed plans

These plans shipped their **buildable-now** scope; the remaining scope waits for A1:

| Plan | Shipped now | Deferred to A1 |
|---|---|---|
| **A3** confidence | uncertainty flag on detection/generation → `agent-smith confirm` (D1 loop) | per-pipeline-step confidence gating live execution |
| **A11** determinism | prompt-hash + version manifest in the skill-gen marker; drift detection | full run-replay (serve recorded tool outputs from the event log) |

## Not building here (wrong layer / scope)

- **A6** AST patching → belongs in serena/GitNexus. In this repo it is a *checked invariant*
  (generated skills prefer serena symbolic edits over blind rewrites) — already enforced by a test.
- **A8** preview-envs / canary / rollback orchestration → owned infrastructure, out of scope for a
  scaffolder. A8 ships generated CI + post-PR verification skills instead.
