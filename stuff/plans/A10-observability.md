# A10 — Native observability

**Goal:** Traces, spans, token timelines, context snapshots, and execution replay for runs —
"OpenTelemetry for AI agents". Partly already served by the bundled `claude-tokenstein` MCP
(token timelines exist), so scope this to what's *not* external.

**Depth:** Short spec. Gated on A1 (you can only instrument a loop you own).

## Prerequisite

Real tracing needs the execution loop (A1). Token accounting is already external
(`claude-tokenstein`) — don't rebuild it; integrate.

## Approach

1. Built on A1's event log: each phase = a span (start/end events already carry timing).
2. Emit spans in an OTel-compatible shape so existing tooling can consume them.
3. Context snapshots: persist the prompt + inputs per step under the run dir (enables replay +
   prompt diffing).
4. Link token usage from `claude-tokenstein` to run/phase IDs for per-run cost.
5. `pipeline trace <runId>` renders the span tree (extends A1's timeline view).

## Decisions

- **Reuse, don't rebuild.** Token timelines come from `claude-tokenstein`; A10 adds the
  span/snapshot/replay layer A1 makes possible.
- **OTel-shaped** so it plugs into standard observability stacks (enterprise ask).

## Verification (must be able to fail)

- Test: a completed run yields a span per phase with non-zero duration and a parent run span.
- Test: context snapshot for a step round-trips (saved == replayed input).

## Effort

~1 week post-A1. Risk: medium. Depends on: A1; integrates `claude-tokenstein`.
