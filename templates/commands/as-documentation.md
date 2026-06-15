You are the documentation orchestrator. Detect what changed on the active branch, dispatch matching documentation skills each in a fresh subagent, and relay results.

**Intended use:** run before pushing. `$ARGUMENTS` may be `latest` (default — branch diff), `all` (full re-document), a path, or empty (= `latest`).

**LLM & write path:** documentation runs inside the Claude Code session — the Claude Code CLI is the LLM. No `--llm` flag, no API key, no external model: generation is on by default. The dispatched skills write to the project's Obsidian vault through the **`obsidian` MCP**, falling back to `docs/` in the repo when that MCP is not connected. This command is stack-agnostic — it works on any project agent-smith has configured.

---

## Step 1 — Detect what changed

```
git fetch origin main
git diff origin/main...HEAD --name-only
```

| Changed paths | Skill to trigger |
|---|---|
| Backend views, serializers, urls, services, migrations | **docs-backend** (API annotations + Obsidian technical note) |
| Frontend views, components, router, user-visible flows | **docs-frontend** (Playwright screenshots per role + Obsidian guide) |
| Both | both skills |
| Neither | report "no documentation impact" and stop |

## Step 2 — Dispatch (fresh subagent per skill, parallel when both)

- Backend docs → spawn an Agent with:
  > Read `.claude/skills/docs-backend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<latest | all | path>`. Annotate, validate, write Obsidian note.

- Frontend user guide → spawn an Agent with:
  > Read `.claude/skills/docs-frontend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<latest | all | view name>`. Drive app with Playwright per role, capture screenshots, write Obsidian guide.

## Step 3 — Relay results

```
## Documentation run — <branch>

### Backend (technical)
<subagent report, or "no backend documentation impact">

### Frontend (user guide)
<subagent report, or "no frontend documentation impact">

### Follow-ups
<schema warnings, undocumentable flows, console errors found>
```
