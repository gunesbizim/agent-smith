# A3 — Confidence scoring per step

**Goal:** Each step emits `{confidence, risk, assumptions, unknowns}`. Its **primary purpose is to
drive the correction-artifact loop (D1): confidence is the signal that decides which values get
routed to a human for resolution** — not scoring for its own sake. Low-confidence values become
the `unconfirmed` items the human resolves; the resolutions persist to the D1 ledger. Secondary
use: approval policies route on it (`confidence < 0.7 → require_human_review`).

**Depth:** Short spec. The *human-gating* use (D1) is buildable now; the *per-pipeline-step* use
is gated on A1.

**Reframed by the correction-artifact vision:** previously framed as autonomy-safety scoring;
now framed as the **uncertainty flag of the D1 loop**. This makes A3 valuable *today* (it gates
human input on detection/generation, no execution engine needed), not only after A1.

## Prerequisite

Two scopes now, post-reframe:
- **D1 scope (buildable now):** scoring detection/generation outputs so uncertain values route to
  the human and persist to the ledger. No engine needed — moves A3 effectively into Phase 2/3.
- **Pipeline scope (gated on A1):** scoring live execution steps is meaningful only once steps
  actually do work; scoring a stub that returns `success:true` is theater.

## Approach

1. Each phase (post-A1) returns a confidence block alongside its result/event.
2. The headless-Claude step prompt asks the model to self-report confidence + assumptions +
   unknowns in a structured block (same sentinel-fenced pattern as P4's report).
3. `shouldPause` consumes confidence: below a configurable threshold → force the approval gate.
4. Confidence + risk are written into the event log (A1) for audit.

## Decisions

- **Self-reported + calibrated over time.** Start with model self-report; later calibrate against
  outcomes (did low-confidence steps fail more?) once the event history exists.
- **Threshold is policy, not code** — configurable per project (ties to A9's policy schema).

## Verification (must be able to fail)

- Test: a step returning `confidence:0.5` triggers the approval gate; `0.9` does not.
- Test: malformed confidence block → safe default (treat as low → require review), never crash.

## Effort

~1 day post-A1. Risk: medium (calibration is the hard part). Depends on: A1.
