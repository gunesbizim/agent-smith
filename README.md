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

- **MCP servers** are configured so the assistant can query code structure, git history, and symbols.
- **Hooks** are registered (e.g. a SessionStart health check that also surfaces the fable-mode discipline every session).
- **Sentrux** is installed (`.sentrux/rules.toml` + a starter `baseline.json`) so architecture quality can be gated.
- A **managed block** is written into `CLAUDE.md` listing every command and skill — between `<!-- agent-smith:start -->` and `<!-- agent-smith:end -->`, so **your own notes in that file are never overwritten**.

> Code: `src/install/*`, `src/scaffold/hooks.ts`, `src/install/sentrux-installer.ts`, `src/adapt/claude-md-writer.ts`.

### 4. Operate — do the work, with a human in the loop

Now you (and the assistant) use the installed `/as-*` commands and skills. There's also a **semi-autonomous ticket-to-PR pipeline** — it can take a Jira ticket through plan → implement → test → review → docs → PR, **pausing at gates for human approval**. It is human-gated by design, not fully autonomous.

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

Useful flags: `--llm` / `--no-llm` (force or skip the Claude pass), `--dry-run` (show what would happen), `--auto` / `--no-interview` (skip the setup interview).

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
