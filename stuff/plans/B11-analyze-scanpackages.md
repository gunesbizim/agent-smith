# B11 — Unify the `analyze` / `init` analysis path

**Goal:** `init` and `analyze` should share one analysis function so `analyze --json` exposes the
same rich data `init` uses (the review noted `analyze` historically skipped `scanPackages`).
Partly mooted — `analyze.ts` now emits `{project, patterns, stackProfile, templateVariables}` —
but confirm both routes call the same builder, including `scanPackages`.

**Depth:** Short — extract a shared `analyzeProject()` and have both commands call it.

## Files

- **New/Edit** `src/analyze/analyze-project.ts` (or extend an existing module) — one
  `analyzeProject(cwd, {useLlm})` returning the full analysis bundle.
- **Edit** `src/cli/init.ts` and `src/cli/analyze.ts` — both consume `analyzeProject`.
- **Edit** `src/__tests__/` — assert parity between the two call sites.

## Approach

1. Extract the detect → sniff → scanPackages → synthesize → mapBestPractices sequence (currently
   inline in `init.ts` Steps 2–4) into `analyzeProject`.
2. `analyze` and `init` both call it; `analyze --json` serializes the whole bundle.
3. Verify `scanPackages` runs in the `analyze` path (the specific gap the review flagged).

## Decision

**Single source of analysis.** Divergent paths are how the version/ORM bugs hid; one function
makes `analyze --json` a faithful preview of what `init` will scaffold.

## Verification (must be able to fail)

- Test: `analyzeProject` output for a fixture includes package-scan version data (proves
  `scanPackages` ran).
- Test: the bundle `analyze --json` prints equals the bundle `init` consumes (same builder,
  asserted on a fixture).

## Effort

~2 hrs. Risk: low. Depends on: none (cleaner after B10 but independent).
