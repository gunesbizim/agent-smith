# Agent Smith — Feature & Finding Scorecard

> Evaluation of the proposed architectural improvements and the correctness review,
> scored 0.00–100.00 for **Plan quality** and **Implementation readiness**, with
> reasoning grounded in the actual v0.8.0 source tree (not the report's assumed v0.4.0).
>
> Generated 2026-06-17. Each score was checked against real code before being assigned.

---

## How the scores work

Two independent axes per item, each 0.00–100.00:

- **Plan score** — Is the *idea* sound for *this* product? Does it match Agent Smith's
  actual job (a CLI that scaffolds Claude Code skills/commands and detects stacks), or is
  it borrowed from a different category of tool (Temporal, LangGraph, an enterprise agent
  platform)? High = right problem, right shape, clear payoff. Low = impressive but
  misaligned with what this codebase is.
- **Impl score** — How successfully could it be *built here today*, and for bug findings,
  *how done is it already*? Weighs: surface area of the change, whether the runtime even
  supports it (the CLI does not host the model — Claude Code does), and existing code state.

**Composite** = `Plan × 0.45 + Impl × 0.55`. Implementation is weighted higher because a
brilliant plan the CLI architecturally cannot host is worth less than a modest fix that ships.

A blunt anchor for calibration: a "perfect" item (clearly right for this product *and*
a few hours of in-repo work) lands ~90; a "wrong tool entirely, would need a rewrite"
item lands ~25 even if the idea is industry best-practice in the abstract.

---

## Design directive (supersedes the per-language-table recommendation)

**Decision (2026-06-17):** Best-practice selection will be **fully dynamic — no language or
tech-stack values hardcoded in source.** The flow:

1. **Programmatic, active stack detection** infers the real stack from the actual project
   (deps, configs, source) — facts only, no fabricated defaults.
2. **Prompt generation moves out of TypeScript into external files** (`.md`/`.txt`): a
   *prompt-generator rules file* (the rules the generator must follow) plus *example prompt
   stubs*. The generator **reads** these at runtime instead of constructing prompt strings in
   code.
3. The model is fed `rules + example stub + detected facts` and **decorates/augments** the
   stub — adding project-specific information so each generated skill is a perfect fit for the
   scanned project, rather than a template-substituted generic.
4. **Already-used best practices are first-class:** detect what the project *already does* and
   codify those as the baseline, layering recommendations on top — never overwrite a working
   convention with a generic one.

This **reframes Part B's headline fixes.** B1 ("per-language defaults table") and B10
("data-driven detection *registry*") are no longer the target architecture: a static table is
still hardcoded knowledge. Detection stays programmatic and data-driven, but the *best-practice
commands themselves* are generated from external prompt files + detected facts, not looked up
in a baked-in language→command map. Scores for those items are revised below, and the new
architecture is scored in **Part C**.

The codebase is already partway there: `src/adapt/llm-skills.ts` regenerates each
`SKILL.md` via the LLM from the real code and existing stubs, and explicitly tells the model to
*"Codify the project's EXISTING best practices"* (line 101) — i.e. item 4 above already exists
in spirit. The unmet piece is item 2: `buildMasterSkillPrompt()` builds the prompt as a
hardcoded TypeScript string array; the rules + example stubs are **not** yet externalized into
editable `.md`/`.txt` files.

---

## Part A — Architectural improvement proposals

A recurring discount applies to most of these: **Agent Smith is a scaffolder, not a
runtime.** The actual planning/coding/testing happens inside Claude Code via generated
skills. `src/pipeline/orchestrator.ts` proves the point — `executePhase` returns hardcoded
`{ success: true, summary }` strings; it does not execute anything. So features that assume
Agent Smith *runs the agent loop* (event sourcing, confidence scoring, observability,
determinism, debate trees) are scoring a product that doesn't exist yet. They're not wrong —
they're a roadmap for turning the stub orchestrator into a real one, which is a different and
much larger product.

### A1. Event-sourced workflow engine
- **Plan: 71.00** — Genuinely the highest-value *architectural* idea in the list, and the
  author is right that it subsumes resumability/replay/audit. But it presumes the CLI owns
  execution. Today it owns scaffolding. As a plan for a *future* orchestrator it's excellent;
  as a plan for the current product it's premature.
- **Impl: 34.00** — `runPipeline` already has the skeleton (phase list, `phasesCompleted`,
  approval gates) so an event log is a natural graft — but every phase is a stub. You'd be
  building the engine and the work it logs simultaneously. Large, multi-month.
- **Composite: 50.65**

### A2. Separate reasoning from execution (cognitive vs execution layer)
- **Plan: 82.00** — Best plan-to-fit ratio in the list. It's a *discipline*, not a platform,
  and it maps onto a real latent bug the review already flagged: `applyFrameworkCustomizations`
  mutating template output after substitution. "Cognitive layer never mutates state" is exactly
  the invariant that would have prevented that ordering hazard.
- **Impl: 58.00** — Partially expressible today by hardening the analyze→adapt→scaffold
  boundary (detection produces facts; scaffolding consumes them; nothing writes back). Real,
  in-repo, incremental. The full cognitive/execution split only matters once execution exists.
- **Composite: 68.80**

### A3. Confidence scoring per step
- **Plan: 64.00** — Right instinct, and it pairs naturally with the existing approval gates
  (`shouldPause`). But it's only meaningful once steps *do* something — scoring the confidence
  of a stub that always returns `success: true` is theater.
- **Impl: 30.00** — Trivial to emit a number; near-impossible to make that number *honest*
  without a real execution layer and an eval harness behind it. The hard part is calibration,
  which has no home in the current code.
- **Composite: 45.30**

### A4. Capability contracts replacing prompt-centric skills
- **Plan: 60.00** — Conceptually attractive (composable/testable/versionable). But it
  misreads the product: skills here are deliberately Markdown prompts *for Claude Code*, not
  callable APIs. Turning them into typed contracts fights the host runtime's grain.
- **Impl: 41.00** — You could add a contract layer (inputs/outputs/constraints frontmatter)
  on top of the existing template variables without throwing away the prompt body — a hybrid.
  Full "skills become APIs" is a rewrite of the scaffold layer for unclear gain.
- **Composite: 49.55**

### A5. Multi-agent debate trees (security/perf/DX/simplicity critics)
- **Plan: 74.00** — Strong fit: the project *already* ships per-dimension reviewers
  (`pr-review-backend`, `pr-review-frontend`) and orchestrators that dispatch into fresh
  subagents. Debate/critic panels are the natural next step and align with smith-mode's
  delegate-and-verify ethos. This is the most "already half-believed by the codebase" idea.
- **Impl: 62.00** — Implementable *as generated skills/commands* (a `/pr-review` that fans
  out to N adversarial critics, then synthesizes). Doesn't require the CLI to host the loop —
  Claude Code does. That's why its Impl score beats the runtime-bound proposals.
- **Composite: 67.40**

### A6. AST-aware / patch-level editing (tree-sitter, symbol patching)
- **Plan: 45.00** — Good idea for a *coding* agent. Agent Smith barely edits user code — it
  writes new scaffold files and substitutes template variables. The whole premise ("agents
  rewrite too much") targets a behavior this tool doesn't have. GitNexus (the indexer it
  integrates) is the place this belongs, not the scaffolder.
- **Impl: 38.00** — Heavy dependency (tree-sitter grammars per language) for a need the
  current code doesn't exhibit. Low ROI here.
- **Composite: 41.15**

### A7. Hierarchical planning (strategic → tactical → atomic)
- **Plan: 66.00** — Sensible and it dovetails with smith-mode's existing "stage map" doctrine,
  which is already a flat version of this. Formalizing tiers is a real refinement.
- **Impl: 48.00** — Expressible in the skill prompts and the pipeline's phase model, but again
  gated on the pipeline being real. Today it'd be aspirational prose in a stub.
- **Composite: 56.10**

### A8. CI/CD as first-class (preview envs, canary, rollback)
- **Plan: 52.00** — "Value starts after the PR" is a sharp observation, but this is a
  platform-sized ambition bolted onto a scaffolding CLI. It's a different company's product.
  Scoped down to "generate CI workflow files / smoke-test skills," it's reasonable.
- **Impl: 33.00** — Owning ephemeral environments and canary deploys is enormous and largely
  out of scope for a tool whose deploy story is "push to GitHub, let CI run."
- **Composite: 41.55**

### A9. Real permission system (command allowlists, secret/network isolation)
- **Plan: 78.00** — Highest-value *safety* item, and uniquely well-aligned: it's defensive,
  concrete, and the example (`backend-dev: shell.allowed: [npm test]; denied: [rm -rf]`) maps
  directly onto Claude Code's existing settings/permissions and hook model the repo already
  uses. This is the one "enterprise" feature that fits the current product cleanly.
- **Impl: 64.00** — Much of this is *configuration generation* — emit `settings.json`
  permission blocks and PreToolUse deny hooks from a per-role policy. The repo already scaffolds
  hooks (`src/scaffold/hooks.ts`), so there's a real landing zone. Full isolation (network,
  secrets) is harder and partly the host's job.
