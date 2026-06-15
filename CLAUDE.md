<!-- gitnexus:start -->
# GitNexus MCP

This project is indexed by GitNexus as **agent-smith** (366 symbols, 375 relationships, 0 execution flows).

## Always Start Here

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

# Project Documentation (Obsidian vault)

Full, code-grounded documentation for this project lives in the Obsidian vault at
**`vault/agent-smith/`** (served by the `obsidian` MCP; vault contents are gitignored and
private per-developer). Start at **`vault/agent-smith/index.md`** — it is the Map of Content
that links every note.

| Topic | Note |
|---|---|
| Overview, 4-step model, prerequisites, version map | `vault/agent-smith/00-overview.md` |
| Source-tree map, layers, data flow, graph stats | `vault/agent-smith/01-architecture.md` |
| Every CLI command + flag (`init`/`analyze`/`configure`/`doctor`/`ticket`/`pipeline`) | `vault/agent-smith/02-cli-commands.md` |
| Stack detection (frameworks, packages, patterns, LLM refinement) | `vault/agent-smith/03-detection.md` |
| Generation & install (interview, arch docs, LLM skills, scaffolding) | `vault/agent-smith/04-generation-and-install.md` |
| **All hooks & Claude Code events** (SessionStart, PreToolUse, PostToolUse, Stop) | `vault/agent-smith/05-hooks-and-events.md` |
| MCP servers (scope, transport, role) | `vault/agent-smith/06-mcp-servers.md` |
| Generated `/as-*` commands & worker skills, template variables | `vault/agent-smith/07-skills-and-commands.md` |
| Sentrux quality gate (baseline, rules, ratchet) | `vault/agent-smith/08-sentrux-quality-gate.md` |
| Autonomous pipeline (PLAN→…→PR) | `vault/agent-smith/09-pipeline.md` |
| CI, release, SonarCloud, plugin | `vault/agent-smith/10-ci-release-deploy.md` |

## Upkeep rule — keep these docs in sync (mandatory)

This documentation is a living artifact. **Whenever you change the codebase, update the matching
note in the same change.** Map the touched area to its note:

- `src/cli/*` → `02-cli-commands.md` (and `09-pipeline.md` for `ticket`/`pipeline`)
- `src/analyze/*` → `03-detection.md`
- `src/adapt/*`, `src/scaffold/*`, `src/install/*` → `04-generation-and-install.md`
- `hooks/*`, `src/scaffold/hooks.ts` → `05-hooks-and-events.md`
- `src/install/registry.ts`, `mcp/*` → `06-mcp-servers.md`
- `templates/**` → `07-skills-and-commands.md`
- `.sentrux/*`, `src/pipeline/*` → `08-sentrux-quality-gate.md` / `09-pipeline.md`
- `.github/workflows/*`, `sonar-project.properties`, `.claude-plugin/*` → `10-ci-release-deploy.md`
- new modules / structural moves → `01-architecture.md` (source-tree map) and `index.md`

Also: bump each note's `updated:` frontmatter date, keep `[[wikilinks]]` valid, and refresh the
**version map** in `00-overview.md` if any manifest version changes. When in doubt, run
`/as-documentation` to regenerate the affected notes. Do **not** let code and docs drift.