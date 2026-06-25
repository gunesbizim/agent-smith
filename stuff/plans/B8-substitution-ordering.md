# B8 — Template substitution ordering

**Goal:** `applyFrameworkCustomizations` runs *after* template substitution and can re-inject
`{{...}}` placeholders (e.g. replacing `python manage.py` with `# {{BACKEND_MIGRATE_CMD}}`). It
didn't fire in the review's run only because the templates lacked that literal — the ordering is
fragile. Make substitution authoritative and last. Protects C3's "perfect fit" output.

**Depth:** Short — reorder + a fixpoint guard + a test that would catch reintroduction.

## Files

- **Edit** `src/adapt/skill-customizer.ts` (and any caller that orders customization vs
  substitution — trace from `customizeSkills`).
- **Edit** `src/__tests__/adapt/` — a test asserting no residual `{{` after customization.

## Approach

1. Reorder so `resolveTemplate({{VAR}})` runs **after** all `.replace`-style framework
   customizations — substitution is the final pass.
2. Add a **fixpoint guard**: after substitution, scan output for `{{`; if any remain, run one
   more substitution pass; if still present, fail loudly (in tests) / log (at runtime) rather
   than shipping a placeholder.
3. Prefer eliminating the regex-replace customizations entirely once C1/C3 move generation to
   the LLM — but the guard is the safety net regardless.

## Decision

**Substitution last + fixpoint scan.** Cheap invariant that makes the ordering hazard
impossible to ship silently. Ties to A2 (cognitive layer never re-mutates after the final pass).

## Verification (must be able to fail)

- Test: a customization that injects `{{BACKEND_MIGRATE_CMD}}` → final output has the resolved
  command, **no** `{{`.
- Test: an intentionally unresolved var → the guard flags it (test fails) rather than passing.

## Effort

~1 hr. Risk: low.