- **Composite: 70.30**

### A10. Native observability (traces, spans, token timelines, replay)
- **Plan: 58.00** — "OpenTelemetry for AI agents" is a fine vision and partly *already served*
  by the bundled `claude-tokenstein` MCP (token timelines exist). Overlap lowers novelty;
  alignment raises fit. Net: middling.
- **Impl: 36.00** — Real tracing requires owning the execution loop (same blocker as A1/A3).
  Token accounting is already external. Building spans/replay in a scaffolder is a stretch.
- **Composite: 45.90**

### A11. Determinism (temperature profiles, seeds, immutable contexts, replay)
- **Plan: 49.00** — "Why did run #493 differ?" is a real enterprise demand, but determinism
  is largely the *model provider's* surface, not the scaffolder's. Agent Smith can pin prompts
  and snapshot retrieval; it cannot make Claude deterministic.
- **Impl: 31.00** — Immutable contexts and retrieval snapshots are feasible; seeds/temperature
  determinism is not something this layer controls. Mostly out of reach.
- **Composite: 39.10**

---

## Part B — Correctness review findings

These score differently: **Plan** = how correct/valuable the diagnosis is, **Impl** = how
*done* the fix is in the current tree (verified against v0.8.0 source). Several were already
fixed between the report's v0.4.0 and today.

