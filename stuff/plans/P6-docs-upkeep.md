# P6 — Vault docs upkeep

**Goal:** Keep the Obsidian vault docs in sync with the new behavior, as mandated by the
CLAUDE.md upkeep rule (code change → matching note in the same change). Runs last, after P1–P5.

**Depth:** Short — targeted edits to the notes the touched code maps to.

## Files / mapping (per CLAUDE.md upkeep table)

- `vault/agent-smith/04-generation-and-install.md` — the headline change:
  - `init` now auto-invokes headless Claude at the **end** of the run (not mid-run) to author
    skills, with the project's MCP servers enabled.
  - First-run marker (`.claude/.agent-smith/skills-generated.json`) + `--regen-skills`.
  - Generator prompt is now externalized to `templates/prompts/` (C1).
  - The end-of-run skills report.
- `vault/agent-smith/05-hooks-and-events.md` —
  - Note that generation is **inline in init**, not a SessionStart hook (record the decision so
    future readers don't expect a hook).
  - Note hooks are **suppressed** in the spawned generation process (MCP on, hooks off).
- `vault/agent-smith/02-cli-commands.md` — document the new `init --regen-skills` flag.
- `vault/agent-smith/07-skills-and-commands.md` — mention `templates/prompts/` as a new template
  surface and how the example stub drives "decorate, don't replace".
- `vault/agent-smith/00-overview.md` — bump version map if any manifest version changes during impl.

## Approach

1. Edit each note above; bump its `updated:` frontmatter date.
2. Keep `[[wikilinks]]` valid; add links between the generation note and the hooks note.
3. If the touched surface is large, prefer running `/as-documentation` to regenerate the two
   primary notes (04, 05) rather than hand-editing.

## Verification (must be able to fail)

- Grep the four notes for the old claim that skills are generated "during init Step 8b" /
  "before MCP install" → must be **zero hits** after the edit.
- `updated:` dates advanced on every touched note.
- No dangling `[[wikilink]]` (link target file exists).

## Effort

~1 hr. Risk: low. Do not let code and docs drift — this plan ships in the same change set as
P1–P5, not afterward.
