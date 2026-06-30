---
title: Agent Smith — Documentation Home
type: moc
tags: [agent-smith, documentation, moc]
updated: 2026-06-29
---

# Agent Smith — Documentation Home

> **Map of Content (MOC).** This vault is the canonical, living documentation for the
> `@gunesbizim/agent-smith` project. It is generated and maintained from the real source
> tree. When the codebase changes, these notes must be updated (see the upkeep rule in the
> repo's `CLAUDE.md`).

## What Agent Smith is

A single npm CLI (`agent-smith`) that bootstraps a Claude Code project: it **detects** the
tech stack (evidence-driven — reading the project's own manifests/CI, not a fixed default),
**interviews** the developer about conventions, **scaffolds** project-aware skills/commands
(including the **smith-mode** execution-discipline skill), **installs and configures** MCP
servers, **generates** architecture docs and an architectural quality gate (`.sentrux/`), writes
an agent-smith-managed block into the project's `CLAUDE.md`, and is designed to drive a
**semi-autonomous (human-gated) ticket → PR pipeline**.

```bash
npx @gunesbizim/agent-smith init
```

## Read in this order

1. [[00-overview]] — the problem, the 4-step model, prerequisites, the whole picture
2. [[01-architecture]] — source-tree map, module layers, data flow, graph stats
3. [[02-cli-commands]] — every command (`init`, `analyze`, `configure`, `doctor`, `ticket`, `pipeline`) and flag
4. [[03-detection]] — how the stack is detected: the **evidence-driven** model (gather manifests/CI → synthesize a `StackProfile` → map), frameworks, packages, patterns, source dirs
5. [[04-generation-and-install]] — architecture docs, LLM skill authoring, interview, scaffolding, MCP install
6. [[05-hooks-and-events]] — **all hooks & Claude Code events** (SessionStart, PreToolUse, PostToolUse, Stop)
7. [[06-mcp-servers]] — every MCP server, its scope, transport, and role
8. [[07-skills-and-commands]] — generated `/as-*` commands and worker skills, template variables
9. [[08-sentrux-quality-gate]] — the deterministic architecture gate (baseline, rules, ratchet)
10. [[09-pipeline]] — the semi-autonomous (human-gated) PLAN→IMPLEMENT→TEST→REVIEW→DOCUMENT→PR flow
11. [[10-ci-release-deploy]] — GitHub Actions, release, SonarCloud, the Claude plugin
12. [[11-feature-guide]] — **full feature list & how to use** — every CLI command, `/as-*` command, worker skill, hook, MCP server, and the two delivery paths, each with a one-line "what it does" + exact usage

## Flows at a glance

- **Bootstrap flow** → [[02-cli-commands#init]] → [[03-detection]] → [[04-generation-and-install]]
- **Per-session safety flow** → [[05-hooks-and-events]] (health check in, change/gate check out)
- **Commit/push gate flow** → [[08-sentrux-quality-gate]] (PreToolUse on git commit/push/PR)
- **Documentation flow** → `/as-documentation` → `docs-backend` / `docs-frontend` → Obsidian ([[07-skills-and-commands]])
- **Semi-autonomous delivery flow** (human approval gates) → [[09-pipeline]]

## Conventions in this vault

- Each note is framework-agnostic where the code is; concrete examples are labelled as examples.
- Version drift is real and documented: see [[00-overview#Version map]].
- Facts here are sourced from the source tree (`src/`, `hooks/`, `templates/`, `mcp/`, `.github/`, `.sentrux/`).
