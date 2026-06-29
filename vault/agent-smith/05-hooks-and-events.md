---
title: Hooks & Events
type: doc
tags: [agent-smith, hooks, events, claude-code]
updated: 2026-06-29
---

# Hooks & Events

Back to [[index]]. This is the complete reference for every Claude Code **event** Agent Smith
binds and every **hook script** it ships.

Hook scripts live in `hooks/` and are copied into the target project by
`src/scaffold/hooks.ts → scaffoldHooks()`, which also merges the hook config into
`.claude/settings.json` under the `hooks` key. All hook scripts are Node ESM, read the tool
payload from **stdin**, and emit JSON on **stdout** in Claude Code's
`{ hookSpecificOutput: { hookEventName, … } }` contract.

## Event → script map (what `scaffoldHooks` writes)

| Claude Code event | Matcher | Script(s) (in order) | Timeout |
|---|---|---|---|
| **SessionStart** | — | `hooks/session-start-doctor.js`, `hooks/session-start-dashboard.js` | default |
| **SessionEnd** | — | `hooks/session-end-dashboard.js` | default |
| **UserPromptSubmit** | — | `hooks/user-prompt-handoff-nudge.js` | default |
| **PreToolUse** | `Bash` | `pre-tool-permission-guard.js`, `pre-tool-git-guard.js`, `pre-tool-tdd-gate.js`, `pre-tool-sentrux-gate.js` | 5s, 8s, 8s, 15s |
| **PreToolUse** | memory-write regex | inline echo → "Suspending caveman for memory write…" | — |
| **PostToolUse** | `.*` (all tools) | `hooks/post-tool-agent-telemetry.js` | default |
| **PostToolUse** | memory-write regex | inline echo → "Resuming caveman…" | — |
| **PreCompact** | — | `hooks/pre-compact-handoff.js` | default |
| **Stop** | — | `hooks/stop-change-detector.js` | default |

### `pre-tool-permission-guard.js` (deterministic deny guard)

