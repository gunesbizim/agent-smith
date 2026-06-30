---
title: Architecture
type: doc
tags: [agent-smith, architecture]
updated: 2026-06-29
---

# Architecture

Back to [[index]].

## Shape

Agent Smith is a TypeScript ESM CLI (`"type": "module"`, target Node ≥20). The binary
`bin/agent-smith.js` is a thin shim: it imports the compiled `dist/cli/index.js`, and on
failure falls back to running `src/cli/index.ts` via `tsx` (dev mode). The CLI is built with
**Commander**; each subcommand lazy-imports its implementation module so startup stays cheap.

GitNexus graph snapshot of the repo (from `gitnexus analyze`): **366 nodes, 375 edges, 154
clusters** — 185 Functions, 87 Files, 42 Interfaces, 39 Folders, 8 Methods, 4 Classes. The
codebase is function-oriented with a thin type layer (`src/shared/types.ts`).

## Source-tree map

```
bin/agent-smith.js          # CLI shim (dist → tsx fallback)
src/
├── index.ts                # library entry — public exports
├── cli/                    # Commander commands (one file per subcommand)
│   ├── index.ts            # program definition + run()
│   ├── init.ts             # full bootstrap orchestrator
│   ├── configure.ts        # MCP-only (re)configuration
│   ├── doctor.ts           # health check (read-only)
│   ├── analyze.ts          # detection report (+ --llm)
│   ├── ticket.ts           # Jira ticket → pipeline (stub, M6)
│   └── pipeline.ts         # run pipeline on branch (stub, M6)
├── analyze/                # DETECTION layer
│   ├── project-detector.ts # framework/language/ORM/DB/test/lint/CI detection
│   ├── package-scanner.ts  # lock-file → package category mapping
│   ├── architecture-sniffer.ts # arch patterns + probeSentrux()
│   ├── best-practice-mapper.ts # DetectedProject → TemplateVariables
│   ├── stack-types.ts      # evidence-driven detection contract (EvidenceFile/StackEvidence/StackProfile)
│   ├── stack-evidence.ts   # gatherStackEvidence() — collect manifests/CI verbatim (no interpretation)
│   ├── stack-synthesizer.ts# synthesizeStackProfile() — LLM pass + deterministic manifest fallback
│   ├── source-dir.ts       # resolve code directories
│   ├── llm-analyzer.ts     # opt-in LLM stack refinement
│   └── claude-runner.ts    # THE single `claude` CLI chokepoint
├── adapt/                  # GENERATION layer
│   ├── architecture-writer.ts # docs/architecture/* + .sentrux/rules.toml
│   ├── llm-architecture.ts # LLM-grounded architecture docs
│   ├── llm-skills.ts       # LLM-authored worker skills (fan-out)
│   ├── claude-md-writer.ts # write/refresh CLAUDE.md agent-smith managed block
│   ├── project-interview.ts# interactive conventions interview
│   ├── skill-customizer.ts # {{VAR}} substitution + framework strip
│   ├── template-engine.ts  # resolveAll / extractPlaceholders / validate
│   ├── skillgen-telemetry.ts # tally per-agent tool/MCP usage from the gen transcript → synthetic dashboard run
│   └── caveman-compress.ts # ~75% token compression of generated md
├── scaffold/               # FILE-EMISSION layer
│   ├── commands.ts         # write .claude/commands/as-*.md
│   ├── skills.ts           # write .claude/skills/**/SKILL.md
│   ├── configs.ts          # platform config (Cursor/Continue)
│   └── hooks.ts            # copy hook scripts + write hooks into settings.json
├── install/                # INSTALL layer
│   ├── registry.ts         # MCP server catalog (the source of truth)
│   ├── mcp-installer.ts    # install/configure/register MCP servers
│   ├── mcp-indexer.ts      # run each server's indexCommand after install (Step 11b)
│   ├── sentrux-installer.ts# scaffold .sentrux/rules.toml + baseline.json (idempotent)
│   └── dependency-checker.ts # Node/npm/git/Python/pipx/gh checks
├── engine/                 # RUNTIME ENGINE (A1 shipped) — `agent-smith run`
│   ├── tdd-engine.ts       # conductor: understand→red→plan→code→review→pr (opus plans, sonnet codes)
│   ├── agent-call.ts       # wraps runClaudeDetailed; emits agent_call event pair
│   ├── event-store.ts      # append-only events.jsonl (source of truth)
│   ├── run-state.ts        # pure projection of the log (resume/idempotency)
│   ├── run-dir.ts          # .agent-smith/runs/<id>/ layout + run-id
│   ├── red-proof.ts        # shared test-output parser (RED phase + TDD-gate hook)
│   ├── fingerprint.ts      # working-tree fingerprint (matches sentrux gate)
│   ├── gates.ts            # real human-approval gates
│   ├── parse.ts            # tolerant JSON extraction from model output
│   ├── prompts.ts          # phase prompt builders
│   └── events.ts           # event union + EngineEventInput
├── dashboard/              # local agent-call tracking UI (node:http + SSE)
│   ├── server.ts           # zero-dep server (127.0.0.1)
│   ├── event-source.ts     # EventSource seam (LocalFs now; remote/Azure later)
│   ├── normalize.ts        # events → RunDTO tree
│   ├── asset.ts            # resolve templates/dashboard/index.html
│   └── types.ts            # RunDTO / PhaseDTO / AgentCallDTO
├── pipeline/
│   ├── orchestrator.ts     # LEGACY stub — backs ticket/pipeline previews only
│   ├── branch.ts           # pure branch-hygiene policy (decideBranch) — fresh branch from updated main
│   └── ci-status.ts        # pure CI/Sonar gate (parseGhChecks/evaluateCi) for the green-wait loop
├── jira/
│   └── ticket-parser.ts    # parse ticket text; fetchJiraTicket (Atlassian MCP, best-effort)
├── docs/                   # doc-generation helpers (stubs)
│   ├── doc-generator.ts
│   ├── obsidian-writer.ts
│   └── screenshot-driver.ts
└── shared/
    ├── types.ts            # DetectedProject, TemplateVariables, etc.
    ├── templates.ts        # DEFAULT_TEMPLATE_VARS + resolveTemplate
    ├── platform-adapter.ts # platform-specific behavior
    └── platform-utils.ts   # findPython(), etc.
hooks/                      # runtime hook scripts shipped to projects
├── pre-compact-handoff.js  # PreCompact: snapshot branch/commits/status/open-PR before compaction (fail-open)
└── user-prompt-handoff-nudge.js # UserPromptSubmit: at ~60% context, suggest /as-handoff once per session (fail-open)
templates/                  # source templates for commands + skills
├── commands/as-handoff.md  # /as-handoff command template
└── skills/handoff/SKILL.md # handoff worker skill template (capture HANDOFF.md + delegate subtasks)
mcp/                        # reference MCP config bundles
.sentrux/                   # rules.toml + baseline.json (quality gate)
```

