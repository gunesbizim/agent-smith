# A6 — AST-aware patching (reassigned to the GitNexus layer)

**Goal:** Smaller, safer code edits via tree-sitter / symbolic patching instead of file rewrites.
**Reassigned:** this belongs to the code-editing layer (GitNexus / serena), **not** the
agent-smith scaffolder, which barely edits user code. Documented here for completeness with an
honest "wrong layer for this repo" verdict.

**Depth:** Short spec. Lowest-fit item in the scorecard for *this* product.

## Honest scope

Agent-smith writes new scaffold files and substitutes template variables; it does not rewrite
user source, so "agents rewrite too much" is a behavior it doesn't exhibit. The right home is:
- **serena** (already integrated) — symbolic edits (`replace_symbol_body`, `insert_after_symbol`)
  are exactly AST-level patching; the generated skills already instruct using them.
- **GitNexus** — the symbol graph that would back smarter patch targeting.

## Approach (if pursued, in the right layer)

1. **Within agent-smith:** nothing to build beyond what exists — ensure generated skills prefer
   serena's symbolic edit tools over blunt rewrites (the C1 prompt already mandates this; verify
   it stays). This is the only A6 work that touches this repo.
2. **In serena/GitNexus (separate projects):** tree-sitter-backed patch generation, semantic
   diffing — out of scope for agent-smith.

## Decision

**Don't build AST patching in agent-smith.** Capture the requirement as "generated skills must
prefer symbolic (serena) edits", which the C1 prompt already encodes — make it a checked
invariant instead of new code.

## Verification (must be able to fail)

- Test: generated skills reference serena symbolic-edit tools and do **not** instruct blind
  full-file rewrites for code changes (grep the generated SKILL.md set).

## Effort

~1 hr (verification only, in this repo). Risk: low. Depends on: C1 (P1). Real AST work lives
elsewhere.
