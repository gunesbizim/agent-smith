# D1 — Correction-Artifact Loop (ground-truth ledger)

**Goal:** The spine of the product vision. Agent-smith is human-gated, not autonomous. Its
distinctive mechanism: the AI flags its uncertainties → a human resolves only those → the
resolutions persist as checked-in artifacts → **the next run reads those artifacts as ground
truth first, skipping re-inference**. Output gets cheaper, more deterministic, and more correct
each iteration — "learning" by accumulated human-validated artifacts, **not** reinforcement
learning or weight updates.

**Depth:** Long — this is cross-cutting infrastructure that unifies A3, A11, C2, C4, P3, P4.

## The loop (the contract every consuming plan implements)

1. **Produce + flag.** Generation/detection emits values, each tagged with a confidence/source
   (A3). Low-confidence or guessed values are marked `unconfirmed`.
2. **Route to human.** Unconfirmed values are surfaced for resolution (the skills report, P4;
   the interview; or a dedicated `agent-smith confirm` step). Human attention lands exactly on
   genuine uncertainty — nothing else.
3. **Persist.** A human resolution is written to the **ground-truth ledger** as a confirmed
   artifact (checked in, so it's shared across the team and machines).
4. **Read-first next run.** Subsequent runs load the ledger before doing any work and use
   confirmed values directly — the model is **not** invoked to re-derive what a human already
   settled. This is the token saving and the determinism source.
5. **Compound.** The confirmed set grows over iterations; defaults/guesses shrink; output quality
   rises without training.

## Files

- **New** `src/artifacts/ground-truth.ts` — read/write/merge the ledger; authority resolution.
- **New** ledger file at project root: `.agent-smith/ground-truth.json` (checked in).
- **Edit** `src/shared/types.ts` — a `ConfirmableValue<T> = { value, source: "confirmed" |
  "detected" | "inferred" | "fallback", confidence?, evidence? }` wrapper.
- **New** `src/cli/confirm.ts` (+ register in `index.ts`) — `agent-smith confirm` walks the
  current unconfirmed values and writes resolutions to the ledger.
- **Edit** consumers per their own plans (A3/A11/C2/C4/P3/P4).
- **New** `src/__tests__/artifacts/ground-truth.test.ts`.

## Authority order (single rule, used everywhere)

`confirmed artifact (ledger)` ▸ `detected-in-repo fact` ▸ `LLM-derived` ▸ `static fallback`

A confirmed ledger value **always wins** and **short-circuits** re-inference for that key.

## Ledger shape (sketch)

```json
{
  "version": 1,
  "confirmedAt": "<stamped by caller>",
  "values": {
    "backend.testCommand": { "value": "go test ./...", "source": "confirmed", "by": "human" },
    "backend.orm":         { "value": null,            "source": "confirmed", "by": "human" }
  }
}
```

Keys are stable dotted paths so any consumer can look up "is this already settled?".

## Decisions

- **Checked-in, not gitignored.** Ground truth is shared team knowledge; a teammate's run reads
  the same confirmed values (unlike the per-developer marker). One human correction benefits all.
- **Read-first is the whole point.** Consumers MUST check the ledger before invoking the model
  for a key. Skipping this loses the token saving — it's the load-bearing behavior.
- **Confirmation is explicit and cheap.** Either inline in the interview / skills report, or via
  `agent-smith confirm`. Never silently auto-confirm an AI guess — that would defeat the gate.
- **Corrections override detection, not the reverse.** If the repo later changes such that a
  confirmed value is stale, surface the conflict for re-confirmation; never silently discard a
  human value.

## Verification (must be able to fail)

- Test: a key present in the ledger as `confirmed` → the consumer uses it and does **not** call
  the model/detector for that key (spy asserts zero inference calls).
- Test: authority order — confirmed beats detected beats inferred beats fallback, asserted on a
  key with all four available.
- Test: `agent-smith confirm` writes a resolution that a subsequent read returns verbatim.
- Test: a stale confirmed value (repo evidence now contradicts it) is flagged for
  re-confirmation, not silently overwritten.

## Effort

~2–3 days for the core ledger + confirm command + authority resolver. Risk: medium — the
read-first contract must be honored by every consumer or the savings evaporate; the per-consumer
wiring is tracked in A3/A11/C2/C4/P3/P4.

## Depends on / unifies

Foundation for **A3** (flagging), **A11** (reproducible context), **C2** (authority order),
**C4** (best-practices.md as a ledger artifact), **P3** (marker → ledger primitive), **P4**
(report surfaces unconfirmed values). Land the ledger core in Phase 2; primitives usable from
Phase 1.
