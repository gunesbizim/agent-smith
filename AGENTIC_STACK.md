# Agentic Product Development Stack — Agent Smith

Complete reference for all MCP servers, Claude Code skills, and workflow patterns available in this project.

---

## MCP Servers

### Project-Level (`.claude/settings.json`)

| Server | Purpose |
|--------|---------|
| **gitnexus** | Code intelligence graph — impact analysis, execution flows, blast radius |
| **git-memory** | Semantic search over git history — past decisions, bug fixes, file timelines |
| **sentrux** | Real-time architectural sensor — quality signal, cycle detection, coupling grades, test gaps; REVIEW-phase session gate |

### Global User-Level (`~/.claude.json`)

| Server | Purpose |
|--------|---------|
| **gitnexus** | Same as above — loaded globally as fallback |
| **git-memory** | Same as above — loaded globally as fallback |
| **ouroboros** | PM agent framework — seed-based product interviews, AC generation, evolve/rewind |
| **mempalace** | Persistent knowledge graph memory — drawers, tunnels, kg_add, kg_query |
| **sonarqube** | Static analysis — issues, quality gates, hotspots, coverage metrics |
| **vuetify** | Vuetify 3 component documentation — search props, slots, events |

### Claude.ai Browser Integration (available when browser extension active)

| Server | Purpose |
|--------|---------|
| **chrome-devtools** | Browser automation — click, fill, navigate, screenshot, console logs, network |
| **playwright** | Browser automation (headless) — navigate, snapshot, fill, evaluate JS |
| **Atlassian** | Jira + Confluence — create/edit issues, search JQL, read/write pages, comments |
| **Linear** | Issue tracking — create, update, search issues |
| **Microsoft 365** | Outlook / Teams / OneDrive integration |
| **Notion** | Notion pages and databases |
| **monday.com** | Project boards |
| **Asana** | Task management |
| **Box** | File storage |
| **Canva** | Design asset management |
| **Figma** | Design file access |
| **HubSpot** | CRM |
| **Intercom** | Customer messaging |
| **ide** | VS Code / JetBrains — execute code, get diagnostics from IDE |
| **laravel-boost** | Laravel docs search, DB queries, URL resolver (irrelevant to this project) |

---

## MCP Tool Reference by Server

### gitnexus

| Tool | Usage |
|------|-------|
| `gitnexus_query` | Find execution flows related to a concept. Run before reading source files. |
| `gitnexus_impact` | Blast radius for a symbol: d=1 = WILL BREAK, d=2 = LIKELY, d=3 = MAY. **Mandatory before editing any symbol.** |
| `gitnexus_context` | 360° view of a symbol — callers, callees, processes it participates in. |
| `gitnexus_detect_changes` | Map current git diff to affected flows and symbols. **Run before every commit.** |
| `gitnexus_rename` | Coordinated multi-file rename using the call graph (dry_run=true first). |
| `gitnexus_cypher` | Raw Cypher graph queries — custom call chain traces. |
| `gitnexus_list_repos` | List indexed repositories. |

**Resources (lightweight reads):**

