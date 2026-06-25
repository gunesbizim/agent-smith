# A11 — Determinism

**Goal:** Make runs reproducible: pinned prompts, retrieval snapshots, immutable contexts,
replayable tool outputs. **The D1 ground-truth ledger IS the primary immutable context** — when
a run reads confirmed values instead of re-inferring, those values are fixed by construction, so
the determinism A11 wants comes mostly for free from D1. Scope A11 to the rest (prompt hashing,
snapshots) and to what agent-smith can actually control.

**Depth:** Short spec. The D1-backed determinism is buildable now; full run-replay is gated on A1.

## Prerequisite / honest scope

Agent-smith **cannot** make the model deterministic (temperature/seed are the provider's
surface). What it *can* do: pin and snapshot everything around the model so the *inputs* are
reproducible and tool outputs are replayable. Frame A11 as "reproducible context", not
"deterministic model".

**Reframed by the correction-artifact vision:** the biggest source of run-to-run variance is the
model re-inferring uncertain values differently each time. D1 removes that variance for every
**confirmed** key (the run reads the ledger, doesn't re-infer). So A11 builds *on top of* D1:
D1 fixes the confirmed inputs; A11 adds prompt-hashing + snapshots for everything still inferred.

## Approach

1. **Pinned prompts** — prompts are versioned files (C1 already moves them to `templates/prompts/`;
   record the prompt hash in the event log per step).
2. **Retrieval/context snapshots** — persist exactly what was fed to each step (A10 overlap).
3. **Replayable tool outputs** — in replay mode, serve recorded tool outputs from the event log
   instead of re-executing, so a run can be re-walked identically.
4. **Run manifest** — record agent-smith version, prompt hashes, model id per run.

## Decisions

- **Reproducible inputs, not a deterministic model.** Sets honest expectations; delivers the
  audit value enterprises actually want.
- **Replay = serve recorded outputs** (event-sourcing makes this natural — A1 dependency).

## Verification (must be able to fail)

- Test: replaying a recorded run with the same manifest produces the same event sequence + the
  same tool-output values (served from the log).
- Test: a changed prompt hash is detected and surfaced ("run differs because prompt X changed").

## Effort

~1 week post-A1. Risk: medium. Depends on: A1, A10, C1.
