---
title: Overview
type: doc
tags: [agent-smith, overview]
updated: 2026-06-29
---

# Overview

Back to [[index]].

## The problem

Claude Code is powerful with MCP servers (gitnexus, git-memory, sentrux, playwright, …), but
standing them up for a new repo is tedious: configure a dozen MCP servers across multiple
JSON files, hand-write skills that reference the project's real commands, and teach Claude the
team's conventions — every time. Agent Smith automates that.

## The four-step model

| Step | Name | What happens | Notes |
|---|---|---|---|
| 1 | **Analyze** | Detect framework, language, ORM, auth, validation, logging, DB, cache, tests, lint, CI, monorepo. Detection is **evidence-driven**: it gathers the project's OWN declared manifests/CI verbatim, then synthesizes a `StackProfile` (LLM pass + deterministic fallback, no per-language branching) that becomes the authority for the backend stack and real toolchain commands — unknown fields stay "none", never a default stack | [[03-detection]] |
| 2 | **Interview** | Ask the developer ~11 questions about conventions (branch naming, commit format, PR checklist, testing, architecture rules, security, code style, cycle policy, max complexity). Saved to `docs/architecture/decisions.md` | [[04-generation-and-install#Project interview]] |
| 3 | **Scaffold** | Generate `/as-*` commands + worker skills customized to the detected stack; optionally LLM-author them grounded in real code | [[07-skills-and-commands]] |
| 4 | **Configure** | Write `.claude/settings.json` (hooks/permissions only), `.mcp.json` (**all** MCP server scopes — project/user/local), `docs/architecture/`, `.sentrux/rules.toml` + `baseline.json`; write the agent-smith-managed block into `CLAUDE.md` | [[06-mcp-servers]], [[08-sentrux-quality-gate]] |

End state: restart Claude Code and run `/as-backend`, `/as-frontend`, `/as-test`,
`/as-pr-review`, `/as-documentation`, `/as-ship`, `/as-insights`, `/as-caveman`, `/as-handoff` —
all referencing the actual stack (`/as-git` was removed; commit/push is handled by `/as-ship`).
The scaffolded **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`) is also installed
and is pointed to from the `CLAUDE.md` managed block: it enforces staged execution discipline
(stage map → delegate → failable verification → self-critique) for any task spanning multiple
files, sources, or sessions.

## Two LLM modes

Agent Smith shells out to the `claude` CLI as its LLM engine via a single chokepoint
(`src/analyze/claude-runner.ts → runClaude()`), in two shapes:

1. **Isolated classification** — stack detection refinement. Runs in a private temp dir with
   **no tools and no MCP** (`--strict-mcp-config --mcp-config {}`), inline manifest evidence,
   single-turn JSON. See [[03-detection#LLM refinement]].
2. **Grounded generation** — architecture docs and skill authoring. Runs **inside the repo**
   with file tools (Read/Glob/Grep, plus Write/Task for skills) so it inspects the real code.
   See [[04-generation-and-install]].

LLM use is **on by default when the `claude` CLI is present**, and disabled with `--no-llm`
(mirrors how documentation generation works — no separate opt-in flag). Every LLM path is
best-effort: any failure falls back to deterministic templates.

## Prerequisites

| Requirement | Why |
|---|---|
| Node.js ≥ 20 | Runtime for the CLI and JS MCPs (gitnexus, git-memory, playwright, …). `package.json` engines = `>=20`. |
| git ≥ 2.30 | Required by git-memory, gitnexus, all git ops |
| Python ≥ 3.12 | mempalace (memory graph) — installed via pipx |
| pipx | Isolated Python installer for mempalace |
| GitHub CLI (`gh`) | PR creation in the pipeline (optional) |

Platforms: macOS, Linux, Windows (PowerShell/WSL2). Detection in
`src/install/dependency-checker.ts` is platform-aware.

## Version map

> Versions are kept in sync across manifests on each release — bump them together.

| Artifact | Declares version |
|---|---|
| `package.json` | **1.1.0** (the authoritative package version) |
| `src/cli/index.ts` | reads `package.json` at runtime — `agent-smith --version` prints the real version (no longer a hardcoded `0.1.0`) |
| `.claude-plugin/plugin.json` | `1.1.0` (in sync with `package.json`) |
| `sonar-project.properties` | `sonar.projectVersion=1.1.0` (in sync) |

The authoritative version is `package.json`. The CLI reads it dynamically, so it can no
longer drift; `.claude-plugin/plugin.json` and `sonar-project.properties` are bumped to match
on each release. Latest release: **v1.1.0** (see [[10-ci-release-deploy#Release — `release.yml`]]).

## Verification

```bash
npm run typecheck   # tsc --noEmit — zero type errors
npm test            # vitest — 999 tests across 92 files (current)
sentrux gate .      # architectural regression gate (see [[08-sentrux-quality-gate]])
```

> Keep this count in sync as tests are added (the README and this note both cite the live total).