### B1. Headline: Python tooling emitted on non-Python projects
- **Plan: 90.00** — The *diagnosis* is still the highest-leverage finding: a Go skill must not
  carry `ruff`/`pytest`. Docked from 96 because the report's *prescription* — "a small
  per-language table, Django is one row" — is **superseded by the design directive above**:
  a static table is still hardcoded stack knowledge. The correct target is dynamic detection
  feeding an externalized prompt generator (see Part C), so the fix is reframed, not the bug.
- **Impl: 70.00** — **Largely addressed already.** `src/analyze/best-practice-mapper.ts` now
  has per-language blocks (e.g. Rust → `cargo check`) and a config-object path
  (`c.test/c.lint/c.format/c.migrate` at lines 250–254) instead of a global Django default;
  line 207 explicitly guards against "stack-agnostic DEFAULT_TEMPLATE_VARS leak through as if
  analyzed." The headline breakage is no longer reproducible. But note: this static mapper is
  exactly the layer the directive wants to *thin out* in favor of Part C, so its current form
  is a transitional fallback, not the destination.
- **Composite: 79.00**

### B2. Golden-output fixture test (init against Go/Rust/NestJS/Django, assert no Python tooling)
- **Plan: 93.00** — The single most valuable *preventive* item. One test that would have caught
  B1 and guards every future detection change. Exactly where the review's instincts are sharpest.
- **Impl: 55.00** — Not present as a golden end-to-end fixture suite; the repo has unit tests
  under `src/__tests__/` but no per-stack init→assert-commands harness. Straightforward to
  build (fixture repos already partially exist in `fixtures.ts`), high ROI, not yet done.
