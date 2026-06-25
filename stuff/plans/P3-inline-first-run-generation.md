# P3 — Inline first-run generation in `init`

**Goal:** After all install/scaffold steps complete, `init` automatically invokes headless
Claude Code to author the skills (with project MCP, per P2), gated to run **once per repo**
(marker), re-runnable via `--regen-skills`. This is the core orchestration change.

**Depth:** Long — this is the load-bearing item; trigger placement, gating, error handling,
hook suppression, and the claude-absent fallback all live here.

## Files

- **Edit** `src/cli/init.ts` — remove the current Step 8b inline call (lines ~208–219); add a
  new **final** generation step after hooks + CLAUDE.md are written.
- **Edit** `src/cli/index.ts` — add `--regen-skills` flag to the `init` command.
- **Edit** `src/adapt/llm-skills.ts` — `generateSkills()` gains options:
  `{ useProjectMcp, suppressHooks, regen }`; add marker read/write helpers.
- **New** `src/adapt/skill-gen-marker.ts` — `readMarker()/writeMarker()/markerPath()`.
- **Edit** `src/__tests__/adapt/llm-skills.test.ts` — gating + marker tests.

## Why the end of init (not Step 8b)

Step 8b runs *before* MCP install (Step 9), MCP config (Step 10), hooks (Step 11). The locked
design needs generation to run **after** the environment is fully configured, with the
project's `.mcp.json` present so P2 can point at it. So the call moves to a new step **after
Step 12 (CLAUDE.md)** — the last thing init does before the success banner.

## Approach

1. **Marker module** (`skill-gen-marker.ts`):
   - `markerPath(root)` → `<root>/.claude/.agent-smith/skills-generated.json`.
   - `readMarker` → parsed object or null; `writeMarker(root, {generatedAt, stack, skills, agentSmithVersion})`.
   - `generatedAt` is stamped by the **caller** (init has the clock) — keep the module pure.
2. **`generateSkills` changes:**
   - Accept `{ useProjectMcp, suppressHooks, regen }`.
   - Gate: if marker exists and `!regen` → return `{ ran:false, reason:"already generated (use --regen-skills)" }`.
   - When `useProjectMcp`, resolve the project `.mcp.json` path and pass it + `suppressHooks`
     into `runClaude` (P2).
   - On success, return the report payload (P4) so the caller renders + writes the marker.
3. **init final step:**
   - Only when `opts.llm !== false && !opts.dryRun`.
   - Spinner: "Generating skills with Claude (live project, MCP enabled)…".
   - Call `generateSkills(targetDir, { useProjectMcp:true, suppressHooks:true, regen:opts.regenSkills })`.
   - `ran:true` → write marker, hand the report to P4's renderer.
   - `ran:false` → warn with the reason; keep template-customized skills (current fallback).
4. **`--regen-skills`:** sets `opts.regenSkills`; bypasses the marker gate.

## Decisions / hazards

- **Hook suppression during the spawn (the issue flagged to you):** the spawned `claude -p`
  runs in the project dir, so it would otherwise load `.claude/settings.json` hooks — the
  sentrux-gate / git-guard PreToolUse hooks could block or slow the model's `Write` calls, and
  the doctor SessionStart adds noise. Decision: pass `suppressHooks:true` (P2) so generation
  runs with **MCP on, hooks off**. If the chosen claude version has no clean hook-disable flag,
  fallback is `--settings '{"hooks":{}}'` override for that invocation only.
- **No recursion risk:** init invokes claude directly; it is not itself a hook, and the spawned
  claude is not running `agent-smith init`, so there is no loop. (The SessionStart-hook design's
  recursion guard is therefore unneeded — dropped.)
- **claude absent / fails:** `runClaude` already returns null → `ran:false` → template skills
  stay, init still succeeds. Generation is best-effort, never blocks init.
- **`--dry-run` / `--no-llm`:** skip generation entirely (unchanged policy).
- **Marker commit policy:** generated skills + marker are committed (one-time per repo, not per
  teammate). Documented in P6; init does not auto-commit.
- **Marker is a D1 primitive.** The first-run marker is the simplest correction-artifact: a
  checked-in fact a re-run reads to skip work. Build it via D1's ledger module
  (`ground-truth.ts`) rather than a bespoke file, so generation later reads *confirmed values*
  (stack, commands) from the same ledger and skips re-inferring them (see
  [D1](D1-correction-artifact-loop.md)). Before invoking claude, P3 loads the ledger and passes
  confirmed values into the prompt as fixed ground truth.
- **Timeout:** keep the existing 600s `SKILLS_TIMEOUT_MS`; MCP boot adds startup latency, so
  consider bumping to 900s — decide during impl based on a real run.

## Verification (must be able to fail)

- Test: marker present + no `regen` → `generateSkills` returns `ran:false` with the
  "already generated" reason and does **not** invoke `runClaude` (spy asserts zero calls).
- Test: marker absent → `runClaude` invoked with `mcpConfigPath` pointing at the project
  `.mcp.json` and `suppressHooks:true`.
- Test: `regen:true` + marker present → `runClaude` invoked (gate bypassed).
- Test: `runClaude` returns null → `ran:false`, marker **not** written.
- Integration (manual, needs claude): run `init` on a Go fixture; assert skills rewritten with
  Go commands (no `ruff`/`pytest`), marker written, re-running `init` skips generation.

## Effort

~3–4 hrs. Risk: medium — hook-suppression mechanism is the main unknown; verify against the
installed claude CLI early.
