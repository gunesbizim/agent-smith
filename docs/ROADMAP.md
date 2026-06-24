# Roadmap — execution-engine work (prerequisite-gated)

Agent-smith is **human-gated, not autonomous**. Most of the scorecard (Phases 0–4 and the
buildable scopes of Phase 5) ships as artifacts the existing Claude Code runtime executes — no
execution engine required. The items below are deliberately **deferred**: they depend on a real
execution engine. As of the TDD-first runtime engine, **A1 has shipped** as `agent-smith run`
(the headless-Claude conductor). The legacy `ticket`/`pipeline` commands remain *previews* (they
print the planned phases via the stub orchestrator and do not execute) and now point users to
`agent-smith run` for real, human-gated execution — so the [B9] honesty guarantee still holds.

## A1 — Event-sourced workflow engine (foundation) — ✅ Shipped

**Shipped** as the TDD-first runtime engine: `agent-smith run <ticket|task>` drives
UNDERSTAND → RED → PLAN → CODE → REVIEW → PR as orchestrated headless-Claude calls (Opus plans,
Sonnet codes; one call per subtask = fresh context). Every run is an append-only event log under
`.agent-smith/runs/<id>/events.jsonl` (`run_started`, `agent_call_started/finished`, `test_run`,
`gate_result`, `run_finished`, …), enabling resume (pure-reducer replay), audit, and the live
dashboard. State/retry/verification live *between* calls in the conductor (`src/engine/`); the
deterministic TDD-gate hook blocks any commit/push/PR until the previously-red tests are verified
green on the current tree, and the sentrux gate still enforces no architecture degradation.

The stub `src/pipeline/orchestrator.ts` remains only to back the legacy `ticket`/`pipeline`
previews. See `stuff/plans/tdd-runtime-engine.md` and `stuff/plans/A1-event-sourcing.md`.

## A10 — Native observability (partially shipped on A1)

The live agent-call dashboard (`agent-smith dashboard`) ships now on A1's event log — a local
zero-dependency web UI tailing `runs/*/events.jsonl` over SSE, merging engine runs and
interactive (hook-captured) calls, with a clean EventSource seam for a future remote/Azure API.
Remaining: OTel-shaped export for standard observability stacks, and token timelines from the
bundled `claude-tokenstein` MCP. See `stuff/plans/A10-observability.md`.

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