- **Composite: 72.10**

### B3. `sqlc` fabrication + self-contradicting ORM output
- **Plan: 88.00** — Correct and still relevant. Presenting a guess as a detected fact, then
  writing it into skills, is a real trust bug.
- **Impl: 22.00** — **Still live.** `project-detector.ts:1076` still returns
  `{ engine: "postgresql", orm: "sqlc" }` for any pgx/lib-pq project, while the Echo branch
  hardcodes `orm: null` — the exact contradiction the report described. Unfixed.
- **Composite: 51.70**

### B4. Hardcoded language versions (Go 1.25/1.22, TS 5.x)
- **Plan: 90.00** — Right: fabricated versions contradicting the "exact versions" promise.
- **Impl: 78.00** — **Mostly fixed.** Go now parses the real directive via `goModVersion()`
  (`project-detector.ts`) and a sibling `go 1.22 → "1.22"` parser exists in
  `stack-synthesizer.ts:380`. TS frameworks may still be stamped; Rust still reports `"stable"`
  rather than a toolchain version. Largely resolved, residue remains.
- **Composite: 83.40**

### B5. `--version` reported 0.1.0 vs manifest
- **Plan: 80.00** — Valid honesty/consistency bug at time of writing.
- **Impl: 100.00** — **Fixed.** `cli/index.ts:19` now reads `pkg.version` dynamically;
  `package.json` is 0.8.0 and the CLI tracks it. Fully resolved.
- **Composite: 91.00**

### B6. Missing LICENSE despite `files` array / MIT claim
- **Plan: 72.00** — Real packaging correctness issue (npm publish warning).
- **Impl: 100.00** — **Fixed.** `LICENSE` exists at repo root and is listed in `files`.
- **Composite: 87.40**

### B7. README documents `insights` CLI command that isn't registered
- **Plan: 76.00** — Correct doc/CLI drift.
- **Impl: 20.00** — **Still live.** `cli/index.ts` registers only
  `init/configure/analyze/doctor/ticket/pipeline`; no `insights` command. Either register it or
  fix the README — neither done. (Note: `/insights` exists as a *skill*, which may be the source
  of confusion, but the CLI command the README implies does not exist.)
- **Composite: 45.20**

### B8. Latent: substitution ordering / `applyFrameworkCustomizations` re-injecting placeholders
- **Plan: 84.00** — Sharp catch of a fragile ordering even though it didn't fire. "Run
  substitution last, or loop until stable" is the right fix and ties directly to A2.
- **Impl: 40.00** — Not verified as hardened; remains an ordering hazard absent a guard or a
  fixpoint loop. Cheap to fix, not confirmed fixed.
- **Composite: 59.80**

### B9. Pipeline honesty gap (ticket/pipeline commands are stubs printing success)
- **Plan: 91.00** — The most important *honesty* finding. A user running
  `agent-smith ticket PROJ-123 --auto` sees "PR created" with no PR. Option (a) — label as
  experimental — is the correct 20-minute fix.
- **Impl: 18.00** — **Still a stub.** `orchestrator.ts` `executePhase` returns hardcoded
  `success: true` summaries for every phase; no real orchestration, and the commands are not
  labeled experimental in `--help`. Unaddressed.
- **Composite: 50.85**

### B10. Maintainability: data-driven detection registry + fs-helper consolidation
- **Plan: 88.00** — Still correct, and *more* aligned under the directive: collapse
  `project-detector.ts`'s ~1,260 lines of repeated `BackendInfo` literals into a
  `{ marker, framework, language }` table that emits **detected facts only** (no `defaults`
  field — best-practice commands now come from Part C, not the registry). Bumped from 86
  because removing the `defaults` responsibility makes the registry purely about *detection*,
  which is the clean separation the directive demands.
- **Impl: 28.00** — Not done; the duplication the report described is still present verbatim
  (each Go/Rust framework re-spells the full literal). Large refactor, high downstream payoff,
  untouched. Prerequisite for B3's `sqlc`-fabrication fix to be a one-line change.
