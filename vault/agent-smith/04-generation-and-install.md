---
title: Generation & Install
type: doc
tags: [agent-smith, generation, scaffold, install, llm]
updated: 2026-06-29
---

# Generation & Install (the `adapt` / `scaffold` / `install` layers)

Back to [[index]].

## Dependency check

`src/install/dependency-checker.ts → checkDependencies()` (platform-aware). Required: Node ≥20,
npm, git. Advisory: Python (mempalace), pipx, gh (PR creation). Returns
`{ ok, versions, missing[], checks }`. Used by [[02-cli-commands#init|init]],
[[02-cli-commands#configure|configure]], and [[02-cli-commands#doctor|doctor]].

## Project interview

`src/adapt/project-interview.ts → runInterview()` (skipped by `--auto`/`--no-interview`). Asks
~11 questions, each with a smart default derived from the detected project; `?` triggers a Claude
elaboration, `skip` leaves blank, Enter accepts the default.

| id | Question |
|---|---|
| branchNaming | Branch naming convention |
| commitFormat | Commit message format (Conventional Commits) |
| ticketPrefix | Ticket prefix (PROJ-, JIRA-, …) |
| prChecklist (multi) | PR review requirements |
| testingRequirements (multi) | Testing requirements |
| architectureRules (multi) | Architecture rules that are PR blockers |
| securityRequirements (multi) | Security requirements |
| codeStyle (multi) | Code style requirements |
| customNotes | Free-text team conventions |
| allowCycles | Allow dependency cycles? (no = enforce 0; yes = ratchet) |
| maxCC | Max cyclomatic complexity per function |

`writeDecisionsDoc()` persists answers to **`docs/architecture/decisions.md`**;
`applyInterviewAnswers()` folds them back into `TemplateVariables` (and sets
`SENTRUX_MAX_CYCLES`/`SENTRUX_MAX_CC` — see [[08-sentrux-quality-gate]]).

## Architecture docs

`src/adapt/architecture-writer.ts`:

- **`writeArchitectureDocs()`** → `docs/architecture/backend-architecture.md`,
  `frontend-architecture.md`, `mcp-tools.md`, **`best-practices.md`**. Backend/frontend docs
  start as stack-aware templates (`generateBackendArchitecture` / `generateFrontendArchitecture`)
  and, when LLM is on (`opts.useLlm && !dryRun && claude present`), are replaced by LLM-grounded
  docs via `generateArchitectureDoc()`. `mcp-tools.md` is a static, binding reference listing
  concrete playwright and chrome-devtools usage patterns, an execution-structure section
  (command → main skill → sub-skill → MCP tool), and the available MCP tools
  (gitnexus, git-memory, playwright, chrome-devtools, sentrux, obsidian).
- **`generateBestPracticesDoc()`** → `docs/architecture/best-practices.md` — a curated
  engineering-standards baseline in two buckets: **Followed** (standards the code already upholds,
  enforced by reviewers) and **Recommended** (good practices to adopt — suggestions, never
  blockers), covering cross-cutting, backend, frontend, testing, PR review, and documentation.
  This template is the deterministic fallback; the LLM skill generator refreshes the **Followed**
  bucket from the real repo (see below).
- **`writeSentruxRules()`** → `.sentrux/rules.toml` (see [[08-sentrux-quality-gate]]).

`src/adapt/llm-architecture.ts → generateArchitectureDoc(side, root, project, templateRef)`:
builds a prompt instructing Claude to author the doc for *this* repo, calls
`runClaude(prompt, { cwd: root, allowedTools: ["Read","Glob","Grep"], timeoutMs: 180_000 })`,
strips any markdown fence, and sanity-checks (`# ` heading, ≥200 chars). Failure → template
fallback.

## LLM-authored skills

`src/adapt/llm-skills.ts → generateSkills(projectRoot, opts)` rewrites the six worker skills
(`GENERATED_SKILLS` = pr-review-backend/frontend, test-backend/frontend, docs-backend/frontend)
grounded in real code.

> **Runs LAST, inline in `init` — not mid-run, not a hook (P3).** Generation is the FINAL init
> step, after MCP install/config + hooks + CLAUDE.md, so the spawned `claude` boots the project's
> own MCP servers (`useProjectMcp` → `--mcp-config <project>/.mcp.json`, P2) and runs with project
> hooks suppressed (`suppressHooks` → `--settings '{"hooks":{}}'`) so PreToolUse gates don't block
> its `Write` calls. It is gated to run **once per repo** via a marker
> (`.claude/.agent-smith/skills-generated.json`, `src/adapt/skill-gen-marker.ts`); `--regen-skills`
> bypasses the gate. Best-effort: absent/failed `claude` keeps the template-customized skills and
> never blocks init. (No recursion: init calls `claude` directly; the spawn does not run init.)

> **Externalized prompt (P1/C1):** the master prompt is no longer a hardcoded string —
> `loadSkillGeneratorPrompt()` reads `templates/prompts/skill-generator.md` (+ inlines
> `skill-stub-example.md`) from the **package** root and interpolates `{{SKILL_LIST}}` /
> `{{STUB_EXAMPLE}}`. `AGENT_SMITH_PROMPTS_DIR` overrides the dir; a missing template throws
> `SkillPromptError` → `ran:false`. `buildMasterSkillPrompt()` remains a thin alias.

> **Configurable timeout (#61).** Skill authoring fans out one subagent per skill to ground each in
> the repo; on a large monorepo this measured ~19.4 min, and the old hardcoded 600s cap SIGTERM'd
> the run and surfaced as the misleading "claude unavailable" fallback. The cap now defaults to
> **20 min** (`DEFAULT_SKILLS_TIMEOUT_MS = 1_200_000` ms) and is overridable via the
> **`AGENT_SMITH_SKILLS_TIMEOUT_MS`** env var (milliseconds; only a finite positive number is
> honoured, else the default). Resolved by `skillsTimeoutMs()`. Generation also switched from
> `runClaude` to **`runClaudeDetailed`** so a real timeout (`res.status === "timeout"`) is reported
> honestly with an actionable reason ("…timed out after Ns — raise `AGENT_SMITH_SKILLS_TIMEOUT_MS`
> (ms) for large repos, then re-run with `--regen-skills`") instead of being conflated with claude
> actually being unavailable.

> **MCP-first grounding (#61).** Skill generation now PREFERS code-intelligence / documentation MCP
> tools over raw file reads when gathering understanding. `buildGroundingMcp(projectRoot)` merges
> `mcpServers` from **both** `.mcp.json` **and** `.claude/settings.json` — current agent-smith writes
> all servers into `.mcp.json` (and strips `mcpServers` from `settings.json`), so `.mcp.json` is
> normally the only source; the `settings.json` read is kept for **backward compatibility** with
> pre-consolidation repos — and keeps only servers whose
> registry `category` is in `GROUNDING_MCP_CATEGORIES = { "code-intelligence", "documentation" }`.
> Browser / quality / pm / memory servers are deliberately excluded so generation can't, e.g.,
> launch a browser to author a skill. It returns the servers to boot plus a matching `mcp__<server>`
> allowlist. `runSkillGenClaude()` (only when `opts.useProjectMcp`) writes those servers to a temp
> strict `--mcp-config` (created under `os.tmpdir()` as `as-skillgen-mcp-*`, removed in a `finally`),
> and the allowed-tools list becomes `["Read","Glob","Grep","Write","Task", ...mcp__<server>]`. When
> no grounding server is configured, generation runs on file tools only. The prompt
> (`templates/prompts/skill-generator.md`) states an explicit grounding priority —
> **1. gitnexus** (architecture / call graphs / impact), **2. git-memory** (why code changed),
> **3. documentation MCP** (obsidian / context7) — with `Read`/`Glob`/`Grep` as the fallback only
> when no MCP tool can answer or none are configured.

> **Generation telemetry (#61) — `src/adapt/skillgen-telemetry.ts`.** Because generation runs
> headless with hooks suppressed, the normal agent-call telemetry hook can't capture it, so the tool
> usage is reconstructed after the run. `runClaudeDetailed` is invoked with `outputFormat: "json"`,
> whose envelope yields the CLI **`sessionId`** (plumbed through `ClaudeRunResult.sessionId` in
> `src/analyze/claude-runner.ts`, parsed from `session_id` in `parseJsonEnvelope`). On a successful
> run `recordSkillGenUsage()` calls `collectSkillGenUsage(sessionId)`, which globs the transcripts
> under `~/.claude/projects` — the parent (`*/<sessionId>.jsonl`) plus each subagent
> (`*/<sessionId>/subagents/*.jsonl`) — and `parseTranscriptTools()` tallies every `tool_use` block
> per transcript (capturing the `model`), keyed by tool name so `mcp__*` calls are counted distinctly.
> The parent is labelled `orchestrator`; each subagent is labelled by its transcript basename.
> `writeSkillGenRun()` then emits a **synthetic engine run** under **`.agent-smith/runs/`** (run id
> `skillgen-<sessionId first 8 chars>`, `engineVersion: "skill-gen"`) by appending events via
> `appendEvent` — `run_started` → `phase_started` (`generate`) → one `agent_call_finished` per call
> (carrying that call's `model` and `tools` map) → `phase_finished` → `run_finished` — so the
> dashboard can show which tools, and which MCP tools, the generation used. The whole telemetry path
> is strictly best-effort: any missing transcript returns `null` (no run written) and errors are
> swallowed; telemetry never throws and never blocks generation.

> **Skills report (P4):** the run ends with a sentinel-fenced JSON block
> (`<<<AGENT_SMITH_SKILLS_REPORT … >>>`). `parseSkillsReport()` extracts it (null on
> missing/malformed → falls back to the summary line); `crossCheckReport()` downgrades any skill
> the model *claimed* it rewrote whose file is missing or still contains `{{`. `init` renders it
> via `src/cli/skills-report.ts → renderSkillsReport()`.

The prompt phases:

- `loadSkillGeneratorPrompt()` (was `buildMasterSkillPrompt()`) — phases: **understand** (read the architecture docs +
  `best-practices.md` + `decisions.md`, explore the source, and identify the best practices the
  project *already follows*), **refresh** the best-practices doc (Phase 1.5 — confirm the
  **Followed** bucket from real code; tailor **Recommended** to the stack using the latest
  documentation available), **fan out** one subagent per skill, **verify** (frontmatter, resolved
  placeholders, real commands, a "Recommended best practices" section in each, and RED-first TDD
  mandate present in each implementation and test skill).
- Each generated skill therefore **codifies the project's existing standards as enforced rules**
  and **surfaces 2–5 recommended improvements** as clearly-labelled suggestions (never blockers).
- **TDD is injected into every implementation and test skill** — the generator prompt includes a
  mandatory RED-first section: write the failing test first, prove it red, then write the code.
  This ensures TDD discipline survives both the template path and the LLM generation path (the
  `best-practices.md` also carries the RED-first rule, so generated skills can't skip it).
- `runClaudeDetailed(prompt, { cwd: root, allowedTools: ["Read","Glob","Grep","Write","Task", ...grounding], timeoutMs: skillsTimeoutMs(), outputFormat: "json" })` — see the configurable-timeout, MCP-first grounding, and telemetry callouts above.
- Guard: all six stubs must exist and **at least one** architecture doc (backend **or** frontend)
  must exist (P5 — frontend-only/CLI projects generate too); otherwise returns
  `{ ran: false, reason }`. Falls back to the template-customized skills.
- The generator prompt also instructs each generated skill to **reference the smith-mode
  execution-discipline skill** (`.claude/skills/smith-mode/SKILL.md`) — a short pointer noting
  that for work spanning multiple files/sources/sessions the staged loop applies (stage map →
  delegate → failable verification → self-critique). Skills point to smith-mode rather than
  duplicating its content (the skill itself is scaffolded — see below).

## Template engine & customization

- `src/shared/templates.ts` — `DEFAULT_TEMPLATE_VARS` (the ~70-key defaults, Django+Vue shaped)
  and `resolveTemplate(content, vars)` which replaces `{{VAR}}` with the var, then the default,
  then leaves unknown placeholders intact.
- `src/adapt/template-engine.ts` — `resolveAll`, `extractPlaceholders`, `validateTemplates`.
- `src/adapt/skill-customizer.ts → customizeSkills()` — applies variable substitution **and**
  `applyFrameworkCustomizations()` which **strips framework-specific sections** that don't apply:
  `## Django / DRF patterns` (non-Django), `<script setup>` blocks (non-Vue), `## Vuetify`
  (non-Vuetify), and rewrites `python manage.py`/`drf-spectacular`/`.vue`/`Vuetify 3` tokens.
  This is why the docs/test/review skills work on any stack — see [[07-skills-and-commands]].
  > **Substitution is last (B8):** `applyFrameworkCustomizations()` runs **first** (it may
  > re-inject `{{VAR}}` placeholders, e.g. `python manage.py` → `# {{BACKEND_MIGRATE_CMD}}`),
  > then `substituteToFixpoint()` resolves `{{VAR}}` to a fixpoint as the authoritative final
  > pass. Any residual `{{...}}` after that is a genuinely unknown variable and is reported via
  > `console.warn` rather than shipped silently — an ordering hazard that can no longer slip out.

## Caveman compression

`src/adapt/caveman-compress.ts → cavemanCompress(content)` (only with `init --caveman`):
preserves code blocks/inline code, drops articles and filler, shortens ~28 stock phrases,
collapses whitespace. ~75% token reduction while keeping technical substance. Applied across
`.claude/skills/` and `docs/architecture/`.

## Scaffolding (file emission)

- `src/scaffold/commands.ts → scaffoldCommands()` — writes the `.claude/commands/as-*.md` set:
  **backend, frontend, test, pr-review, documentation, ship, caveman, insights**, and **`as-handoff`**
  (added in #62). **`as-git` was removed**; the plain commit/push workflow is now folded into
  `/as-ship`. Loading templates from the npm package (fallback: the repo's own `templates/`). See
  [[07-skills-and-commands]].
- `src/scaffold/skills.ts → scaffoldSkills()` — writes the worker skills (templated) plus
  helper stubs copied verbatim: `gitnexus/*` (6), `git-memory/*` (4), the **smith-mode**
  execution-discipline skill (`templates/skills/smith-mode/` → `.claude/skills/smith-mode/`,
  copied verbatim, no template vars), the `smoke-test` skill (A8), and — added in #62 — the
  **handoff** skill (`templates/skills/handoff/SKILL.md`), which at high context writes a structured
  `HANDOFF.md` and delegates each remaining subtask to a fresh-context subagent. smith-mode ships to
  every project so staged execution discipline is always available and the SessionStart hook can
  surface it; the LLM-authored worker skills point to it (see above). See [[07-skills-and-commands]].
- `src/scaffold/configs.ts → scaffoldConfigs()` — platform extras (Cursor `.cursor/mcp.json`,
  Continue `~/.continue/`); Claude Code config is written by the MCP installer.
- `src/scaffold/hooks.ts → scaffoldHooks()` — copies hook scripts and merges the hook config
  (`buildHookConfig`) into `settings.json`. In addition to the existing events, it now registers
  (added in #62) a **PreCompact** hook (`pre-compact-handoff.js` — snapshots branch/commits/status/
  open-PR before compaction, strictly fail-open, never blocks compaction; the deterministic safety
  net behind the on-demand `/as-handoff` skill) and (added in #63) a **UserPromptSubmit** hook
  (`user-prompt-handoff-nudge.js` — at ~60% context, a one-time, fail-open suggestion to run
  `/as-handoff`). See [[05-hooks-and-events]].

## MCP indexing (Step 11b)

`src/install/mcp-indexer.ts → runMcpIndexing(projectRoot, servers)` — new module that runs each
installed MCP server's **index command** in the project root immediately after MCP servers are
configured and BEFORE `writeClaudeMd` (Step 12). This means the MCP tools are populated in the
very first Claude Code session — no manual "index now" step needed.

Execution is **best-effort**: if the binary is absent (not yet on PATH after install, or the
server was skipped) the index step is silently skipped for that server. A failed index never
blocks `init`.

Servers that carry an `indexCommand` (via the new `indexCommand` field on `MCPServerDefinition`
in `src/shared/types.ts`):

| Server | `indexCommand` |
|---|---|
| **gitnexus** | `gitnexus analyze` |
| **git-memory** | `git-memory index --repo-path .` |

The `indexCommand` field is optional on `MCPServerDefinition`; servers without it are silently
skipped by `runMcpIndexing`. The step is wired in `src/cli/init-steps/install-step.ts` as
Step 11b (after MCP install/configure, before CLAUDE.md write).

## AGENTS.md cleanup

`src/install/agents-md-cleanup.ts → removeGitnexusAgentsMd(targetDir)` — called as a step in
`src/cli/init-steps/install-step.ts` immediately after `CLAUDE.md` is written. It deletes an
`AGENTS.md` at the project root **only** when that file was generated by gitnexus (detected by
the sentinel markers `<!-- gitnexus:start -->` / `<!-- gitnexus:end -->`). A hand-written
`AGENTS.md` (no gitnexus markers) is **preserved verbatim**.

Because `gitnexus analyze` now runs at Step 11b (see [[#MCP indexing (Step 11b)]] above), it
creates a fresh `AGENTS.md` as part of building the index. The cleanup step therefore reliably
finds and removes that file — "index the repo, then clear the redundant `AGENTS.md` whose
pointers are superseded by the agent-smith `CLAUDE.md` managed block." This prevents the
gitnexus-authored `AGENTS.md` from conflicting with the managed block, which covers the same
capability surface (commands, skills, MCP tools).

> **`AGENTIC_STACK.md` was deleted** from this repo as part of the same cleanup. It was a
> repository-level doc that referenced serena and an old gitnexus-authored capability surface; no
> source code referenced it, so it was removed without replacement.

## Permission policy (A9)

`src/scaffold/permissions.ts` generates an enforceable per-project shell-command policy. Enforcement
is the runtime's (Claude Code honors `settings.permissions` and runs the PreToolUse guard); agent-smith
only emits the artifacts.

- **`defaultPolicy(project)`** — a `RolePolicy` of `{ shell: { allowed, denied }, allowlistMode:false }`.
  `denied` is the `ALWAYS_DENIED` list (dangerous ops blocked on every stack: `rm -rf`, `rm -fr`,
  `git push --force`/`-f`, `git reset --hard`, the fork bomb `:(){ :|:& };:`, `chmod -R 777`,
  `curl | sh`/`| bash`, `dd if=`, `mkfs`); `allowed` is a stack-aware seed (`go test ./...`,
  `cargo test`, `pytest`, `npm test`, `mvn test`, … by detected language).
- **`scaffoldPermissions(root, project)`** writes **two** artifacts: the policy file
  `.claude/agent-smith/permissions.json` (read by the deny hook — see
  [[05-hooks-and-events#pre-tool-permission-guard.js (deterministic deny guard)]]) **and** a merged
  `permissions` block in `.claude/settings.json` (deduped against any existing allow/deny entries,
  non-destructive to the rest of the file).
- **`renderPermissionsBlock(policy)`** turns each rule into a Claude Code settings pattern:
  deny → `Bash(<rule>:*)`, and (only in `allowlistMode`) allow → `Bash(<rule>)`.
  > **Parentheses constraint.** Claude Code's `Bash(<pattern>)` syntax can't represent a rule that
  > contains `(` — the parser reads the inner paren as an empty-argument pattern and **rejects the
  > whole rule** (the fork bomb `:(){ :|:& };:` rendered as `Bash(:(){ :|:& };::*)` is the canonical
  > failure: `/doctor` flags it "Empty parentheses … skipped"). So `renderPermissionsBlock` **filters
  > out any rule containing `(`** before wrapping it. Such rules are **not lost** — they stay fully
  > enforced by the PreToolUse guard, which substring-matches the same rules from `permissions.json`.
  > Net: the fork bomb lives in `permissions.json` (hook-enforced) but never appears as a settings
  > deny rule.
- **`evaluateCommand(command, policy)`** — the pure decision shared by the hook and tests: substring
  `includes` match against `denied` → `deny`; in `allowlistMode`, a command that doesn't `startsWith`
  an allowed entry → `deny`; otherwise `allow`.

`init` calls `scaffoldPermissions` so the policy file and the settings deny rules ship together.
Unit + hook-integration tests live in `src/__tests__/scaffold/permissions.test.ts` (they assert the
deny block excludes parenthesized rules **and** that the guard still denies the fork bomb).

## Sentrux install

`src/install/sentrux-installer.ts → installSentrux(cwd, templateVars)` scaffolds the quality
gate into the target project. It writes **both** `.sentrux/rules.toml` (constraints, built from
the `SENTRUX_*` template vars via `buildRulesToml`, mirroring `writeSentruxRules`) **and** a
starter `.sentrux/baseline.json` (the regression-check reference the gate compares against,
built by `buildBaseline` and seeded from the probed cycle count). It is **idempotent and
non-destructive** — if a `.sentrux/` config already exists (rules.toml *or* baseline.json
present) it is left untouched and the call is reported `skipped`; it **never throws** (benign
failures return a skipped result with a `reason`).

`init` Step 8c calls `installSentrux`. This closes a real gap: init previously only called
`writeSentruxRules` (which wrote `rules.toml` but **not** `baseline.json`), so sentrux was never
fully installed — the gate had no baseline to compare against. See [[08-sentrux-quality-gate]].

## Cross-platform install (Windows correctness)

The install path shells out to CLIs that are **`.cmd`/`.exe` shims on Windows**, where POSIX
assumptions silently break. The handled cases:

- **Presence probes** — `commandSucceeds` runs through a shell (`runCommandAsync` uses `shell:true`),
  and the Windows shell is **cmd.exe**, which has no `command -v` builtin. `presenceProbe(cmd,
  platform)` (exported, unit-tested) emits `where <tok>` on `win32` and `command -v <tok>` elsewhere
  for a bare token, and runs anything with arguments verbatim. (Before this, every Windows presence
  check failed, so already-installed servers were never recognized.)
- **Launching shims** — `needsShellForCli(platform)` (in `src/shared/platform-utils.ts`) is `true`
  only on `win32`. The `claude` exec in `src/analyze/claude-runner.ts` (`isClaudeAvailable` +
  `runClaudeDetailed`) and the `gh` install spawn
  in `src/install/gh-installer.ts` both pass `shell: needsShellForCli()` — so on Windows they route
  through cmd.exe (which resolves `claude.cmd`/`winget`/`choco` via `PATHEXT`) and on POSIX keep
  `shell:false` (exact argv, no shell quoting of the arbitrary `-p <prompt>`).
- **Sentrux Windows install** (`registry.ts`) — a `powershell -NoProfile -Command "Invoke-WebRequest
  …"` that drops `sentrux.exe` into `%LOCALAPPDATA%\Microsoft\WindowsApps` (on PATH by default). It
  deliberately uses **no inner quotes** (the path has no spaces) to avoid fragile nested
  cmd→PowerShell quoting.
- **Committed config stays bare** — `.mcp.json`/`settings.json` are written with bare commands
  (`npx`, `python`, …), NOT `npx.cmd`/`*.exe`: the file is committed and shared across a mixed-OS
  team, so per-OS resolution is the MCP host's (Claude Code's) job. (`resolveMCPCommand` in
  platform-utils exists but is intentionally **not** wired into config writing for this reason.)

A `test-windows` CI job runs the full suite on `windows-latest` so these paths stay verified — see
[[10-ci-release-deploy#CI — ci.yml]].

## MCP install & configure

`src/install/` — catalog in `registry.ts`, actions in `mcp-installer.ts`:
`installMCPs()` (download/build per platform), `configureMCPs()` (writes **all** server
scopes — project/user/local — into the repo `.mcp.json`, frontend-gated for browser MCPs, and
strips any legacy `mcpServers` block from `.claude/settings.json`), `ensureGitignore()` (adds
`.playwright-mcp/`). The old `registerLocalMCPs()` (`claude mcp add --scope local …`) was
**removed** — obsidian and other local-scope servers go into `.mcp.json` too. Full server table
in [[06-mcp-servers]].

**Install progress UI.** `installMCPs()` runs each server's check + install via an async
`spawn` helper (`runCommandAsync`), not `execSync` — `execSync` blocks Node's event loop and
freezes the progress render mid-frame, making a slow `npm`/`npx`/`pipx` download look hung.
With async spawn the loop stays free, so a **`cli-progress` SingleBar** stays visible for the
whole run: it shows `value/total` plus the server name and the **exact command** currently
running, and a per-second ticker keeps it redrawing during a single slow download. A summary
footer reports installed / pre-warmed / already-present / on-demand / manual / failed counts.
The runner is injectable (`installMCPs(opts, { run, check, showProgress })`) so tests drive it
without spawning real processes. `installType` dispatch: `prewarm` warms the npx cache with a
`--version` command (never launches the server); `npx` with empty `installCommand` is a no-op
(fetched on first use); `manual` is skipped with a hint.

## CLAUDE.md managed block

`src/adapt/claude-md-writer.ts → writeClaudeMd(targetDir, dryRun)` maintains an
agent-smith-managed block inside the target project's `CLAUDE.md`, delimited by
`<!-- agent-smith:start -->` and `<!-- agent-smith:end -->`. The block is built by
`buildManagedBlock()` and now emits the following sections:

1. **`## Slash commands`** table — scanned from `.claude/commands/*.md` (name = filename,
   purpose = first prose line).
2. **`## Skills`** table — scanned recursively from `.claude/skills/**/SKILL.md` (name +
   description from YAML frontmatter, folded `>` descriptions supported).
3. **`## Execution structure`** — a prose description of how a command dispatches: command →
   main skill → sub-skill → MCP tool.
4. **`## Test-driven development (mandatory)`** — a RED-first section requiring a failing test
   per acceptance criterion committed before the production code it covers is written.
5. **`## Available MCP tools`** table — lists the wired MCP servers (gitnexus, git-memory,
   playwright, chrome-devtools, sentrux, obsidian) with their purpose and points to
   `docs/architecture/mcp-tools.md` for concrete usage patterns.

The block also carries a smith-mode pointer (stage map → delegate → failable verification →
self-critique) for any task spanning multiple files, sources, or sessions.

- **Non-destructive** — only the content between the markers is owned by agent-smith; any user
  content outside the markers is preserved verbatim. On re-init the managed block is regenerated
  in place; if no `CLAUDE.md` exists one is created with just the block.
- `init` **Step 12 (the final step)** calls `writeClaudeMd`, running last so it can enumerate
  every command and skill that the earlier scaffold/generation steps just produced.