First in the `Bash` chain. Reads the generated policy at `.claude/agent-smith/permissions.json`
(see [[04-generation-and-install#Permission policy (A9)]]) and **hard-DENIES** any Bash command that
**substring-matches** a `denied` rule (`rm -rf`, the fork bomb `:(){ :|:& };:`, …); in `allowlistMode`
it also denies any command that doesn't `startsWith` an allowed entry. Zero-LLM, zero-token, and
**fails open** — a missing/corrupt policy or unreadable stdin emits `{}` (allow) so it can never brick
a session. Pure logic (`evaluateCommand`) is unit-tested; the hook itself has an integration test.

> **Belt-and-braces with `settings.permissions`.** The same rules are *also* written into
> `settings.json` as `Bash(<rule>:*)` deny patterns the runtime enforces directly. The two layers are
> redundant **except** for rules Claude Code's `Bash()` syntax can't express — any rule containing `(`
> is filtered out of settings (the fork bomb `Bash(:(){ :|:& };::*)` is rejected as "Empty
> parentheses" by `/doctor`) and is therefore enforced **only** by this hook. See the parentheses
> constraint in [[04-generation-and-install#Permission policy (A9)]].

### `pre-tool-tdd-gate.js` (deterministic TDD gate)

Runs **before** the sentrux gate in the `Bash` chain. Intercepts `git commit` / `git push` /
`gh pr create` and **hard-DENIES** unless the TDD cycle is closed for the *current* working tree:
the tests the engine proved RED (`red-proof.json`) must be verified green (`green-proof.json`,
stamped with a tree fingerprint) on exactly this tree. It does **not** run the suite itself (would
blow the hook timeout); it checks the engine's green-proof. A failing test is a hard deny, not the
"ask" the sentrux gate uses. **Backward-compat:** when no engine run is active (no
`.agent-smith/runs/current` pointer, or that run has no red-proof), it **allows silently** — plain
`/as-backend` commits are unaffected. Pure helpers (`isGatedCommand`, `decideTddGate`) are unit-tested.

### `post-tool-agent-telemetry.js` (all-tool telemetry)

Matcher `.*` — fires after **every** tool call: Bash, Read, Edit, Write, Glob, Grep, Agent, and
all `mcp__*` tools. The hook branches internally on the tool name:

- **`Agent` tool** → appends an `agent_call_finished` event (model, tokens, duration, prompt
  summary from `tool_response`) — the richer record used for subagent tracking.
- **All other tools** → appends a lightweight `tool_call` event: `tool` (full name), `isMcp`
  (boolean — true when name starts with `mcp__`), `mcpServer` (parsed server segment from
  `mcp__<server>__<tool>`, else null), `status` (`ok`/`error`), and `durationMs` when reported.

Both event types are written to `.agent-smith/runs/interactive-<session>/events.jsonl` in the same
event vocabulary the engine uses, so all tool activity in a plain Claude Code session is visible in
[[02-cli-commands#dashboard|the dashboard]].

**Dashboard aggregation** (`normalize.ts`): `tool_call` events are projected into a
`toolCalls` field on every `RunDTO` — `total` (all tool calls), `mcpCount` (MCP-only),
`byTool` (per tool name), and `byServer` (per MCP server). Existing agent-call aggregation
(`totals.callCount`, phases, token/cost rollups) is unaffected.

**Pure helpers** (exported, unit-tested in `src/__tests__/hooks/agent-telemetry.test.ts`):
`parseMcpServer(name)` → server segment or null; `buildToolCallEvent(payload, runId, now)` →
`tool_call` event body. Telemetry never blocks a tool: best-effort, always exits 0.

> **Skill generation is NOT a hook (P3).** LLM skill authoring runs **inline as the final step
> of `init`**, not via SessionStart — so future readers should not expect a generation hook. The
> spawned `claude` deliberately runs with **MCP on, hooks off**: `generateSkills(..., {
> suppressHooks:true })` passes `--settings '{"hooks":{}}'` so the PreToolUse git-guard /
> sentrux-gate above don't block the model's `Write` calls (and the SessionStart doctor adds no
> noise). See [[04-generation-and-install#LLM-authored skills]].

The memory-write regex matches mempalace / claude-memory tool calls:
`mcp__plugin_mempalace_mempalace__|mempalace_add_drawer|mempalace_diary_write|mempalace_kg_add|claude-memory`.
Its purpose is to **suspend caveman mode** around memory writes so stored memories are full
English (and resume after), per the user's global caveman policy.

---

## SessionStart — `session-start-doctor.js`

Runs at the start of every session and injects a diagnostic `additionalContext` block for the
model. Read-only except for the sentrux baseline save.

It gathers and reports:

- **Git state** — branch, is-repo, uncommitted changes (and the changed-file list), latest commit.
- **Setup** — presence of `.claude/`, `skills/`, `commands/`, `settings.json`,
  `docs/architecture/`; `initialized = hasSkills && hasCommands`.
- **smith-mode** — if `.claude/skills/smith-mode/SKILL.md` exists, surfaces the
  execution-discipline skill (see below).
- **MCP presence** — is each of `gitnexus`, `git-memory`, `sentrux` on PATH.
- **GitNexus index freshness** — runs `gitnexus context`; flags if output contains "stale".
- **Sentrux baseline** — if `sentrux` is installed, runs **`sentrux gate --save .`** to (re)save
  the architectural baseline at session start, then notes "architectural quality gate active".

The injected context nudges: run `init` if not initialized, `configure` if MCPs are missing,
`/git` (or `/ship`) if there are uncommitted changes, `gitnexus analyze` if the index is stale.

### smith-mode `additionalContext`

If the scaffolded **`.claude/skills/smith-mode/SKILL.md`** is present, the doctor emits a
`▸ smith-mode is active` line into the context every session. It directs the model: for any
task spanning multiple files, sources, or sessions — **and for every `/as-*` command and worker
skill** — follow the smith-mode staged loop instead of one-shotting:

1. write a numbered **stage map** first,
2. **delegate** independent stages to subagents where the runtime supports it,
3. **verify** each stage with a check that can actually fail (a test, a fetched source, a diff
   against spec — not "looks right"),
4. run a skeptical **self-review** before delivery.

It explicitly tells the model to skip the loop for trivial single-pass tasks. This is the
session-level surfacing of the vendored smith-mode skill that init scaffolds into every project
(see [[07-skills-and-commands#smith-mode — execution discipline]]).

---

## Dashboard lifecycle — `session-start-dashboard.js` + `session-end-dashboard.js`

The tracking dashboard (see [[02-cli-commands#dashboard|the dashboard]]) is auto-started on
SessionStart and auto-stopped on SessionEnd, refcounted across concurrent sessions. Both hooks are
**best-effort** (they always emit a valid result and never block a session) and share a small state
file:

```
<cwd>/.agent-smith/dashboard.json
{ "pid": 12345, "port": 4575, "autostarted": true,
  "sessions": [ { "id": "<session_id>", "ppid": <claude pid> } ] }
```

**SessionStart (`session-start-dashboard.js`)** probes `127.0.0.1:<port>` (default `4575`). If
nothing is listening it spawns `agent-smith dashboard` **detached + `unref`'d** (so the server
survives the hook), records the spawned pid with `autostarted: true`, and registers this session. If
a server is **already** listening it does not spawn a second; it only refcounts this session onto the
state file *when we own that server* (`autostarted`). A dashboard the user started by hand has no
state file and is therefore never adopted.

**SessionEnd (`session-end-dashboard.js`)** deregisters the ending session and, once no session
remains **and** `autostarted` is true, sends the recorded pid **SIGTERM** (the dashboard handles
SIGTERM with a clean shutdown — see [[02-cli-commands#dashboard]]) and deletes the state file. This
closes the gap where killing the Claude session left the detached dashboard serving forever.

- **Refcount, not last-writer:** with several sessions sharing one dashboard, it is stopped only when
  the *last* one ends — an earlier SessionEnd just drops its own entry.
- **Pure refcount — `ppid` is never the kill signal.** Claude Code runs `type: command` hooks
  through a shell, so the hook's `ppid` is a transient shell that exits the moment the hook returns.
  Treating its death as "session ended" would wrongly kill a dashboard a *live sibling session* is
  still using, so the kill decision (`shouldStopDashboard`) ignores `ppid` entirely. The trade-off:
  a session that **crashes** without firing SessionEnd leaves a stale entry, so its dashboard is not
  auto-stopped — that orphan is reclaimed the next time the port is found free (SessionStart resets
  ownership when it spawns a fresh server). `ppid` is recorded only for debugging.
- **Never kills a hand-started server:** only the `autostarted` flag (set when *this* hook spawned the
  process) authorises a SIGTERM.
- **Opt-out:** `AGENT_SMITH_DASHBOARD_AUTOSTART=0` disables both start and stop. Pure helpers
  (`addSession` / `removeSession` / `shouldStopDashboard`) live in `hooks/lib/dashboard-state.js`
  and are unit-tested.

---

## UserPromptSubmit — `user-prompt-handoff-nudge.js`

Fires on every user prompt (no matcher) and nudges toward a handoff **before** context pressure
degrades output quality. Hooks aren't handed live context usage, but Claude Code does pass them
`transcript_path`, so the hook reads the transcript and estimates current occupancy.

**Flow:**

1. **Estimate context tokens** (`estimateContextTokens`, pure/exported) — parse the transcript
   JSONL and take the **last** assistant message's `usage` block, summing `input_tokens +
   cache_read_input_tokens + cache_creation_input_tokens + output_tokens`. Only the *latest* usage
   is kept (summing every line would massively overcount). Returns 0 when no usage is present.
2. **Decide** (`decideNudge`, pure/exported) — `ratio = tokens / window`; nudge when
   `ratio >= threshold` **and** the session hasn't already been nudged. Defaults: threshold **0.60**
   (~60% full), window **200000** tokens — overridable via `AGENT_SMITH_HANDOFF_THRESHOLD` (0..1)
   and `AGENT_SMITH_CONTEXT_WINDOW` (tokens).
3. **Once-per-session latch** — a flag file at `~/.claude/agent-smith/handoff-nudge-<session>.flag`
   (session id sanitized) ensures the suggestion fires **at most once per session**, not on every
   prompt thereafter.
4. **Suggest only** — on a nudge it emits `additionalContext` (`hookSpecificOutput.hookEventName:
   "UserPromptSubmit"`) recommending the user run `/as-handoff`: write a `HANDOFF.md` (goal, state,
   branches/PRs, next-steps-as-subtasks, verification) and delegate remaining work to fresh-context
   subagents. A hook **cannot auto-invoke a command**, so this can only suggest.

> **Strictly fail-open.** No transcript, a missing file, a parse error, or any other failure → empty
> output, exit 0; it never blocks a prompt. The latch write is best-effort (worst case: it nudges
> again later). `estimateContextTokens`, `decideNudge`, and `nudgeMessage` are exported and
> unit-tested; `main()` runs only when invoked directly. This is the **proactive** companion to the
> deterministic [[#PreCompact — `pre-compact-handoff.js`|PreCompact snapshot]] below and to the
> on-demand handoff skill / `/as-handoff` command (see [[07-skills-and-commands]]).

---

## PreToolUse (Bash) #1 — `pre-tool-git-guard.js`

Intercepts Bash tool calls; acts only when the command contains `git `. Adds advisory
`additionalContext` (it does **not** block — it informs):

- **`git commit`** — if `commitlint.config.js` or `docs/architecture/` exists, reminds about
  Conventional Commits (`type(scope): description`, subject ≤72). If `backend/`|`apps/` (or
  `frontend/`) plus `docs/architecture/backend-architecture.md` exist, it extracts the
  **Pre-push CI Gates** code block from that doc and surfaces it.
- **`git push`** — reminds to confirm pre-push gates pass, docs are updated, PR is ready.
- **`git rebase` / `git reset --hard`** — flags a DESTRUCTIVE history-rewriting operation and
  asks for explicit user confirmation.

---

## PreToolUse (Bash) #2 — `pre-tool-sentrux-gate.js` (the deterministic gate)

The architectural enforcement hook. It is **deterministic — zero LLM, zero tokens** — and is the
real teeth behind [[08-sentrux-quality-gate]]. Gates only `git commit`, `git push`, and
`gh pr create`.

**Flow:**

1. Skip cleanly if `.sentrux/baseline.json` is absent or `sentrux` isn't on PATH (never blocks
   the user for missing tooling).
2. **Run the gate, cached by working-tree fingerprint.** Fingerprint = `HEAD` +
   `git stash create` snapshot (covers staged **and** unstaged tracked content) + untracked file
   list, hashed. Cached verdict in `.sentrux/.gate-cache.json` — so a commit-then-push on an
   unchanged tree scans once. `git write-tree` is deliberately **not** used (index-only would miss
   unstaged edits).
3. **Read the verdict from stdout text** (`sentrux gate` exits 0 even when degraded): "DEGRADED"
   vs "No degradation detected". Unrecognized verdict → allow (don't block on an unparseable error).
4. **Degradation → ASK the human.** Emits `permissionDecision: "ask"` with the offending metrics
   (Quality / Coupling / Cycles / God files) and the remediation playbook (Step 0 of `/as-pr-review`).
   Never auto-approves a regression.
5. **Improvement → ratchet automatically.** Parses each metric (Quality higher-better; Coupling /
   Cycles / God files lower-better). If any improved and none worsened, runs
   `sentrux gate . --save`. On `git push` it also `git commit .sentrux/baseline.json -m
   "chore(sentrux): ratchet baseline"` (path-scoped — touches only the baseline) so the new
   baseline travels with the push. On commit/PR-create it leaves the saved baseline **unstaged**
   (so it can't ride into an unrelated commit) and tells the model to commit it separately.
6. **No change → allow silently.**

---

## PostToolUse — caveman resume

Mirror of the PreToolUse memory matcher: after a memory-write tool completes, emits a "Resuming
caveman…" status (conditionally — if caveman was off before the write, it stays off). Purely a
communication-mode toggle; no project state changes.

---

## PreCompact — `pre-compact-handoff.js`

A **deterministic, best-effort handoff snapshot** that fires right before Claude Code compacts the
conversation (manual or auto) — the moment context is most at risk. It captures raw recovery state
to a file so an out-of-context recovery has something to start from even when nobody ran the handoff
skill in time. It does **not** reason about the task or delegate work (that's the handoff skill's
job); it is purely the safety net.

**Flow:**

1. **Drain stdin** (its contents aren't needed) so Claude Code never blocks writing to the hook.
2. **Act only inside a git repo** — resolves the current branch via `git rev-parse --abbrev-ref
   HEAD`; if there's no branch it emits `{}` and stops (no useful state to snapshot).
3. **Gather facts** — `git status --short` (working-tree dirtiness), `git log --oneline -10` (recent
   commits), and `gh pr list --head <branch> --state open` (open PR for the branch).
4. **Render** (`renderSnapshot`, pure/exported) a markdown document and **write it to
   `HANDOFF-autosnapshot.md` at the repo root**. The document carries an ISO timestamp, branch,
   working-tree clean/dirty flag, an Open-PR section, a Recent-commits block, an Uncommitted-changes
   block, and a Next-steps line telling the reader to run the handoff skill (`/as-handoff`) to turn
   the raw state into a proper, delegable handoff.

> **Strictly fail-open / non-blocking.** Every git/`gh`/filesystem operation is wrapped; the hook
> **never throws** and **always exits 0 with `{}`**, so it cannot block or delay compaction —
> a snapshot is a bonus, never a requirement. `renderSnapshot` is exported and unit-tested (along
> with the PreCompact registration in `buildHookConfig`); `main()` runs only when invoked directly.
> This deterministic snapshot complements the on-demand handoff skill / `/as-handoff` command and
> the proactive [[#UserPromptSubmit — `user-prompt-handoff-nudge.js`|UserPromptSubmit nudge]] (see
> [[07-skills-and-commands]]).

---

## Stop — `stop-change-detector.js`

Runs at session end. Detects uncommitted work and documentation gaps, and re-checks the
architecture gate, then persists a state file for the next SessionStart.

**Flow:**

1. **Loop guard** — if `stop_hook_active` is true (Claude is running *because* this hook's
   `additionalContext` re-invoked it), emit nothing and exit 0 (the documented Stop-hook
   anti-loop pattern).
2. **Collect changed files** — union of `git diff --name-only HEAD`, `--staged`, and untracked.
3. **Classify each file** (`classifyFile`, pure/exported for tests): CODE (known source
   extension *or* under a configured source dir from `.claude/agent-smith/config.json`, default
   `["src"]`) vs DOCS (`.md/.rst/.txt/…` or under `docs/`) vs other; CODE is further labelled
   backend/frontend by directory + extension hints. This layout-agnostic rule fixes the old bug
   where CLI/library projects (code under `src/`) were wrongly flagged "documentation-only".
4. **Build suggestions** (`buildReport`): code changed → suggest `/ship` (if present) or `/git`,
   and `/documentation latest` if docs weren't also touched; docs-only → suggest committing docs.
5. **Sentrux re-check** — if installed, run `sentrux gate .` (15s); a non-zero exit appends a
   "architectural quality regressed this session" suggestion.
6. **Persist** `~/.claude/agent-smith/last-session-state.json` for the next SessionStart, and emit
   the suggestions as `additionalContext`.

> `classifyFile`, `buildReport`, and `resolveSourceDirs` are exported and unit-tested
> (`src/__tests__/hooks/stop-change-detector.test.ts`); `main()` runs only when invoked directly
> as the hook entry point.

---

## Summary: the per-session safety loop

```
SessionStart ─ doctor: health + save sentrux baseline + nudge
             └ dashboard: auto-start (detached) + refcount this session
     │
   …work…
     │   UserPromptSubmit(each prompt) → at ~60% context, one-time /as-handoff nudge (suggest-only)
     │   PreToolUse(Bash) before each git op:
     │     git-guard → conventions/gates reminders (advisory)
     │     sentrux-gate → ASK on regress / ratchet on improve (deterministic)
     │   PostToolUse(.*) → tool_call event per tool; agent_call_finished for Agent dispatches
     │   Pre/PostToolUse(memory) → suspend/resume caveman around memory writes
     │   PreCompact(before compaction) → write HANDOFF-autosnapshot.md (fail-open, non-blocking)
     ▼
Stop ─ change detector: classify diff, suggest commit/docs, re-check gate, save state
     │
     ▼
SessionEnd ─ dashboard: deregister session; SIGTERM the auto-started server when the last session ends
```