- **Composite: 55.00**

### B11. `analyze` doesn't call `scanPackages` (analyze --json omits version data)
- **Plan: 74.00** — Reasonable consistency finding (init and analyze should share one path).
- **Impl: 45.00** — Partially mooted: `analyze.ts` now emits a rich `--json` payload
  (`project, patterns, stackProfile, templateVariables`). Whether it routes through the same
  `scanPackages` path as init is not confirmed; treat as partially addressed.
- **Composite: 57.05**

---

## Part C — The dynamic prompt-generation architecture (the directive)

Scored as a forward design, not a past finding. **Plan** = soundness/fit of the approach for
this product; **Impl** = how buildable here today given existing seams.

### C1. Externalize the prompt generator into editable `.md`/`.txt` files (rules + example stubs)
- **Plan: 88.00** — Strong fit and the keystone of the directive. Moving the generator's rules
  and example stubs out of `buildMasterSkillPrompt()`'s hardcoded string array into versioned
  files makes the generator **inspectable, diffable, and tunable without a code change** — and
  lets non-TS contributors edit prompt behavior. Matches how the repo already treats `templates/`
  as data. Docked slightly: needs a clear contract (where files live, how they're discovered,
  what variables they expose) or it becomes a second hidden config surface.
- **Impl: 66.00** — High readiness. The runtime already calls the model
  (`runClaude` in `claude-runner.ts`) and already assembles a master prompt; this is a
  *refactor* — replace the in-code string array with a file read + light interpolation, ship
  the rules/stubs under `templates/prompts/`. Bounded, testable, no new runtime dependency.
- **Composite: 75.90**

### C2. Fully dynamic, programmatic stack detection drives best practices (no hardcoded stack values)
- **Plan: 85.00** — The directive's core principle and the right one: facts come from the
  project, not from baked-in tables. Resolves the whole class of B1/B3/B4 bugs at the root —
  you can't emit `ruff` on Go or fabricate `sqlc` if nothing is hardcoded. Small risk: "detect
  everything dynamically" can under-detect on exotic stacks, so a *labeled, honest* "unknown →
  ask / omit" path is mandatory (ties to B3: return `null`, never guess).
- **Impl: 52.00** — Detection already exists and is largely programmatic; the work is
  *removing* the static defaults (best-practice-mapper's command tables) and routing those
  decisions through C1 instead. Medium effort, gated on C1 landing first, and needs the B2
  fixture suite to prove no regression across stacks.
- **Composite: 66.85**

### C3. Decorate/augment stubs to perfectly fit the scanned project
- **Plan: 83.00** — The payoff step, and well-matched: the goal is project-specific skills, not
  generic ones. "Take the example stub, preserve its intent, inject what *this* repo actually
  does" is precisely what `buildMasterSkillPrompt()` already instructs (read stubs, preserve
  INTENT, replace ALL stack assumptions). The directive sharpens it to "decorate, don't
  replace."
- **Impl: 60.00** — Substantially present in `llm-skills.ts`/`llm-architecture.ts` today; the
  delta is sourcing the decoration rules from C1's files and ensuring substitution runs last
  (ties to B8 — the placeholder-reinjection hazard is the main risk to "perfect fit" output).
- **Composite: 70.35**

### C4. First-class "respect already-used best practices"
- **Plan: 86.00** — The most defensible idea in the directive: never overwrite a working
  project convention with a generic recommendation; codify what exists, then layer suggestions.
  Directly raises output trust and avoids the "tool fought my setup" failure mode.
- **Impl: 64.00** — **Already exists in spirit** — `llm-skills.ts:101` tells the model to
  "Codify the project's EXISTING best practices," and best-practices.md is split into
  existing + recommended. The remaining work is making detection of existing conventions
  *programmatic and verifiable* (not solely model-inferred) and feeding those facts into C1's
  prompt. Good seam, real partial implementation.
- **Composite: 73.90**

---

## Composite ranking (all items, high → low)

