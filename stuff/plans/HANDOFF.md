# HANDOFF — agent-smith session (TDD engine + skill-gen MCP grounding)

> Written at high context. Read this first. Repo: `/Users/gunesbizim/Desktop/projects/agent-smith`.
> `agent-smith` is npm-linked globally → `/opt/homebrew/bin/agent-smith` runs THIS repo's `dist/`
> (rebuild with `npm run build` after source changes; self-reports `0.9.1` but is ahead of the tag).

## Goal of the session
Convert agent-smith into a TDD-first runtime engine on top of the Claude CLI; then a series of
follow-ups: fix/extend LLM skill generation, and (this instruction) add a "handoff at high context →
fresh agents" capability AND make it a reusable agent-smith feature.

## Current branch / PR state
- `main`: has the engine (#58), dependabot fixes, sonar-dependabot guard (#59). Earlier PRs #55/56/58/59/60 MERGED.
- **PR #61** `fix/skill-gen-timeout` (OPEN, currently checked out): skill-gen improvements:
  1. Configurable timeout (`AGENT_SMITH_SKILLS_TIMEOUT_MS`, default 20min) — root cause was a 600s cap; real gen took ~19.4min.
  2. MCP-first grounding: `buildGroundingMcp()` (src/adapt/llm-skills.ts) merges **code-intel/doc** MCP servers from BOTH `.mcp.json` AND `.claude/settings.json` (agent-smith writes gitnexus/serena/git-memory into settings.json, browser into .mcp.json — see mcp-installer.ts:255-261), boots them via a temp strict `--mcp-config` for the gen spawn; prompt updated to prefer them.
  3. Dashboard tool/MCP visibility: after gen, `skillgen-telemetry.ts` parses the run transcript (via session id from `--output-format json`) and writes a synthetic `.agent-smith/runs/` run with per-agent tool counts incl. `mcp__*`; dashboard renders tool chips + an MCP badge.
  4. `treeFingerprint` now hashes the stash commit's TREE (timestamp-free) — was a real bug: commit-sha fingerprint embeds a timestamp → TDD gate would deny every commit after an engine run.
  - HEAD: `24661e6`. Local: 788 tests pass, typecheck clean, `sentrux gate .` ✓ no degradation.
  - **TODO: confirm Sonar green on #61, then squash-merge + delete branch** (repo uses squash; auto-merge disabled). Prior Sonar failures on #61 were: new_coverage (fixed via tests) and new_reliability_rating from `subs.sort()` S2871 (fixed via localeCompare).

## Key architecture facts (verified)
- Engine: `src/engine/` (tdd-engine conductor; event-sourced `.agent-smith/runs/<id>/events.jsonl`; phases understand→red→plan→code→review→pr; opus plans, sonnet codes; one `claude -p` per subtask).
- `runClaude`/`runClaudeDetailed` in `src/analyze/claude-runner.ts` is the only headless-claude seam (`--model`, `--output-format json` → sessionId/usage).
- Hooks: `hooks/*.js` scaffolded by `src/scaffold/hooks.ts buildHookConfig`. New ones added this session: `pre-tool-tdd-gate.js` (deterministic, before sentrux gate, fail-open w/o active run), `post-tool-agent-telemetry.js` (PostToolUse `Agent` → interactive run log).
- Dashboard: `src/dashboard/*` + `templates/dashboard/index.html`; `agent-smith dashboard` (zero-dep node:http + SSE), EventSource seam for future Azure API.
- MCP registry: `src/install/registry.ts`. Code-intel = gitnexus/git-memory/serena (project scope), but `configureMCPs` only copies browser servers into `.mcp.json`; everything else goes to `.claude/settings.json` mcpServers.

## Verification commands
`npm run build && npx tsc --noEmit && npx vitest run && sentrux gate .`
Dashboard smoke: `agent-smith dashboard --dir <proj>` → http://127.0.0.1:4575.

## Remaining work (discrete subtasks for fresh agents)
1. **Merge PR #61** once Sonar is green (`gh pr checks 61`; gate API: `curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=gunesbizim_agent-smith&pullRequest=61"`). Squash + delete branch.
2. **NEW FEATURE: agent-smith "handoff" capability** (this instruction). Build a reusable feature so that, at high context, agent-smith produces a structured HANDOFF.md and delegates remaining subtasks to fresh-context agents. Deliverables:
   - `templates/skills/handoff/SKILL.md` — instructs: write HANDOFF.md (Goal, State, Branches/PRs, Done, In-progress, Next-steps-as-discrete-subtasks, Verification, Risks), then spawn one fresh subagent per remaining subtask with the handoff as context; trigger when context is high or on request.
   - `templates/commands/as-handoff.md` — `/as-handoff` invokes it.
   - Register in `src/scaffold/skills.ts` (SKILL_TEMPLATES) + `src/scaffold/commands.ts` (COMMAND_TEMPLATES) + the CLAUDE.md managed block writer.
   - Optional deterministic safety net: `hooks/pre-compact-handoff.js` on the `PreCompact` event that snapshots a handoff before compaction; register in `buildHookConfig`.
   - Tests: scaffold includes the new skill+command; hook registered (extend `src/__tests__/scaffold/*`). Docs: `vault/agent-smith/07-skills-and-commands.md` (+ 05 if hook) + CLAUDE.md.
   - Branch `feat/handoff`, conventional commits, keep `sentrux gate .` green, open PR.
3. **gridwars enablement (optional, user-driven):** with #61's build, `AGENT_SMITH_SKILLS_TIMEOUT_MS=2400000 agent-smith init --regen-skills` in gridwars → grounding now loads gitnexus/serena from settings.json; `agent-smith dashboard --dir gridwars` shows the skill-gen run with MCP tool counts.

## Conventions / guardrails
- Conventional Commits; NO Co-Authored-By / Generated-with trailers. Branch off main; never commit pre-existing unrelated changes (CLAUDE.md, AGENTS.md, other stuff/* are NOT ours).
- `rm -rf` is blocked by the permission guard — use node fs for authorized deletes.
- Every PR: `sentrux gate .` must not degrade (ratchets up). Vault notes are gitignored/private — update per the upkeep rule but they won't commit.
