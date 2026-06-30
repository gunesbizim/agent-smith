# Agent Smith

> Point it at your code. It reads your project, then sets up your AI coding assistant to work *your* way — with the right commands, the right helpers, and guardrails so it can't make a mess.

[![CI](https://github.com/gunesbizim/agent-smith/actions/workflows/ci.yml/badge.svg)](https://github.com/gunesbizim/agent-smith/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Contents

- [Explain it like I'm five](#explain-it-like-im-five)
- [The problem it solves](#the-problem-it-solves)
- [What you get after running it](#what-you-get-after-running-it)
- [Quick start](#quick-start)
- [How it works (the four steps)](#how-it-works-the-four-steps)
- [CLI commands](#cli-commands)
- [MCP servers & dependencies](#mcp-servers--dependencies)
- [smith-mode — execution discipline](#smith-mode--execution-discipline)
- [Guardrails: the Sentrux quality gate](#guardrails-the-sentrux-quality-gate)
- [Project layout](#project-layout)
- [Development](#development)
- [Usage guide](#usage-guide)
  - [Prerequisites](#prerequisites)
  - [Windows notes](#windows-notes)
  - [Setting up a repository](#setting-up-a-repository)
  - [Looking before you leap](#looking-before-you-leap)
  - [Everyday commands](#everyday-commands)
  - [Skills](#skills)
  - [Guardrails in practice](#guardrails-in-practice)
  - [Long sessions and handoff](#long-sessions-and-handoff)
  - [Keeping your setup current](#keeping-your-setup-current)
  - [The experimental pipeline](#the-experimental-pipeline)
  - [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Explain it like I'm five

Imagine you get a brand-new robot helper. Out of the box, the robot is smart but it doesn't know **your** house — where the kitchen is, which cup is yours, that you never wear shoes inside.

**Agent Smith is the person who shows the robot around your house.** It walks through your project, notices how things are done ("ah, this is a Java kitchen, the tests live *here*, you tidy up with *this* tool"), and then hands the robot a little instruction card so it helps you the way *you* already work — instead of guessing and doing it wrong.

It also puts up a few **safety gates** ("don't touch the stove," "always wash the cup after") so the robot can help on its own without breaking anything. You're still in charge — the robot asks before doing the big, scary stuff.

That robot is **Claude Code** (Anthropic's AI coding assistant). Agent Smith is the setup crew that makes Claude Code instantly useful in *your* repository.

---

## The problem it solves

A general AI assistant doesn't know your project. So it:

- runs the **wrong commands** (Python's `pytest` on a Java project — a real bug this tool was built to kill),
- ignores **your conventions** (your folder layout, your auth rules, your logging style),
- has **no memory** of how the code is wired, and
- has **no guardrails**, so letting it run freely is risky.

You *could* hand-write all that setup yourself for every repo. Agent Smith does it for you, automatically, by **reading your actual project** — and keeps it honest: if it can't tell what something is, it says so instead of guessing.

---

## What you get after running it

One command turns a plain repository into a Claude-Code-ready workspace with:

| Thing it installs | What it's for |
|---|---|
| **Slash commands** (`/as-backend`, `/as-test`, `/as-ship`, …) | One-word shortcuts for everyday jobs, pre-loaded with your stack |
| **Skills** (review, test, docs writers — plus **smith-mode**) | Detailed playbooks the assistant follows for specific tasks |
| **MCP servers** (gitnexus, git-memory, …) | Give the assistant memory: code structure, git history, symbol search |
| **Hooks** (session start, pre-tool, pre-compact, prompt-submit, stop) | Automatic checks around the assistant's actions — including a **handoff snapshot** saved before the context window fills, so long sessions can hand off cleanly |
| **Sentrux quality gate** | A guardrail that blocks changes which make the architecture worse |
| **A managed `CLAUDE.md` section** | A living cheat-sheet of every command and skill, refreshed on each run |

All of it is **tailored to the stack Agent Smith detected** — not a generic template.

---

## Quick start

You need **Node 20+** and **git**, plus ideally the **`claude`** CLI on your PATH (for the smartest setup; it still works without it, just less customized). It runs on **macOS, Linux, and Windows** — see [Prerequisites](#prerequisites) for the per-platform tools and [Windows notes](#windows-notes) for Windows specifics.

```bash
# from the root of the project you want to set up
npx @gunesbizim/agent-smith init
```

That's it. Restart Claude Code and try a command like `/as-backend "add a health endpoint"`.

Want to look before you leap?

```bash
npx @gunesbizim/agent-smith analyze   # just print what it detects, change nothing
```

---

## How it works (the four steps)

```
        ┌───────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
  your  │ 1. DETECT │ ──▶ │ 2. ADAPT  │ ──▶ │3. INSTALL│ ──▶ │4. OPERATE│
  repo  │ the stack │     │ skills &  │     │ MCPs,    │     │ commands,│
        │           │     │ docs to it│     │ hooks,   │     │ guarded  │
        └───────────┘     └───────────┘     │ gate     │     │ pipeline │
                                            └──────────┘     └──────────┘
```

### 1. Detect — read the project, never guess

Agent Smith gathers **evidence the project declares about itself** — build manifests and CI files (`pom.xml`, `build.gradle`, `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `.github/workflows/…`, `Makefile`, …) across every module. It then **synthesizes a `StackProfile`**: the language, framework, ORM, database, and the *real* commands to test/lint/format/migrate.

- If the `claude` CLI is present, an LLM pass reads the evidence and classifies the stack — so it covers essentially **any** language without a hardcoded list.
- If not, a deterministic fallback handles the common ecosystems (Java/Maven+Gradle, Node, Go, Rust, Python).
- **If something can't be determined, it is reported as `none` — never filled in with a borrowed default.** (This is the honesty rule that stops a Java project from being told to run `ruff`/`pytest`.)

> Code: `src/analyze/stack-evidence.ts` → `src/analyze/stack-synthesizer.ts` → `src/analyze/best-practice-mapper.ts`. Contracts in `src/analyze/stack-types.ts`.

### 2. Adapt — write setup that matches your code

The detected profile fills in **template variables**, and (when `claude` is present) an LLM pass rewrites the skill files so they're grounded in *your* real structure and conventions — not a Django/Vue stub. Architecture docs and best-practice notes are generated alongside. An optional **interview** captures conventions the code can't reveal (ticket prefix, PR checklist, etc.).

> Code: `src/adapt/*`, `src/scaffold/*`.

### 3. Install — wire up memory, automation, and guardrails

After the interview finishes, `init` **installs the MCP server binaries programmatically** — it does not rely on you, on generated skills, or on Claude Code to install anything later. It asks for your approval first (a single batch prompt listing every server and the exact command it will run), shows a **live progress bar** naming whatever is installing at that moment, and is **stack-gated** (browser tools only when a frontend exists, Vuetify only for Vuetify apps, Laravel Boost only for Laravel). See [MCP servers & dependencies](#mcp-servers--dependencies) below.

- **MCP servers** are installed + configured so the assistant can query code structure, git history, and symbols.
- **GitHub CLI (`gh`)** is auto-installed (best-effort, no-sudo) for the git/ship PR workflows.
- **Hooks** are registered: a SessionStart health check that also surfaces the smith-mode discipline every session, telemetry hooks that feed the dashboard every tool/MCP call, and a dashboard lifecycle pair that **auto-starts** the dashboard on the first session and **auto-stops** it when the last session ends (opt out with `AGENT_SMITH_DASHBOARD_AUTOSTART=0`).
- **Sentrux** is installed (`.sentrux/rules.toml` + a starter `baseline.json`) so architecture quality can be gated.
- A **managed block** is written into `CLAUDE.md` listing every command and skill — between `<!-- agent-smith:start -->` and `<!-- agent-smith:end -->`, so **your own notes in that file are never overwritten**.

> **Everything stays local unless you choose otherwise.** All MCP config lives in *your* repo (`.claude/`, `.mcp.json`) and in your machine's per-repo private config (`~/.claude.json`); nothing is uploaded anywhere. The privacy-sensitive servers are opt-in: **Obsidian** is registered at Claude Code *local scope* (per-repo, private, never committed) and only when you give it a vault path; **SonarQube** and **Jira** only activate when you set their tokens; remote integrations require credentials you supply. Skip MCP installation entirely with `agent-smith init --no-install`.

> Code: `src/install/*`, `src/scaffold/hooks.ts`, `src/install/sentrux-installer.ts`, `src/adapt/claude-md-writer.ts`.

### 4. Operate — do the work, with a human in the loop

Now you (and the assistant) use the installed `/as-*` commands and skills. There's also a **semi-autonomous ticket-to-PR pipeline** designed to take a ticket through branch → plan → implement → test → review → docs → PR → CI, **pausing at gates for human approval** — human-gated by design, not fully autonomous. **Status: partial.** Its deterministic back half is real and unit-tested — branch hygiene (`decideBranch`, always forking a fresh branch from updated `main`) and the CI/Sonar green-wait (`evaluateCi`, which never reports green until every check passes) — while the middle phases (plan/implement/test/review/docs) are still stubs pending engine integration, and the `ticket`/`pipeline` CLI commands still only preview the sequence.

> Code: `src/cli/*`, `src/pipeline/*`.

---

## CLI commands

| Command | What it does |
|---|---|
| `agent-smith init` | Full setup: detect → adapt skills/docs → install MCPs, hooks, gate → write `CLAUDE.md` |
| `agent-smith analyze [--json] [--llm]` | Detect the stack and print a report (and the synthesized `StackProfile`); changes nothing |
| `agent-smith configure` | Re-run MCP configuration only |
| `agent-smith doctor` | Health check: MCP connections, skill validity, git state |
| `agent-smith dashboard [--run <id>]` | Local web UI tracking every agent / tool / MCP call across runs (with MCP-only / errors-only / search filters); auto-starts on session start, so you rarely run it by hand |
| `agent-smith ticket <id> [--auto]` | Fetch a Jira ticket and run the gated pipeline |
| `agent-smith pipeline` | Run the pipeline on the current branch's changes |

Useful flags: `--llm` / `--no-llm` (force or skip the Claude pass), `--dry-run` (show what would happen), `--auto` / `--no-interview` (skip the setup interview), `--yes` (approve MCP installs without prompting), `--no-install` (skip installing MCP binaries; still writes config).

---

## MCP servers & dependencies

`init` installs MCP servers programmatically (after a single batch approval prompt; a live `cli-progress` bar shows what's installing). Selection is **stack-gated** — you only get servers relevant to your project. Installs run through whichever package manager each server needs; missing managers are reported with a manual hint rather than failing the run. **Nothing leaves your machine** — config is written into your repo and your local Claude config; credential-gated servers stay dormant until you set their secrets.

| MCP server | What it gives the assistant | Install mechanism | When it activates | Source |
|---|---|---|---|---|
| **gitnexus** | Code-intelligence graph: impact/blast-radius, call chains | `npm i -g gitnexus` | always | [abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus) |
| **git-memory** | Semantic search over git history | `npm i -g git-memory` | always | npm: `git-memory` *(no public repo listed)* |
| **playwright** | Browser automation — drive app, screenshot | npx (cache pre-warmed at install) | frontend detected | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) |
| **chrome-devtools** | Console/network/perf/lighthouse debugging | npx (cache pre-warmed at install) | frontend detected | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| **sonarqube** | Static analysis — issues, quality gate, coverage | `npm i -g sonarqube-mcp-server` | `SONARQUBE_TOKEN` set | [sapientpants/sonarqube-mcp-server](https://github.com/sapientpants/sonarqube-mcp-server) |
| **sentrux** | Architectural sensor + quality gate | brew / curl / winget (shell) | always | [sentrux/sentrux](https://github.com/sentrux/sentrux) |
| **vuetify** | Vuetify 3 component API lookup | npx on first use | Vuetify frontend | [vuetifyjs/mcp](https://github.com/vuetifyjs/mcp) |
| **laravel-boost** | Laravel app intelligence — routes, models, schema | manual (`composer require laravel/boost --dev`) | Laravel backend | [laravel/boost](https://github.com/laravel/boost) |
| **obsidian** | Read/write a knowledge vault (vault path is private per-machine, kept in gitignored `.mcp.json`) | npx on first use | you provide a vault path | npm: `mcp-obsidian` |
| **mempalace** | Persistent knowledge-graph memory | `pipx install mempalace` (needs Python) | always | pip: `mempalace` *(no public repo listed)* |
| **jira** | Jira/Confluence issue tracking | npx on first use | `JIRA_API_TOKEN` set | npm: `@anthropic/jira-mcp` *(not yet published)* |

> Links marked *(no public repo listed)* / *(not yet published)* could not be verified against a public registry at the time of writing — they are ecosystem/internal or placeholder packages; the package name is shown so you can confirm before relying on it.

**Package managers used across these servers** (detected, never installed with `sudo`): **npm/npx** (Node — required), **Python + pipx** (mempalace — pipx is the only one auto-bootstrappable, via `pip --user`), **Homebrew** (sentrux on macOS/Linux), **winget/choco** (sentrux/gh on Windows), **Composer + PHP** (laravel-boost). The **GitHub CLI (`gh`)** is also auto-installed best-effort for the PR workflows and needs a one-time `gh auth login`. If a required manager is missing, agent-smith prints how to install it and skips that server — it never blocks or prompts for a password.

---

## smith-mode — execution discipline

Every project Agent Smith sets up ships the **smith-mode** skill and surfaces it each session. On any task that spans multiple files, sources, or sessions, it makes the assistant:

1. **write a numbered stage plan** before touching anything,
2. **delegate** independent stages to sub-agents where possible,
3. **verify each stage with a check that can actually fail** (a test, a fetched source, a diff against spec — not "looks right"), and
4. **self-critique** before delivering.

It's a checklist for careful work, skipped for trivial one-pass tasks. (Vendored from [mrtooher/fable-mode](https://github.com/mrtooher/fable-mode).)

---

## Guardrails: the Sentrux quality gate

Sentrux measures structural health (coupling, dependency cycles, "god files," function complexity) and saves a **baseline**. Before changes land, the gate checks the code didn't get *worse* than the baseline. The baseline is a **ratchet** — it only ever moves up as quality improves, so the project can't silently erode.

> Run it yourself: `sentrux gate .`

### Blocked commands (the "don't touch the stove" gate)

Agent Smith also writes a small **deny list** of dangerous shell commands — `rm -rf`, `git push
--force`, `git reset --hard`, `chmod -R 777`, `curl | sh`, `dd if=…`, the classic fork bomb, and a
few more. It's enforced two ways: as `Bash(…)` deny rules in `.claude/settings.json` (Claude Code
blocks them directly) **and** by a zero-token `PreToolUse` hook that substring-matches the same list
from `.claude/agent-smith/permissions.json`. The hook is the stronger of the two — a handful of
patterns (the fork bomb among them) can't be expressed in Claude Code's `Bash()` rule syntax, so the
hook is what actually stops them. The guard **fails open**: if the policy file is missing or broken it
allows rather than freezing your session.

> Code: `src/scaffold/permissions.ts`, `hooks/pre-tool-permission-guard.js`.

---

## Project layout

```
src/
  cli/        # command entry points (init, analyze, configure, doctor, ticket, pipeline)
  analyze/    # stack detection: evidence → synthesizer → best-practice mapper
  adapt/      # generate/customize skills, architecture docs, CLAUDE.md writer
  scaffold/   # emit commands, skills, configs, hooks into the target repo
  install/    # MCP registry/installer, dependency checks, sentrux installer
  pipeline/   # the gated ticket-to-PR orchestrator
  jira/       # ticket parsing
  shared/     # types + template variables
templates/    # the skills & /as-* commands that get scaffolded into your project
hooks/        # the hook scripts copied into your project
.sentrux/     # this repo's own quality baseline
```

In-depth, code-grounded docs live in the Obsidian vault under `vault/agent-smith/` (committed public documentation — see the vault files in this repo).

---

## Development

```bash
npm install
npm run build       # tsc
npm test            # vitest
npm run typecheck   # tsc --noEmit
sentrux gate .      # architecture gate (run before committing)
```

Conventional Commits are required; CI runs tests (Node 20 & 22), type-check, CodeQL, SonarCloud, and dependency review on every PR.

---

## Usage guide

A practical walkthrough — from installing Agent Smith to using the workspace it sets up, day to day.

### Prerequisites

Agent Smith itself only needs Node, but a **full** `init` installs MCP servers and the Sentrux gate, and those pull in extra toolchains. None of these are installed with `sudo`; if a required manager is missing, agent-smith prints how to get it and skips that server rather than failing.

| Tool | Needed for | Required? |
|---|---|---|
| **Node 20+** & npm | Running agent-smith; the npm-based MCP servers (gitnexus, git-memory) | **Required** |
| **git** ≥ 2.30 | Detection, hooks, git-memory, every PR flow | **Required** |
| **`claude` CLI** | The smart setup — LLM stack classification, skill generation, and running the `/as-*` commands | **Strongly recommended** (works without it, just less customized) |
| **Python + pipx** | **mempalace** MCP server (installs via `pipx`) | Needed for that server; pipx is the one manager agent-smith can auto-bootstrap (via `pip --user`) |
| **A system package manager** — Homebrew (macOS/Linux), `curl`, or winget/choco (Windows) | Installing the **Sentrux** binary (and `gh` on Windows) | Needed for the quality gate |
| **GitHub CLI (`gh`)** | `/as-ship` PR workflow (commit → PR → CI) | Optional (auto-installed best-effort; run `gh auth login` once) |
| **Composer + PHP** | Laravel Boost MCP | Only for Laravel backends |

> **Python version caveat (mempalace):** mempalace depends on chromadb, which lags the newest Python releases. **Python 3.12** is the safe target; the very latest interpreters (3.13+) can break chromadb's install. If mempalace won't install, check your Python version first.

### Windows notes

`agent-smith init` is supported on Windows, and the full test suite runs on `windows-latest` in CI. A few platform specifics:

- **Run it from any shell** — PowerShell, Windows Terminal, or `cmd`. `npx @gunesbizim/agent-smith init` works the same as on macOS/Linux.
- **Package managers** — Windows installs use **winget** (preferred) or **Chocolatey**; agent-smith never uses `sudo`-style or interactive installers. `gh` is auto-installed via winget/choco when present, and **Sentrux** is fetched with PowerShell into `%LOCALAPPDATA%\Microsoft\WindowsApps` (already on PATH).
- **Python** — install from python.org (the `py` launcher) rather than the Microsoft Store stub, which agent-smith deliberately skips. pipx is the one manager it can bootstrap for you. Remember the **Python 3.12** caveat above for mempalace.
- **CLI shims** — `claude`, `gh`, `npm`/`npx`, `winget`/`choco` are `.cmd`/`.exe` shims on Windows; agent-smith launches them through the shell so they resolve correctly. If a command isn't found, confirm it's on your `PATH` in a *new* terminal (installers often don't refresh the current one).
- **One honest caveat** — LLM skill/doc generation passes your prompt through the shell on Windows; a prompt containing literal `%VAR%` patterns can be mis-expanded by `cmd.exe`. This only affects the optional generation step (it falls back to templates), never the install itself.

### Setting up a repository

From the root of the project you want to set up:

```bash
npx @gunesbizim/agent-smith init
```

`init` runs the four steps (detect → adapt → install → operate) and walks you through:

1. **Detection** — it reads your manifests and reports the stack it found. Anything it can't determine is shown as `none`, never guessed.
2. **Interview** (~11 questions; skip with `--auto` / `--no-interview`) — branch naming, commit format, ticket prefix, PR checklist, architecture rules, complexity limits, and so on. Each has a smart default: press Enter to accept, type `?` for a Claude elaboration, or `skip` to leave blank. Answers are saved to `docs/architecture/decisions.md`.
3. **MCP approval** — a single batch prompt lists every server and the exact install command. Approve it (or pass `--yes`) and a live progress bar shows what's installing. Selection is **stack-gated** — you only get servers relevant to your project. After install, `init` automatically runs each server's index command in the project root (`gitnexus analyze`, `git-memory index --repo-path .`) so the MCP tools are populated and ready in the very first session — no manual indexing step required.
4. **Generation** — when `claude` is present, it writes architecture docs and rewrites the worker skills grounded in your real code. This runs **last** and can take up to ~20 min on a large monorepo; raise the cap with `AGENT_SMITH_SKILLS_TIMEOUT_MS` (milliseconds) if it times out.

When it finishes, **restart Claude Code**. Your repository now has:

- `.claude/commands/as-*.md` — the slash commands
- `.claude/skills/` — the worker skills plus **smith-mode** and **handoff**
- `.mcp.json` and `.claude/settings.json` — MCP servers, hooks, and the permission deny rules
- `.sentrux/rules.toml` + `baseline.json` — the architecture quality gate
- a managed block in `CLAUDE.md` (between `<!-- agent-smith:start -->` and `<!-- agent-smith:end -->`) — anything you write outside those markers is never touched

Re-running `init` is safe and idempotent; pass `--regen-skills` to force the LLM skill pass again.

### Looking before you leap

```bash
npx @gunesbizim/agent-smith analyze          # print what it detects, change nothing
npx @gunesbizim/agent-smith analyze --json    # machine-readable StackProfile
npx @gunesbizim/agent-smith init --dry-run    # show every file it would write, write nothing
npx @gunesbizim/agent-smith init --no-install # scaffold + config, but don't install MCP binaries
```

### Everyday commands

Once set up, drive the work from inside Claude Code with the `/as-*` slash commands. `$ARGUMENTS` is whatever you type after the command.

| Command | What it does | Example |
|---|---|---|
| `/as-backend <task>` | Implement a backend task as a senior backend engineer, against your detected stack | `/as-backend "add a /health endpoint"` |
| `/as-frontend <task>` | Implement a frontend / full-stack task | `/as-frontend "add a dark-mode toggle"` |
| `/as-test <target>` | Write or extend tests; dispatches test-backend / test-frontend in fresh subagents | `/as-test "OrderService.charge"` |
| `/as-pr-review [PR# \| path]` | Review through an adversarial critic panel (security, performance, simplicity, maintainability, DX) with graded severity (critical/high/medium/low) + a false-positive gate per finding; drops FPs, auto-fixes confirmed critical/high, leaves low for follow-up | `/as-pr-review 42` |
| `/as-documentation [latest\|all\|path]` | Detect what changed and regenerate the matching docs | `/as-documentation latest` |
| `/as-ship [hint]` | The gated path from finished work to a green PR: commit → PR → review → drive CI green | `/as-ship` |
| `/as-insights` | Read your architecture docs + config and suggest concrete improvements | `/as-insights` |
| `/as-handoff` | Write a structured `HANDOFF.md` and hand the remaining work to fresh-context subagents | `/as-handoff` |
| `/as-caveman` | Switch to ultra-compressed communication to save tokens | `/as-caveman` |

Commands invoked with no argument (`/as-backend`, `/as-test`) ask you for the task. The orchestrator commands (`/as-test`, `/as-pr-review`, `/as-documentation`) classify the target and fan out to specialized skills, each in a fresh subagent. Subagent **model routing** follows the engine's policy: exploration / planning / review work goes to a fresh **Opus** subagent, implementation / execution to a fresh **Sonnet** one (Opus thinks, Sonnet codes).

### Skills

Skills are detailed playbooks the assistant follows automatically when a task matches — you rarely invoke them by name. After `init` your repo has:

- **Worker skills**, rewritten to match your code: `pr-review-backend` / `pr-review-frontend`, `test-backend` / `test-frontend`, `docs-backend` / `docs-frontend`. The implementation commands (`/as-backend`, `/as-frontend`) follow an explore → triage → TDD-plan → **RED-first** implement loop, and the `test-*` skills enforce a failing test before any implementation (write red → confirm failure → implement to green).
- **smith-mode** — the execution discipline (stage map → delegate → failable verification → self-critique) applied to any task spanning multiple files, sources, or sessions.
- **handoff** — captures a session-continuity snapshot and hands work to fresh subagents when the context window gets crowded.

#### Execution chain

Commands are thin dispatchers — they invoke a main skill which owns the workflow:

```
command (/as-pr-review) → main skill (pr-review-backend / pr-review-frontend)
  → critic sub-skill panel (pr-critic-security, pr-critic-performance,
                            pr-critic-simplicity, pr-critic-maintainability, pr-critic-dx)
    → MCP tools (gitnexus for impact/blast-radius, git-memory for commit history,
                 sentrux for architecture gate, playwright / chrome-devtools for browser,
                 obsidian for vault writes)
```

The `pr-review-*` skills run an **adversarial critic panel** scoped per side of the stack: each critic tries to refute the change from its own lens (security, performance, simplicity, maintainability, developer experience), findings are graded (critical / high / medium / low), and a false-positive gate filters noise before the results are synthesized. All implementation and test skills follow **RED-first TDD**: the failing test is written and confirmed to fail before any implementation is added.

### Guardrails in practice

Three layers keep the assistant from making a mess — you stay in charge of the big, risky steps:

- **Sentrux quality gate** — before a commit, it checks your architecture didn't regress against the saved baseline. Run it yourself anytime with `sentrux gate .`; it blocks changes that add dependency cycles, "god files," or coupling beyond the ratcheted baseline. In `/as-ship` and `/as-pr-review`, a regression first enters a **bounded remediation loop** (try a targeted, behaviour-preserving fix → re-gate) and only escalates to you if it can't be recovered — tests/typecheck/lint/secret-scan failures still hard-stop immediately.
- **Blocked-command deny list** — dangerous shell commands (`rm -rf`, `git push --force`, fork bombs, …) are denied both by rules in `settings.json` and by a zero-token PreToolUse hook. It **fails open** if the policy file is missing, so it can't freeze your session.
- **TDD gate** — while an engine run is active, commits and pushes are denied unless the tests proven red are verified green on the current working tree.

### Long sessions and handoff

Agent Smith helps long sessions end cleanly instead of degrading as the context window fills:

- At **~60% context**, a `UserPromptSubmit` hook nudges you to run `/as-handoff` (threshold tunable via `AGENT_SMITH_HANDOFF_THRESHOLD`).
- Right before Claude Code **compacts** the context, a `PreCompact` hook auto-writes `HANDOFF-autosnapshot.md` at the repo root (git status, recent commits, open PRs) so nothing is lost.
- Run **`/as-handoff`** at any time to write a structured `HANDOFF.md` and continue the remaining work in fresh-context subagents.

### Keeping your setup current

| Want to… | Run |
|---|---|
| Re-detect and refresh everything | `agent-smith init` (idempotent) |
| Force-regenerate the LLM skills | `agent-smith init --regen-skills` |
| Re-do MCP configuration only | `agent-smith configure` |
| Check health (MCP connections, skill validity, git state) | `agent-smith doctor` |

The managed `CLAUDE.md` block is refreshed on every `init`, so the command/skill cheat-sheet stays current.

### The experimental pipeline

A semi-autonomous, **human-gated** ticket-to-PR pipeline is on the roadmap:

```bash
agent-smith ticket <id> [--auto]   # fetch a Jira ticket and run the gated pipeline
agent-smith pipeline               # run on the current branch's changes
```

**Status: partial.** The phase sequence is now `branch → plan → implement → test → review → docs → PR → CI`. The deterministic back-half phases are implemented as pure, unit-tested helpers driven by an injectable runner — `branch` (fresh branch from updated `main`), `pr` (push + open PR), and `ci` (poll `gh pr checks` / Sonar, never green until all pass). The middle phases (plan/implement/test/review/docs) remain stubs pending engine integration, and the `ticket`/`pipeline` CLI commands still only preview the sequence (they don't yet invoke the orchestrator).

### Troubleshooting

| Symptom | Fix |
|---|---|
| Commands aren't available after `init` | Restart Claude Code so it reloads `.claude/`. |
| "claude unavailable" during skill generation | It most likely **timed out** on a large repo — raise `AGENT_SMITH_SKILLS_TIMEOUT_MS` (ms) and re-run `init --regen-skills`. |
| mempalace won't install | Check your Python version — chromadb (its dependency) doesn't support the newest interpreters; use Python 3.12. |
| An MCP server shows disconnected | Run `agent-smith doctor`, then confirm the manager it needs is installed (npm, pipx, or Homebrew/curl/winget). |
| A commit is blocked | Run `sentrux gate .` for the architecture verdict, or read the permission / TDD guard reason the hook prints. |
| Setup looks stale | Re-run `agent-smith init` — it's idempotent and only rewrites its own managed regions. |

---

## License

[MIT](LICENSE) © Agent Smith Contributors