| URI | Content |
|-----|---------|
| `gitnexus://repo/{name}/context` | Stats + staleness check |
| `gitnexus://repo/{name}/clusters` | Functional areas with cohesion scores |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{name}` | Step-by-step trace for one flow |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher queries |

### git-memory

| Tool | Usage |
|------|-------|
| `search_git_history` | Semantic search across all commits. Score > 0.7 = highly relevant. |
| `commits_touching_file` | All commits that modified a specific file, newest first. |
| `bug_fix_history` | Fix/security/hotfix commits for a component. |
| `architecture_decisions` | Refactor/migration/arch commits — "why was this designed this way?" |
| `latest_commits` | N most recent indexed commits — for regression investigation. |

### sonarqube

| Tool | Usage |
|------|-------|
| `issues` | List open issues with severity/type filters. |
| `quality_gate_status` | Pass/fail status for the project. |
| `hotspots` | Security hotspots requiring review. |
| `measures_component` | Coverage, duplication, reliability metrics. |
| `source_code` | View annotated source with issue markers. |
| `markIssueFalsePositive` / `markIssueWontFix` | Resolve issues with rationale. |

### sentrux

Real-time architectural sensor. Exposes `quality_signal` (0–10000) derived from five root causes: acyclicity (Tarjan SCC cycle count), depth (max dependency depth), equality (Gini of per-function cyclomatic complexity), redundancy (dead+dup ratio), and modularity (Newman Q). Start with `sentrux --mcp` (stdio).

| Tool | Usage |
|------|-------|
| `scan(path)` | Full architectural scan — returns `quality_signal`, `files`, `bottleneck`, and `root_causes` with `score` + `raw` per dimension. **Run at session start to establish baseline.** |
| `health()` | Metric breakdown by dimension — inspect individual scores without a full rescan. |
| `session_start()` | Save a quality-signal baseline for the current work session. **Call at the start of IMPLEMENT phase.** |
| `session_end()` | Compare current signal against baseline — returns `{ pass, signal_before, signal_after, summary }`. **Call at end of REVIEW phase as regression gate.** |
| `rescan(path)` | Re-run scan after code changes; cheaper than a cold `scan` when the project is already indexed. |
| `check_rules()` | Validate `.sentrux/rules.toml` against live metrics — reports which thresholds are violated. **Run before PR.** |
| `evolution()` | Quality-signal trend over time — useful for tracking architectural drift across sprints. |
| `dsm(path)` | Render the dependency structure matrix — visualise coupling between modules. |
| `test_gaps()` | Identify undertested high-risk modules ranked by cyclomatic complexity and coupling. |

### ouroboros

| Tool | Usage |
|------|-------|
| `ouroboros_pm_interview` | Interactive PM interview — generates ACs from business requirements. |
| `ouroboros_interview` | Developer seed interview for implementation planning. |
| `ouroboros_generate_seed` | Create an execution seed from a concept. |
| `ouroboros_execute_seed` | Run a seed to generate implementation output. |
| `ouroboros_evolve_step` | Iterate on a seed with new context. |
| `ouroboros_evaluate` | Evaluate output quality against criteria. |
| `ouroboros_qa` | QA pass on generated content. |
| `ouroboros_lateral_think` | Generate alternative approaches to a problem. |

### mempalace

| Tool | Usage |
|------|-------|
| `mempalace_kg_add` | Add a node/fact to the knowledge graph. |
| `mempalace_kg_query` | Query the knowledge graph. |
| `mempalace_search` | Full-text search across all memory. |
| `mempalace_get_drawer` / `mempalace_list_drawers` | Retrieve stored memory drawers. |
| `mempalace_create_tunnel` / `mempalace_find_tunnels` | Link related memory nodes. |
| `mempalace_diary_read` / `mempalace_diary_write` | Session-scoped journal. |

---

## Claude Code Custom Skills (`/skill-name`)

### Project-Domain Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `/as-backend` | Backend task | Senior Django/DRF engineer. Implements backend tasks respecting hexagonal arch, view/service/repo split, role decorators, and pre-push CI gates. |
| `/as-frontend` | UI task | Senior Vue3/Vuetify3/TypeScript engineer. Implements frontend tasks in Composition API `<script setup>` with Pinia + vue-i18n. |
| `/apidocs` | API documentation | Writes/updates OpenAPI specs for DRF endpoints. |
| `/as-test` | Test writing | Senior test engineer. Writes pytest tests covering happy path, failure paths, and edge cases per the project's test settings. |

### Review & Quality Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `/as-pr-review` | PR review | Reviews current branch diff against main — correctness, arch, role decorator compliance, permission matrix. |
| `/review` | PR review (alias) | Full pull request review. |
| `/code-review` | Code review | Diff review at configurable effort level (low/medium/high/max). Pass `--comment` to post inline PR comments, `--fix` to apply fixes. |
| `/simplify` | Cleanup | Reviews for reuse, simplification, efficiency — applies fixes. Bug-hunting excluded (use `/code-review`). |
| `/security-review` | Security audit | Complete security review of pending branch changes. |

### Workflow Automation Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `/verify` | Manual verification | Runs the app and observes behavior to confirm a change works. Uses browser/server startup as needed. |
| `/run` | App launch | Launches the project app — finds project-specific launch skill or falls back to built-in patterns. |
| `/deep-research` | Research | Multi-source web research with adversarial verification. Ask a specific question; it fans out searches, fetches sources, verifies claims. |
| `/loop` | Recurring task | Runs a prompt or slash command on a recurring interval. Self-paces if no interval given. |
| `/schedule` | Cron agent | Creates/manages scheduled remote agents running on cron schedules. |
| `/claude-api` | Anthropic SDK work | Builds/debugs Claude API apps. Handles prompt caching, tool use, model migration, batch, thinking mode. |

### Configuration Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `/update-config` | Settings change | Edits `settings.json` / `settings.local.json` — permissions, hooks, env vars, automated behaviors. |
| `/keybindings-help` | Keybindings | Customizes `~/.claude/keybindings.json` — rebind keys, chord bindings, submit key. |
| `/init` | New project | Generates `CLAUDE.md` for a new codebase. |
| `/fewer-permission-prompts` | Reduce prompts | Scans transcripts for common read-only tool calls and adds allowlist to reduce permission prompts. |

### Caveman Mode Skills (token compression)

| Skill | Trigger | What it does |
|-------|---------|--------------|
| `/caveman` | `caveman mode` | Activates ultra-compressed communication. Drops articles/filler. Intensity: `lite`, `full` (default), `ultra`. |
| `/caveman-commit` | Commit generation | Generates conventional commit messages — compressed but accurate. |
| `/caveman-review` | Code review | One-line review comments: location, problem, fix. |
| `/caveman-help` | Help reference | Quick-reference card for all caveman commands. |
| `/caveman:compress` | Memory compression | Compresses CLAUDE.md or memory files into caveman format to save input tokens. |

---

## GitNexus MCP Skills (`.claude/skills/gitnexus/`)

These are skill files that load automatically when GitNexus tasks are invoked:

| Skill File | When loaded |
|-----------|-------------|
| `gitnexus-guide` | User asks "what GitNexus tools are available?" / "how do I use GitNexus?" |
| `gitnexus-exploring` | "How does X work?", "Show me the auth flow", "What calls this function?" |
| `gitnexus-impact-analysis` | "What breaks if I change X?", "What depends on this?", blast radius requests |
| `gitnexus-debugging` | "Why is X failing?", "Trace this error", "This endpoint returns 500" |
| `gitnexus-refactoring` | "Rename this function", "Extract this into a module", "Split this service" |
| `gitnexus-cli` | "Index this repo", "Reanalyze", "Generate a wiki", "Check GitNexus status" |

---

## git-memory MCP Skills (`.claude/skills/git-memory/`)

| Skill File | When loaded |
|-----------|-------------|
| `git-memory-search` | "Why was this built this way?", "Find commits related to X", historical context |
| `git-memory-debug` | Regression investigation, "what changed recently?", tracing all changes to a file |
| `git-memory-index` | Indexing a new repo, re-indexing after history rewrite |
| `git-memory-status` | "Is git-memory set up?", "How many commits indexed?", troubleshooting empty results |

---

## Mandatory 3-Phase Workflow

Every implementation task must go through all three phases:

```
Phase 1 — PLANNING (GitNexus)
  gitnexus_query("affected concept")
  gitnexus_impact("SymbolBeingChanged")
  gitnexus_context("SymbolName")
  gitnexus_detect_changes()

Phase 2 — IMPLEMENTATION (native edit tools + GitNexus)
  Grep / Glob / Read to locate symbols and references
  After each file edit: run the project type-check / lint gate
  Mid-impl: gitnexus_detect_changes() to verify blast radius unchanged

Phase 3 — HISTORICAL CONTEXT (git-memory, when touching code with prior fixes)
  search_git_history("topic")
  commits_touching_file("filename")
  bug_fix_history("component")
  architecture_decisions("design topic")
```

---

## Pre-push CI Gates

Run from `backend/` before every `git push`:

```bash
.venv\Scripts\ruff check . && .venv\Scripts\ruff format --check .
.venv\Scripts\mypy .
.venv\Scripts\pytest -m "not integration"
python ..\scripts\lint_role_decorators.py
```

---

## Index

This project's GitNexus index should be set up via `npx gitnexus analyze`.

If stale: `npx gitnexus analyze` from project root, then restart Claude Code.
