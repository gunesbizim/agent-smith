# A5 — Multi-agent debate / critic panels (generated skills)

**Goal:** Add adversarial critic panels (security / performance / DX / simplicity /
maintainability) to the review flow, then synthesize consensus — shipped as **generated skills +
a command** that the existing Claude Code runtime fans out. The repo already has per-dimension
reviewers (`pr-review-backend/frontend`) and orchestrators that dispatch into fresh subagents, so
this is the natural next step. No execution engine needed.

**Depth:** Medium — new skill templates + an orchestrator command + synthesis step.

## Files

- **New** `templates/skills/pr-critic-*/SKILL.md` — one per lens (security, perf, DX,
  simplicity, maintainability), each prompted to *refute/criticize*.
- **Edit** `templates/commands/pr-review.md` (the `/as-pr-review` orchestrator) — fan out to the
  critic panel, then a synthesis pass that scores and consolidates.
- **Edit** `src/scaffold/skills.ts` / `commands.ts` — register the new templates.
- **Edit** `src/adapt/llm-skills.ts` `GENERATED_SKILLS` — include critics so they're grounded
  per project (ties to C1/P1).

## Approach

1. Author each critic as a single-lens adversarial reviewer (per the scorecard's
   "perspective-diverse verify": distinct lenses, not N identical reviewers).
2. The orchestrator command dispatches all critics on a diff in parallel subagents, collects
   findings, then a synthesis subagent dedups + ranks + flags consensus (≥k lenses agree).
3. Findings surface as blockers vs suggestions (reuse the existing review skill's severity model).
4. Critics are LLM-grounded per project via the C1 generation path so the lenses speak the real
   stack.

## Decisions

- **Generated artifacts, host runs them.** Claude Code's Task fan-out is the runtime; agent-smith
  emits the skills/command. This keeps A5 in-scope today.
- **Diverse lenses, not redundancy.** Each critic has a distinct failure mode to catch.
- **Synthesis, not raw dump.** Consensus scoring prevents one critic's noise from blocking merges.

## Verification (must be able to fail)

- Test: scaffolding produces each critic SKILL.md with valid frontmatter and a distinct lens.
- Test: the `/as-pr-review` template references the critic panel + a synthesis step.
- Manual: run the panel on a sample diff; confirm distinct findings + a consolidated verdict.

## Effort

~1 day. Risk: low. Depends on: C1 (P1) for grounding; otherwise independent.