| Rank | Item | Plan | Impl | Composite | Status |
|------|------|------|------|-----------|--------|
| 1 | B5 — version string drift | 80.00 | 100.00 | **91.00** | ✅ fixed |
| 2 | B6 — missing LICENSE | 72.00 | 100.00 | **87.40** | ✅ fixed |
| 3 | B4 — hardcoded versions | 90.00 | 78.00 | **83.40** | 🟡 mostly fixed |
| 4 | B1 — Python tooling on non-Python | 90.00 | 70.00 | **79.00** | 🟡 mostly fixed (reframed) |
| 5 | C1 — externalize prompt generator | 88.00 | 66.00 | **75.90** | 🟢 directive, high readiness |
| 6 | C4 — respect existing best practices | 86.00 | 64.00 | **73.90** | 🟡 partial (exists in spirit) |
| 7 | B2 — golden fixture test | 93.00 | 55.00 | **72.10** | 🔴 not done |
| 8 | C3 — decorate stubs to fit project | 83.00 | 60.00 | **70.35** | 🟡 partial |
| 9 | A9 — permission system | 78.00 | 64.00 | **70.30** | 🔴 roadmap |
| 10 | A2 — reasoning/execution split | 82.00 | 58.00 | **68.80** | 🟡 partial |
| 11 | A5 — multi-agent debate/critics | 74.00 | 62.00 | **67.40** | 🟡 partial |
| 12 | C2 — fully dynamic detection (no hardcoded) | 85.00 | 52.00 | **66.85** | 🟢 directive, gated on C1 |
| 13 | B8 — substitution ordering | 84.00 | 40.00 | **59.80** | 🔴 latent |
| 14 | B11 — analyze/scanPackages share | 74.00 | 45.00 | **57.05** | 🟡 partial |
| 15 | A7 — hierarchical planning | 66.00 | 48.00 | **56.10** | 🔴 roadmap |
| 16 | B10 — detection registry refactor | 88.00 | 28.00 | **55.00** | 🔴 not done |
| 17 | B3 — sqlc fabrication | 88.00 | 22.00 | **51.70** | 🔴 live bug |
| 18 | B9 — pipeline honesty/stub | 91.00 | 18.00 | **50.85** | 🔴 live |
| 19 | A1 — event sourcing | 71.00 | 34.00 | **50.65** | 🔴 roadmap |
| 20 | A4 — capability contracts | 60.00 | 41.00 | **49.55** | 🔴 roadmap |
| 21 | A10 — observability | 58.00 | 36.00 | **45.90** | 🔴 partly external |
| 22 | A3 — confidence scoring | 64.00 | 30.00 | **45.30** | 🔴 roadmap |
| 23 | B7 — insights CLI drift | 76.00 | 20.00 | **45.20** | 🔴 live |
| 24 | A8 — CI/CD first-class | 52.00 | 33.00 | **41.55** | 🔴 out of scope |
| 25 | A6 — AST patching | 45.00 | 38.00 | **41.15** | 🔴 wrong layer |
| 26 | A11 — determinism | 49.00 | 31.00 | **39.10** | 🔴 mostly external |

---

## Thought process — the load-bearing judgments

1. **I scored against real code, not the report's snapshot.** The report assumed v0.4.0; the
   tree is v0.8.0. Five findings (B4, B5, B6, B1, partially B11) were already fixed or largely
   fixed. Scoring them as open bugs would have been wrong, so their Impl scores reflect "done,"
   which is *why they top the ranking* — a shipped fix beats a great unbuilt idea under the
   55/45 weighting.

2. **The single biggest discriminator is "does this fit a scaffolder or an agent runtime?"**
   Agent Smith generates Claude Code skills/commands and detects stacks. It does **not** host
   the model loop — `executePhase` is a stub. So the glamorous platform features (A1 event
   sourcing, A3 confidence, A10 observability, A11 determinism) are scoring a product that
   isn't here yet. They cluster in the bottom half not because they're bad ideas — several are
   industry best-practice — but because their Impl is gated on building an execution engine
   first. They're a roadmap, not a backlog.

