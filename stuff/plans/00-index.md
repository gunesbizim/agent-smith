# Master Plan — Full Coverage of the Scorecard (A–C)

Complete plan set covering every item in `stuff/feature-scoring.md`. One plan file per item,
sized to its complexity. Phases are ordered by ROI and dependency, not by scorecard letter.

## Product vision — the correction-artifact loop (read first)

Agent-smith is **human-gated, not autonomous**. Its distinctive mechanism is the
**[D1 correction-artifact loop](D1-correction-artifact-loop.md)**: the AI flags its uncertainties
→ a human resolves only those → resolutions persist as checked-in artifacts → the next run reads
them as ground truth first, **skipping re-inference**. Each iteration is cheaper, more
deterministic, and more correct — "learning" via accumulated human-validated artifacts, **not**
reinforcement learning. D1 is the spine that unifies **A3, A11, C2, C4, P3, P4** (those plans were
reframed to consume it).

## Already done (no plan needed)

| Item | State |
|---|---|
| B4 — hardcoded versions | ✅ Go parsed via `goModVersion()`; residue (TS/Rust) folded into C2 |
| B5 — `--version` drift | ✅ CLI reads `pkg.version` |
| B6 — missing LICENSE | ✅ present + in `files` |

## Phase 0 — Honesty & cheap correctness (do first, ~1 day)

| Plan | Item | Depth |
|---|---|---|
| [B3](B3-sqlc-fabrication.md) | Stop fabricating `sqlc`/ORM — facts only, return null | Short |
| [B7](B7-insights-cli-drift.md) | Reconcile README `insights` vs registered CLI commands | Short |
| [B9](B9-pipeline-honesty.md) | Label `pipeline`/`ticket` stubs experimental in `--help` + README | Short |
| [B8](B8-substitution-ordering.md) | Run template substitution last / fixpoint loop | Short |

## Phase 1 — Skill generation on first init (delivers C1)

The original 6-file feature set. Keep as-is.

| Plan | Item | Depth |
|---|---|---|
| [P1](P1-externalize-prompt.md) | C1 — externalize generator prompt to `templates/prompts/` | Medium |
| [P2](P2-runclaude-mcp.md) | `runClaude` project-MCP access | Short |
| [P3](P3-inline-first-run-generation.md) | Inline first-run generation in `init` | Long |
| [P4](P4-skills-report.md) | Skills report output | Medium |
| [P5](P5-fallback-guard-fix.md) | Relax `backend-architecture.md` guard | Short |
| [P6](P6-docs-upkeep.md) | Vault docs upkeep | Short |

## Phase 2 — Dynamic detection core (the directive's spine)

| Plan | Item | Depth |
|---|---|---|
| [D1](D1-correction-artifact-loop.md) | **Correction-artifact loop** — ground-truth ledger + `confirm` (foundation for A3/A11/C2/C4/P3/P4) | Long |
| [B10](B10-detection-registry.md) | Collapse `project-detector.ts` to a facts-only registry | Long |
| [C2](C2-dynamic-detection.md) | Fully dynamic best-practice selection — no hardcoded stack values | Long |
| [B1](B1-finish-language-defaults.md) | Finish the Python-on-non-Python fix by routing through C2 | Short |
| [B11](B11-analyze-scanpackages.md) | Unify `analyze`/`init` analysis path (one function) | Short |
| [B2](B2-golden-fixture-test.md) | Golden per-stack fixture test (regression lock for B1/B10/C2) | Medium |

## Phase 3 — Generation quality completion

| Plan | Item | Depth |
|---|---|---|
| [C3](C3-decorate-stubs.md) | Decorate stubs to fit — rules sourced from C1, substitution-last | Medium |
| [C4](C4-existing-best-practices.md) | Programmatic detection of already-used best practices | Medium |

## Phase 4 — Part-A features that fit the current product (generated artifacts)

These ship as files the existing Claude Code runtime executes — no execution engine needed.

| Plan | Item | Depth |
|---|---|---|
| [A9](A9-permission-system.md) | Generated permission config + deny hooks per role | Medium |
| [A5](A5-debate-critics.md) | Multi-agent debate / critic panels as generated skills | Medium |
| [A2](A2-reasoning-execution-split.md) | Cognitive/execution boundary discipline (analyze→adapt→scaffold) | Medium |
| [A7](A7-hierarchical-planning.md) | Hierarchical planning tiers in smith-mode / skills | Short |

## Phase 5 — Execution-engine roadmap (prerequisite-gated)

**Hard prerequisite:** the pipeline orchestrator must become a real execution engine (today
`executePhase` returns hardcoded `success:true`). Until then these are roadmap, not backlog.
The realistic bridge is repeated headless-Claude orchestration (see A1).

| Plan | Item | Depth |
|---|---|---|
| [A1](A1-event-sourcing.md) | Event-sourced workflow engine (the foundation for the rest) | Medium |
| [A3](A3-confidence-scoring.md) | Confidence scoring per step | Short |
| [A10](A10-observability.md) | Native observability (traces/spans/replay) | Short |
| [A11](A11-determinism.md) | Determinism (pinned prompts, retrieval snapshots, replay) | Short |
| [A8](A8-cicd-first-class.md) | CI/CD first-class (scoped to generated workflows + smoke skills) | Short |
| [A4](A4-capability-contracts.md) | Capability contracts layered over prompt skills (hybrid) | Short |
| [A6](A6-ast-patching.md) | AST-aware patching — reassigned to the GitNexus layer | Short |

## Build waves

- **Wave 1:** Phase 0 (independent, cheap) ∥ Phase 1 (the feature). P3's marker is built as a
  D1 primitive.
- **Wave 2:** Phase 2 — **D1 ledger core first** (it tops C2's authority order), then
  B10 → C2 → B1, with B2 landing before C2 merges; B11 anytime.
- **Wave 3:** Phase 3 (depends on C1+C2+D1). Includes the **D1-scope of A3** (flag detection/
  generation uncertainties → human → ledger) and the **D1-backed determinism of A11** — both
  buildable here without the execution engine.
- **Wave 4:** Phase 4 (independent of 2/3; can start anytime after Phase 1).
- **Wave 5:** Phase 5 — only the *execution-loop* scopes of A1/A3/A10/A11 remain here; greenlit
  only if the engine is built, A1 first.

> Status: **awaiting verification.** No code written. Plans are specs, not implementations.
