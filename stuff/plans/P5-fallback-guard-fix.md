# P5 — Relax the `backend-architecture.md` hard guard

**Goal:** Generation currently aborts unless `docs/architecture/backend-architecture.md` exists
(`llm-skills.ts:143`). Frontend-only and CLI/library projects never produce that file, so they
silently skip generation entirely. Gate on *any* architecture doc instead.

**Depth:** Short — one guard condition + a test. Independent of P1–P4.

## Files

- **Edit** `src/adapt/llm-skills.ts` — the guard in `generateSkills()`.
- **Edit** `src/__tests__/adapt/llm-skills.test.ts` — frontend-only fixture case.

## Approach

1. Replace the single-file check with: generation proceeds if **at least one** of
   `backend-architecture.md` / `frontend-architecture.md` exists (and keep the stub check).
2. The master prompt already tells the model to "skip any [doc] that does not exist" and to scope
   a missing side plainly, so no prompt change is needed — only the guard.
3. Optionally also accept `best-practices.md` alone as sufficient (a pure CLI/library project may
   have only that). Decide during impl; default: require at least one *architecture* doc to avoid
   running generation on a project where arch-doc generation itself failed.

## Decisions

- **Any-of, not all-of.** A frontend-only repo with only `frontend-architecture.md` must
  generate. The per-skill subagents already handle "this side doesn't exist."
- **Keep the stub guard.** Still require the scaffolded `SKILL.md` stubs to exist — without them
  there is nothing to rewrite.

## Verification (must be able to fail)

- Test: only `frontend-architecture.md` present (no backend) + stubs present → guard passes
  (`generateSkills` proceeds to `runClaude`).
- Test: no architecture doc at all → guard still returns `ran:false` with the doc reason.
- Regression: backend-only project (today's happy path) still passes.

## Effort

~30 min. Risk: low.