3. **The features that fit ride the existing seams.** A5 (debate/critics) and A9 (permissions)
   score highest among proposals precisely because the repo *already* has the seam: per-dimension
   reviewers + subagent dispatch for A5, and hook/settings scaffolding for A9. They're
   expressible as generated artifacts, so Claude Code hosts the runtime, not the CLI.

4. **The two highest-value *unbuilt* items are B2 (golden fixture test) and B9/B3 (the live
   honesty/fabrication bugs).** B2's plan score (93) reflects that one test would have caught
   the headline bug and guards every future change — the cheapest insurance in the document.
   B3 and B9 carry high Plan scores but low Impl scores because they are *still live* and are
   the items I'd fix first: a user can still get `orm: sqlc` they never used, and still see
   "PR created" from a command that creates no PR.

5. **Where I was harshest.** A6 (AST patching) and A11 (determinism) target behaviors this
   product doesn't exhibit (it barely edits user code; it can't make the model deterministic).
   Borrowing a best-practice from the wrong tool category is a plan defect, so their Plan
   scores are low even though the ideas are respectable elsewhere.

## Recommended order of work (ROI, not score) — directive-aligned

1. **B3 + B9 + B7** — stop fabricating `sqlc`/ORM (return `null` when unproven), and label
   `pipeline`/`ticket`/`insights` honestly in `--help` and README. Cheap, kills the worst
   trust gaps, and B3 is a down-payment on C2's "facts only, never guess" principle.
2. **C1 — externalize the prompt generator** into `templates/prompts/` (rules file + example
   stubs), refactor `buildMasterSkillPrompt()` to read them. Keystone of the directive and the
   highest-readiness new item; everything else in Part C depends on it.
3. **B2 — golden per-stack fixture test** (Go/Rust/NestJS/Django → assert correct commands, no
   Python tooling). Required *before* C2 so removing static defaults can be proven safe.
4. **C2 — thin out static best-practice tables**, route command/best-practice decisions through
   C1 + detected facts. Gated on C1 and B2.
5. **B10 — detection registry refactor** to facts-only (no `defaults` field); makes B3/B4
   residue one-line and supports C2.
6. **C4 + C3 + B8** — make "respect existing best practices" programmatic (not solely
   model-inferred), source decoration rules from C1, and enforce substitution-last to kill the
   placeholder-reinjection hazard.
7. **A2 / A9 / A5** — boundary discipline, generated permission config, critic panels: the
   proposals that fit the current product.
8. Defer A1/A3/A10/A11 until/unless the orchestrator becomes a real execution engine.

---

### Self-critique (one named weakness)

The 55/45 Impl-weighting structurally rewards already-shipped fixes (B5, B6 top the table) and
penalizes ambitious-but-correct architecture (B10 registry at 54, A1 at 50). A reader optimizing
purely for the composite column could wrongly conclude "the LICENSE was more important than the
detection-registry refactor." It wasn't — B10 is the structural fix that makes half the other
bugs cheap. The composite measures *shippability-adjusted value this week*, not strategic value;
read the Plan column alone (B1 96, B2 93, B9 91, B4 90) for "what matters most if effort were
free." Also: B11 and B4's residue (TS/Rust versions) are scored "partial" from a static read,
not from running `analyze` against fresh fixtures — a fixture run (i.e. B2 itself) would tighten
those two Impl numbers and is the obvious next verification step.

Second weakness, specific to Part C: the directive's Impl scores (C1 66, C2 52, C3 60) credit
the existing `llm-skills.ts`/`runClaude` seams generously, but they assume the **LLM path is
reliably available**. `generateSkills()` is explicitly best-effort — it silently falls back to
template-substituted stubs when Claude isn't reachable. So a "fully dynamic, nothing hardcoded"
product still needs a *non-LLM fallback*, which means the static mapper (B1/C2's target for
deletion) cannot be fully removed — only demoted. If that fallback is dropped entirely, offline/
no-key runs degrade to generic skills with no safety net. The honest framing is "LLM-primary,
static-fallback," not "no hardcoded stack values anywhere" — and C2's Impl score would drop
into the 40s if the directive is read as *literally* zero static knowledge.
