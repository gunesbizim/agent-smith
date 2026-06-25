# B10 — Facts-only detection registry

**Goal:** Collapse `project-detector.ts` (~1,260 lines of repeated `BackendInfo` literals — every
Go/Rust framework hand-writes a near-identical object) into a single declarative registry that
emits **detected facts only**. Makes "parse the real version", "don't fabricate ORM", and every
future detector change a one-line edit instead of twenty. Spine of the dynamic-detection work.

**Depth:** Long — the largest refactor in the set; high downstream payoff (unblocks B3/B4/C2).

## Files

- **New** `src/analyze/detector-registry.ts` — the declarative table + a single builder.
- **Edit** `src/analyze/project-detector.ts` — replace inline literals with registry lookups;
  keep the public `detectProject` signature stable.
- **New** `src/analyze/fs-helpers.ts` — consolidate `readJson`/`readFileSafe`/`pkgDeps`
  (currently duplicated in `project-detector.ts` and `package-scanner.ts`) with a small
  directory-walk cache (the review's fs-helper consolidation).
- **Edit** `src/__tests__/` — registry-driven detector tests across stacks.

## Approach

1. Define a row type: `{ marker, framework, language, capabilities }` where `capabilities`
   describes how to extract *facts* (version parser, ORM markers, auth markers, logging markers)
   — **not** baked command defaults (commands come from C2, never the registry).
2. Author rows for every framework the current code supports (Go: gin/echo/fiber/chi/generic;
   Rust: actix/axum/rocket/generic; Python; Node; etc.), each pointing at evidence extractors.
3. Single builder walks markers, applies the matching row's extractors against real files,
   returns `BackendInfo` with only proven fields set (null otherwise — aligns with B3).
4. Version parsing: one shared parser per language (Go already has `goModVersion`; generalize).
5. Consolidate the duplicated fs helpers + `findSubPackages` walk into `fs-helpers.ts` with a
   per-run cache to cut redundant I/O.

## Decisions

- **Registry holds detection, not best practices.** Removing the `defaults`/command responsibility
  is the clean separation C2 depends on. The registry answers "what is this?", never "what should
  we run?".
- **Public API stable.** `detectProject` callers (init, analyze) must not change — refactor is
  internal. This keeps B11 (analyze/init unification) orthogonal.
- **Incremental migration.** Move one language family at a time behind the registry, with tests
  green at each step, rather than a big-bang rewrite.

## Verification (must be able to fail)

- Per-stack tests: each framework fixture yields the same `BackendInfo` facts as today minus the
  fabricated fields (snapshot diff reviewed).
- Test: real `go 1.22` go.mod → `languageVersion:"1.22"` (no hardcoded `1.25`).
- Test: fs-helpers cache returns identical results to uncached reads (no behavior change).
- Line-count check: `project-detector.ts` materially smaller; duplication greppably gone.

## Effort

~1–2 days. Risk: medium — broad surface; mitigated by incremental migration + per-stack tests.
Depends on: none structurally; do **before** C2 so C2 consumes clean facts. Pairs with B2.
