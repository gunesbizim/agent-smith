# A2 — Cognitive/execution boundary discipline

**Goal:** Enforce the invariant "the cognitive layer (detection/analysis/planning) never mutates
state; only the execution layer (scaffold/install/write) does." This is a *discipline*, not a
platform, and it maps onto a real latent bug (B8: `applyFrameworkCustomizations` mutating output
after substitution). Expressible today by hardening the analyze→adapt→scaffold boundary.

**Depth:** Medium — a structural contract + a lint/test that enforces it.

## Files

- **Edit** `src/analyze/*` — guarantee detection/analysis modules are pure (return data, write
  nothing). Audit for any fs-write in the analyze layer.
- **Edit** `src/adapt/*`, `src/scaffold/*`, `src/install/*` — these are the only layers allowed to
  mutate disk.
- **New** `src/__tests__/architecture/layering.test.ts` — a structural guard.

## Approach

1. Establish the rule: `src/analyze/**` produces facts only (no `fs.write*`, no `execFile` that
   mutates). `src/adapt|scaffold|install/**` own all mutation.
2. Add a structural test that greps the analyze layer for write/mutation calls and fails if any
   appear (a cheap fitness function — ties to the Sentrux gate ethos).
3. Resolve B8 under this banner: substitution (a transform) is the final cognitive step; no
   customization re-mutates after it.

## Decisions

- **Discipline + fitness function, not a rewrite.** The split is enforced by a test that can
  fail, so it stays true as the code grows.
- **Full cognitive/execution separation for the *agent loop*** (the report's grander framing)
  only matters once execution exists (Phase 5); this plan does the part that's real today.

## Verification (must be able to fail)

- Test: the layering guard fails if a `fs.writeFileSync` is added under `src/analyze/`.
- B8's substitution-last test passes under this layering.

## Effort

~half day. Risk: low. Depends on: complements B8.
