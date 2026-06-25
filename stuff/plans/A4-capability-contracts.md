# A4 — Capability contracts (hybrid, layered over prompt skills)

**Goal:** Give skills typed input/output/constraint contracts so they're composable, testable,
and versionable — **without** discarding the Markdown prompt body that Claude Code consumes. A
hybrid: contract frontmatter on top of the existing prompt skill, not "skills become APIs".

**Depth:** Short spec. Misfit risk if taken literally — kept deliberately thin.

## Honest scope

Skills here are deliberately Markdown prompts *for Claude Code*, not callable functions. Turning
them into typed APIs fights the host runtime. So A4 adds a *contract layer* for documentation,
validation, and composition — the prompt stays the executable artifact.

## Approach

1. Extend skill frontmatter with an optional contract block:
   `inputs:`, `outputs:`, `constraints:` (e.g. `no_schema_changes`, `must_add_tests`).
2. A validator checks contracts are well-formed at scaffold time and that the prompt body
   references its declared inputs/constraints (consistency lint).
3. Constraints surface to the model as explicit rules in the generated skill (ties to C1/C3 —
   the generator enforces declared constraints in the prose).
4. Versioning: a `contractVersion` field so skills can evolve with migration notes.

## Decisions

- **Hybrid, not rewrite.** Contract = metadata + lint + prompt-enforcement; the prompt remains
  what runs. Low cost, real composability/testability gain, no fight with the runtime.
- **Constraints are model-enforced, not type-enforced** (the runtime is an LLM, not a compiler).

## Verification (must be able to fail)

- Test: a skill declaring `constraints:[must_add_tests]` whose body never mentions tests → lint
  fails.
- Test: malformed contract frontmatter → scaffold-time validation error.

## Effort

~half day. Risk: low. Depends on: C1 (P1) for the generator to honor constraints.
