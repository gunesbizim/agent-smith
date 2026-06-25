# C2 — Fully dynamic best-practice selection (no hardcoded stack values)

**Goal:** Best-practice commands (test/lint/format/migrate/typecheck) come from **detected facts +
the externalized prompt generator (C1)**, not from a baked-in language→command map. Resolves the
root cause of the B1/B3/B4 bug class: you can't emit `ruff` on Go or fabricate `sqlc` if nothing
is hardcoded.

**Depth:** Long — touches the mapper, the C1 prompt, and the honest-fallback policy.

## Files

- **Edit** `src/analyze/best-practice-mapper.ts` — demote the static command tables to a thin,
  clearly-labeled **fallback** used only when the LLM path is unavailable.
- **Edit** `templates/prompts/skill-generator.md` (C1) — the model derives commands from real
  manifests/configs (package.json scripts, Makefile, go.mod, Cargo.toml, CI files).
- **Edit** `src/analyze/stack-synthesizer.ts` — ensure detected facts (commands found in
  manifests/CI) flow through as authoritative when present.

## Approach

1. **Authority order (now D1-topped):** (a) **confirmed value in the D1 ground-truth ledger** →
   (b) commands actually found in the project (npm scripts, Makefile, CI steps, tool configs) →
   (c) LLM-derived from the real stack via C1 → (d) thin static fallback, labeled, only when
   claude is unavailable. A confirmed ledger value short-circuits (a)–(d) and is used directly —
   no detection or LLM call for that key.
2. Strip the per-language *defaults baked as the baseline*; keep a minimal fallback table that is
   explicitly "best-effort, offline only" and never silently presented as detected.
3. The C1 prompt instructs: "Use the REAL commands from the manifests/CI; never a placeholder or
   a generic language default. If none exist, state that the command is unconfirmed."
4. Honest unknowns: when no command can be proven and no LLM is available, emit `"none"` /
   "unconfirmed — set in best-practices.md", never a fabricated default.

## Decisions

- **LLM-primary, static-fallback — NOT literally zero static knowledge.** `generateSkills()` is
  best-effort and falls back to templates when claude is absent, so the static mapper is
  **demoted, not deleted** — offline/no-key runs still produce *something*, clearly labeled as a
  fallback. (This is the honest framing from the scorecard self-critique.)
- **Detected-in-repo beats inferred.** A command the project actually defines always wins over an
  LLM guess or a fallback.
- **Confirmed (D1) beats everything.** A human-confirmed ledger value outranks even detection, and
  skips re-inference — this is where C2's token saving compounds across runs (see [D1](D1-correction-artifact-loop.md)).
  Unconfirmed values C2 produces are flagged so D1 can route them to a human.

## Verification (must be able to fail)

- Golden test (B2): Go fixture → no `ruff`/`pytest`/`manage.py` anywhere in generated output;
  commands match the fixture's real go.mod/Makefile.
- Test: a project with a `test` npm script → that exact script is the emitted test command
  (authority order respected).
- Test: claude unavailable + no manifest commands → output says "unconfirmed", not a Django
  default.

## Effort

~1 day. Risk: medium. Depends on: B10 (clean facts), C1 (P1, externalized prompt), B2 (lock).
