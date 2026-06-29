# Execution discipline — smith-mode (read every session)

This repo bundles the **smith-mode** skill at `.claude/skills/smith-mode/SKILL.md` and surfaces it
each session via the SessionStart hook. For any task that spans multiple files, multiple sources,
or multiple sessions — and when running any `/as-*` command or worker skill — follow its staged
loop: **(1)** write a numbered stage map before acting, **(2)** delegate independent stages to
subagents where the runtime supports it, **(3)** verify each stage with a check that can actually
fail (a test that runs, a source actually fetched, an output diffed against spec — never "it looks
right"), and **(4)** do a skeptical self-review naming at least one weakness before delivery. Skip
it only for trivial single-pass tasks. smith-mode is also shipped into every project `agent-smith`
initializes (via `templates/skills/smith-mode/`).

# Project Documentation (Obsidian vault)

Full, code-grounded documentation for this project lives in the Obsidian vault at
**`vault/agent-smith/`** (served by the `obsidian` MCP; the vault is committed to the repo as the
project's public documentation). Start at **`vault/agent-smith/index.md`** — it is the Map of
Content that links every note.

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

<!-- agent-smith:start -->
<!-- Managed by agent-smith. Do not edit by hand — re-run `agent-smith init` to refresh. -->

# Agent Smith — Commands & Skills

This project is set up with agent-smith. The commands and skills below are available to
every session. For any task spanning multiple files, sources, or sessions, follow the
**smith-mode** execution discipline (`.claude/skills/smith-mode/SKILL.md`): stage map →
delegate → failable verification → self-critique.

## Slash commands

| Name | Purpose |
|------|---------|
| `/backend` | You are a senior backend engineer. Implement the backend task given in `$ARGUMENTS`. If empty, ask for the task. |
| `/caveman` | You are in caveman mode — ultra-compressed communication. |
| `/documentation` | You are the documentation orchestrator. Detect what changed on the active branch, dispatch matching documentation skills each in a fresh su… |
| `/frontend` | You are a senior full-stack engineer. Implement the frontend task given in `$ARGUMENTS`. If empty, ask for the task. |
| `/git` | You are the git workflow skill. Commit the current work and push to remote, following project conventions. |
| `/insights` | You are a project insights analyst. Read the project's architecture docs, decisions, and current agent-smith configuration, then suggest co… |
| `/pr-review` | You are the PR review orchestrator. Detect which sides of the stack changed, dispatch matching review skills each in a fresh subagent, and… |
| `/ship` | You are the **ship** workflow — the gated-autonomous path from finished work to a green PR. |
| `/test` | You are the test orchestrator. Classify the target, dispatch test skills each in a fresh subagent, and relay results. |

## Skills

| Name | Purpose |
|------|---------|
| `docs-backend` | Generate or update backend technical documentation — API annotations, endpoint/serializer docs, and a technical summary note in Obsidian. U… |
| `docs-frontend` | Generate human-readable, styled user documentation by driving the running app with Playwright MCP, taking real screenshots per role, and wr… |
| `smith-mode` | Enforces staged execution discipline on large tasks: a written stage plan, parallel delegation where the runtime supports it, a failable ve… |
| `git-memory-debug` | Use when the user is debugging a regression, investigating unexpected behaviour, or wants to know the full change history of a component. E… |
| `git-memory-index` | Use when the user wants to index a repository into git-memory, start using git-memory on a new project, or re-index after significant histo… |
| `git-memory-search` | Use when the user asks about why code was written a certain way, wants to find commits related to a bug, feature or module, or needs histor… |
| `git-memory-status` | Use when the user wants to check what is indexed, how many commits are in memory, or whether git-memory is set up correctly. Examples: "is… |
| `gitnexus-cli` | Use when the user needs to run GitNexus CLI commands like analyze/index a repo, check status, clean the index, generate a wiki, or list ind… |
| `gitnexus-debugging` | Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: "Why is X failing?", "Where does this erro… |
| `gitnexus-exploring` | Use when the user asks how code works, wants to understand architecture, trace execution flows, or explore unfamiliar parts of the codebase… |
| `gitnexus-guide` | Use when the user asks about GitNexus itself — available tools, how to query the knowledge graph, MCP resources, graph schema, or workflow… |
| `gitnexus-impact-analysis` | Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: "Is it sa… |
| `gitnexus-refactoring` | Use when the user wants to rename, extract, split, move, or restructure code safely. Examples: "Rename this function", "Extract this into a… |
| `pr-review-backend` | Review backend changes against architecture rules. Use when a PR or branch diff touches {{BACKEND_DIR}}/ — architecture violations, role en… |
| `pr-review-frontend` | Review frontend changes against architecture rules. Use when a PR or branch diff touches {{FRONTEND_DIR}}/ — component compliance, i18n par… |
| `test-backend` | Write or extend backend tests. Use for any backend test work — service methods, views, repositories, permissions, audit, encryption. Enforc… |
| `test-frontend` | Write or extend frontend tests. Use for any frontend test work — components, views, stores, API functions, role-gated rendering, i18n keys.… |

<!-- agent-smith:end -->
