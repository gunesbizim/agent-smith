# A1 — Event-sourced workflow engine

**Goal:** Turn the stub pipeline orchestrator into a real durable execution engine: every run is
a sequence of persisted events (`RUN_CREATED`, `PLAN_GENERATED`, `PLAN_APPROVED`, `PATCH_APPLIED`,
`TEST_EXECUTED`, `PR_OPENED`…) enabling resume, replay, audit, and timeline view. **This is the
foundation Phase 5 depends on** — A3/A10/A11 are cheap once this exists, near-impossible without.

**Depth:** Medium spec (the build itself is large/multi-week). Roadmap, not next-sprint.

## Hard prerequisite / current state

`src/pipeline/orchestrator.ts` `executePhase` returns hardcoded `{success:true, summary}` — it
logs phases but executes nothing. A1 builds *both* the engine and the work it records. Do **not**
start until the team commits to agent-smith owning execution (the "different product" decision
from `feature-scoring.md` Part A discount).

## Realistic bridge (recommended first increment)

Don't build Temporal. Use the seam that already exists: `runClaude` (`claude-runner.ts`) shells
out to headless Claude. The first real engine = **orchestrated repeated headless-Claude calls**:
plan call → implement call → test call → review call, with agent-smith owning state/retry/
verification *between* calls and appending an event per boundary.

## Phased approach

1. **Event log** — append-only JSONL per run under `.agent-smith/runs/<id>/events.jsonl`; typed
   event union; `phasesCompleted` becomes a projection over events.
2. **Real phases via the bridge** — replace each `executePhase` stub with a headless-Claude
   invocation that does the work and emits start/finish events with outputs + artifacts.
3. **Resume** — on restart, replay events to the last good state, continue from there.
4. **Approval gates as events** — `shouldPause`/`requestApproval` emit `*_APPROVAL_REQUESTED/
   GRANTED` events (already half-present).
5. **Timeline view** — a `pipeline status` command renders the event stream.

## Decisions

- **Event-sourcing over ad-hoc state.** Subsumes resume/replay/audit in one model (the scorecard's
  highest-value architecture call).
- **Bridge before durability.** Get real work happening via headless-Claude orchestration first;
  add distributed/durable guarantees only if demand appears.

## Verification (must be able to fail)

- Test: a run that crashes mid-phase replays its event log and resumes at the right phase.
- Test: same script + same inputs → identical event sequence (determinism hook for A11).
- Integration: a real ticket produces an actual PR (closes the B9 honesty gap for real).

## Effort

Multi-week. Risk: high (new subsystem). Gates: A3, A10, A11, and the real B9 fix.
