# A7 — Hierarchical planning tiers

**Goal:** Formalize strategic → tactical → atomic planning tiers. smith-mode already mandates a
flat "stage map"; this refines it into explicit tiers for large features/migrations. Expressible
in the smith-mode skill + the generated worker skills — no execution engine needed.

**Depth:** Short — a skill-content refinement, not new infrastructure.

## Files

- **Edit** `.claude/skills/smith-mode/SKILL.md` (and `templates/skills/smith-mode/SKILL.md` so it
  ships into initialized projects).
- Optionally **edit** the `/ship` / `/pipeline` worker prompts to reference the tiers.

## Approach

1. Extend smith-mode's stage-map doctrine with three tiers:
   - **Strategic** — the goal + the few high-level moves (what success looks like).
   - **Tactical** — per-move stage maps (the current smith-mode stage list).
   - **Atomic** — the executable steps within a stage (files, commands, verifications).
2. Guidance on when tiers are warranted (multi-file/multi-session/migration) vs when a flat stage
   map suffices (small tasks) — avoid over-planning trivial work.
3. Keep it as prompt guidance the model follows; no code.

## Decisions

- **Refine the existing doctrine, don't add a planner module.** smith-mode is the right home; the
  runtime (Claude Code) already executes staged plans.
- **Tier only when scale warrants** — explicit anti-over-engineering note.

## Verification (must be able to fail)

- Review check: smith-mode SKILL.md documents the three tiers + the "when to tier" guard; the
  template copy matches.
- Dogfood: apply the tiers to one real multi-file task and confirm the plan reads cleanly at each
  level.

## Effort

~2 hrs. Risk: low. Depends on: none.
