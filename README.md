# Agent Smith

> Point it at your code. It reads your project, then sets up your AI coding assistant to work *your* way — with the right commands, the right helpers, and guardrails so it can't make a mess.

[![CI](https://github.com/gunesbizim/agent-smith/actions/workflows/ci.yml/badge.svg)](https://github.com/gunesbizim/agent-smith/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

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
| **Skills** (review, test, docs writers — plus **fable-mode**) | Detailed playbooks the assistant follows for specific tasks |
| **MCP servers** (gitnexus, git-memory, serena, …) | Give the assistant memory: code structure, git history, symbol search |
| **Hooks** (session start, pre-tool, stop) | Automatic checks that run around the assistant's actions |
| **Sentrux quality gate** | A guardrail that blocks changes which make the architecture worse |
| **A managed `CLAUDE.md` section** | A living cheat-sheet of every command and skill, refreshed on each run |

All of it is **tailored to the stack Agent Smith detected** — not a generic template.

---

## Quick start

You need **Node 20+** and the **`claude`** CLI on your PATH (for the smartest setup; it still works without it, just less customized).

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
- **Hooks** are registered (e.g. a SessionStart health check that also surfaces the fable-mode discipline every session).
- **Sentrux** is installed (`.sentrux/rules.toml` + a starter `baseline.json`) so architecture quality can be gated.
- A **managed block** is written into `CLAUDE.md` listing every command and skill — between `<!-- agent-smith:start -->` and `<!-- agent-smith:end -->`, so **your own notes in that file are never overwritten**.

> **Everything stays local unless you choose otherwise.** All MCP config lives in *your* repo (`.claude/`, `.mcp.json`) and in your machine's per-repo private config (`~/.claude.json`); nothing is uploaded anywhere. The privacy-sensitive servers are opt-in: **Obsidian** is registered at Claude Code *local scope* (per-repo, private, never committed) and only when you give it a vault path; **SonarQube** and **Jira** only activate when you set their tokens; remote integrations require credentials you supply. Skip MCP installation entirely with `agent-smith init --no-install`.

> Code: `src/install/*`, `src/scaffold/hooks.ts`, `src/install/sentrux-installer.ts`, `src/adapt/claude-md-writer.ts`.

### 4. Operate — do the work, with a human in the loop

Now you (and the assistant) use the installed `/as-*` commands and skills. There's also a **planned semi-autonomous ticket-to-PR pipeline** — it is designed to take a Jira ticket through plan → implement → test → review → docs → PR, **pausing at gates for human approval**. It is human-gated by design, not fully autonomous. **Status: experimental — the `ticket`/`pipeline` commands currently preview the planned phase sequence but do not yet execute it (the orchestration engine is on the roadmap, item A1).**

> Code: `src/cli/*`, `src/pipeline/*`.

---

## CLI commands

| Command | What it does |
|---|---|
| `agent-smith init` | Full setup: detect → adapt skills/docs → install MCPs, hooks, gate → write `CLAUDE.md` |
| `agent-smith analyze [--json] [--llm]` | Detect the stack and print a report (and the synthesized `StackProfile`); changes nothing |
| `agent-smith configure` | Re-run MCP configuration only |
| `agent-smith doctor` | Health check: MCP connections, skill validity, git state |
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
| **serena** | LSP symbol navigation + symbolic edits | `pipx install serena` (needs Python) | always | pip: `serena` |
| **playwright** | Browser automation — drive app, screenshot | npx (cache pre-warmed at install) | frontend detected | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) |
| **chrome-devtools** | Console/network/perf/lighthouse debugging | npx (cache pre-warmed at install) | frontend detected | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) |
| **sonarqube** | Static analysis — issues, quality gate, coverage | `npm i -g sonarqube-mcp-server` | `SONARQUBE_TOKEN` set | [sapientpants/sonarqube-mcp-server](https://github.com/sapientpants/sonarqube-mcp-server) |
| **sentrux** | Architectural sensor + quality gate | brew / curl / winget (shell) | always | [sentrux/sentrux](https://github.com/sentrux/sentrux) |
| **vuetify** | Vuetify 3 component API lookup | npx on first use | Vuetify frontend | [vuetifyjs/mcp](https://github.com/vuetifyjs/mcp) |
| **laravel-boost** | Laravel app intelligence — routes, models, schema | manual (`composer require laravel/boost --dev`) | Laravel backend | [laravel/boost](https://github.com/laravel/boost) |
| **obsidian** | Read/write a knowledge vault (**local scope, private**) | npx on first use | you provide a vault path | npm: `mcp-obsidian` |
| **mempalace** | Persistent knowledge-graph memory | `pipx install mempalace` (needs Python) | always | pip: `mempalace` *(no public repo listed)* |
| **jira** | Jira/Confluence issue tracking | npx on first use | `JIRA_API_TOKEN` set | npm: `@anthropic/jira-mcp` *(not yet published)* |

> Links marked *(no public repo listed)* / *(not yet published)* could not be verified against a public registry at the time of writing — they are ecosystem/internal or placeholder packages; the package name is shown so you can confirm before relying on it.

**Package managers used across these servers** (detected, never installed with `sudo`): **npm/npx** (Node — required), **Python + pipx** (serena, mempalace — pipx is the only one auto-bootstrappable, via `pip --user`), **Homebrew** (sentrux on macOS/Linux), **winget/choco** (sentrux/gh on Windows), **Composer + PHP** (laravel-boost). The **GitHub CLI (`gh`)** is also auto-installed best-effort for the PR workflows and needs a one-time `gh auth login`. If a required manager is missing, agent-smith prints how to install it and skips that server — it never blocks or prompts for a password.

---

## fable-mode — execution discipline

Every project Agent Smith sets up ships the **fable-mode** skill and surfaces it each session. On any task that spans multiple files, sources, or sessions, it makes the assistant:

1. **write a numbered stage plan** before touching anything,
2. **delegate** independent stages to sub-agents where possible,
3. **verify each stage with a check that can actually fail** (a test, a fetched source, a diff against spec — not "looks right"), and
4. **self-critique** before delivering.

It's a checklist for careful work, skipped for trivial one-pass tasks. (Vendored from [mrtooher/fable-mode](https://github.com/mrtooher/fable-mode).)

---

## Guardrails: the Sentrux quality gate

Sentrux measures structural health (coupling, dependency cycles, "god files," function complexity) and saves a **baseline**. Before changes land, the gate checks the code didn't get *worse* than the baseline. The baseline is a **ratchet** — it only ever moves up as quality improves, so the project can't silently erode.

> Run it yourself: `sentrux gate .`

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

In-depth, code-grounded docs live in the Obsidian vault under `vault/agent-smith/` (private per-developer).

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

## License

[MIT](LICENSE) © Agent Smith Contributors
