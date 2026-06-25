# C4 — Programmatic detection of already-used best practices

**Goal:** Make "respect what the project already does" first-class and *verifiable*, not solely
model-inferred. Today the C1 prompt tells the model to "Codify the project's EXISTING best
practices" — good, but it's all in the model's judgment. Add a programmatic pass that surfaces
concrete, checkable conventions and feeds them into the prompt as facts.

**Depth:** Medium — a convention-detector module + prompt wiring.

## Files

- **New** `src/analyze/conventions.ts` — detect recurring patterns from real code.
- **Edit** `src/analyze/architecture-sniffer.ts` — extend/feed the existing pattern sniffer.
- **Edit** `templates/prompts/skill-generator.md` (C1) — consume the detected conventions list.
- **Edit** `src/adapt/architecture-writer.ts` — write the "Followed" half of best-practices.md
  from detected facts, not only from the model.

## Approach

1. Detect concrete, checkable conventions from the tree, e.g.:
   - layering (views/services/repos directories present),
   - structured logging (logger import + canonical key usage),
   - typed API boundaries (DTO/serializer/schema presence),
   - test patterns (fixtures, mount factories), i18n key usage,
   - fail-closed auth (permission decorators/middleware density).
2. Emit a structured `conventions[]` (each: name, evidence path(s), confidence).
3. Feed `conventions` into the C1 prompt as the **Followed** baseline; the model layers
   *Recommended* suggestions on top (existing behavior).
4. Architecture-writer pre-seeds best-practices.md "Followed" section from `conventions` so it's
   grounded even when the LLM path is unavailable.

## Decisions

- **Programmatic facts + model elaboration**, not model-only. Detected conventions are
  evidence-cited; the model explains/enforces them. Raises trust and works offline-degraded.
- **Never overwrite a working convention** with a generic recommendation — Followed always
  outranks Recommended.
- **best-practices.md is a D1 artifact.** The "Followed" set is ground truth: once a human
  confirms/edits a convention, it persists and the next run reads it instead of re-detecting
  (see [D1](D1-correction-artifact-loop.md)). Detected-but-unconfirmed conventions are flagged
  for human resolution; confirmed ones are authoritative and skip re-inference.

## Verification (must be able to fail)

- Test: a fixture with a services/repos layout → `conventions` includes "layered architecture"
  with the evidence path; a flat CLI fixture does not.
- Test: best-practices.md "Followed" section is populated from `conventions` even with `--no-llm`.

## Effort

~1 day. Risk: medium (convention heuristics need tuning). Depends on: C1 (P1); complements C2.
