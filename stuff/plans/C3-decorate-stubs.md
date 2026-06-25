# C3 — Decorate stubs to fit the scanned project

**Goal:** Complete the "decorate, don't replace" step: the generator takes the example stub,
preserves its intent/shape, and injects what *this* repo actually does so each skill is a perfect
fit. Most of this lives in the C1 prompt already; this plan sources the decoration rules from the
externalized files and makes substitution-last (B8) the guarantee that output has no generic
residue.

**Depth:** Medium — prompt hardening + the substitution-last guarantee + output verification.

## Files

- **Edit** `templates/prompts/skill-generator.md` + `skill-stub-example.md` (C1) — the decoration
  rules and the example anchor.
- **Edit** `src/adapt/llm-skills.ts` — post-generation verification (no `{{}}`, no wrong-stack
  rules) as part of the report cross-check (shared with P4).
- Depends on **B8** for the substitution-last invariant.

## Approach

1. In the externalized prompt, make the decoration contract explicit: keep frontmatter `name`,
   refine `description`, preserve the Plan→analyze→act→verify shape and MCP-tool steps, replace
   every stack assumption with real values, scope-out absent sides, resolve all `{{VARS}}`.
2. The example stub is the *shape* reference — instruct "match this structure, fill with THIS
   project's facts", not "copy this content".
3. Post-pass (reuse P4's cross-check): each generated file is re-read; flag any `{{`, any
   foreign-stack rule, any placeholder command. Flagged skills are reported ✗.

## Decisions

- **Decorate from the externalized example, not a hardcoded one** (C1 dependency).
- **Verification is shared with P4** — one cross-check serves both the report and C3's
  "perfect fit" guarantee. No duplicate logic.

## Verification (must be able to fail)

- Test (canned model output): a generated skill that left a `{{VAR}}` or a Django rule on a Go
  project → cross-check flags it ✗ (test fails if it passes silently).
- Manual integration: generated skills for a real repo reference only real commands/paths.

## Effort

~half day. Risk: low–medium. Depends on: C1 (P1), B8, P4.