## Layered data flow (the `init` pipeline)

```
detectProject ──────┐
sniffArch ──────────┤→ DetectedProject + ArchitecturePattern[]
scanPackages ───────┤
gatherStackEvidence ┘   (manifests + CI collected verbatim)
        │                        │
        ▼                        │
synthesizeStackProfile ──────────┤  StackProfile (LLM pass + deterministic fallback)
   (the evidence-driven          │
    authority for the stack)     ▼
                       mapBestPractices  →  TemplateVariables (~70 keys)
                                │
            probeSentrux ───────┤ (seeds SENTRUX_MAX_CYCLES / MAX_CC)
            runInterview ───────┤ (overrides via applyInterviewAnswers)
                                ▼
   scaffoldCommands / scaffoldSkills / customizeSkills      → .claude/commands, .claude/skills
   writeArchitectureDocs (template or LLM)                  → docs/architecture/*
   generateSkills (LLM, optional)                           → rewrites .claude/skills
   writeSentruxRules                                        → .sentrux/rules.toml
   installSentrux (late step)                               → .sentrux/rules.toml + baseline.json
   configureMCPs / scaffoldConfigs                          → .mcp.json (all MCP scopes)
   scaffoldHooks                                            → hooks/* + settings.json hooks
   writeSourceConfig                                        → .claude/agent-smith/config.json
   runMcpIndexing (Step 11b)                                → gitnexus analyze, git-memory index
   writeClaudeMd (last step)                                → CLAUDE.md managed block
```

The **evidence-driven stack pipeline** (`gatherStackEvidence → synthesizeStackProfile →
mapBestPractices`, shared by `init` and `analyze`) is the authority for the backend stack and
every toolchain command: it reads the project's OWN declared manifests/CI (no per-language
branching) and never leaks a default stack — unknown fields stay null and emit honest "none".
See [[03-detection]].

`TemplateVariables` is the spine: detection + the synthesized `StackProfile` fill it, the
interview overrides it, and every generated file is rendered from it. See [[03-detection]] and
[[07-skills-and-commands#Template variables (the spine)]].

The two late `init`-only steps — `installSentrux` (writes `.sentrux/rules.toml` +
`baseline.json`, idempotent) and `writeClaudeMd` (writes the agent-smith managed block into
`CLAUDE.md`, non-destructive) — run after scaffolding so the managed block can enumerate every
command and skill just emitted.

## Public library surface (`src/index.ts`)

Agent Smith is also importable:

```typescript
import { detectProject, installMCPs, scaffoldSkills, customizeSkills } from "@gunesbizim/agent-smith";
```

## Known architecture debt

`sentrux check` flags the detection layer as the hotspot — `src/analyze/project-detector.ts`
holds the highest-complexity functions (`detectBackend` cc≈70, `detectFrontend` cc≈47,
`detectDatabase` cc≈45) and `src/cli/init.ts` is the one **god file** (fan-out 19). This is the
known target of the long-running quality-improvement plan. See [[08-sentrux-quality-gate]].
