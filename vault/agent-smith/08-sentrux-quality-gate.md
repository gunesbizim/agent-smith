---
title: Sentrux Quality Gate
type: doc
tags: [agent-smith, sentrux, quality-gate]
updated: 2026-06-26
---

# Sentrux Quality Gate

Back to [[index]]. Agent Smith's deterministic architectural regression gate. Files:
`.sentrux/rules.toml`, `.sentrux/baseline.json`, `.sentrux/.gate-cache.json` (runtime). Enforced
by [[05-hooks-and-events#PreToolUse (Bash) #2 — `pre-tool-sentrux-gate.js` (the deterministic gate)|the PreToolUse sentrux-gate hook]]
and re-checked by the [[05-hooks-and-events#Stop — stop-change-detector.js|Stop hook]].

## What sentrux measures

`sentrux` is an external binary (here v0.5.7). It derives a **quality signal (0–10000)** from
five root causes: acyclicity (Tarjan SCC cycle count), depth (max dependency depth), equality
(Gini of per-function cyclomatic complexity), redundancy (dead+dup ratio), and modularity
(Newman Q). `sentrux gate` compares the working tree against the saved baseline; `sentrux check`
enforces `rules.toml` thresholds.

## Installing the gate at init

`init` Step 8c **installs** the gate via `src/install/sentrux-installer.ts → installSentrux(cwd,
templateVars)`. This writes **both** files into the target project:

- **`.sentrux/rules.toml`** — built by `buildRulesToml` from the `SENTRUX_*` template variables
  (mirrors `writeSentruxRules` so the file shape is identical regardless of which path created it).
- **`.sentrux/baseline.json`** — a starter regression-check reference built by `buildBaseline`,
  seeded from the probed cycle count (`SENTRUX_MAX_CYCLES`) so the first gate run has a meaningful
  baseline; sentrux overwrites/ratchets it once it runs a real scan.

It is **idempotent and non-destructive**: if a `.sentrux/` config already exists (rules.toml *or*
baseline.json present) it is left untouched (`skipped`), and it **never throws** — benign failures
return a skipped result with a `reason`.

> **Gap this closed:** init previously only called `writeSentruxRules`, which wrote `rules.toml`
> but **not** `baseline.json` — so the gate was never fully installed (no baseline to compare
> against). `installSentrux` now scaffolds both. See [[04-generation-and-install#Sentrux install]].

## `.sentrux/rules.toml`

Written at init by `installSentrux` (`buildRulesToml`) — equivalently shaped to the
`writeArchitectureWriter`/`writeSentruxRules` path — from the quality-gate template variables.
Current rules in this repo:

| Rule | Threshold | Meaning |
|---|---|---|
| `max_cycles` | `0` | no dependency cycles |
| `max_coupling` | `C` | coupling grade ceiling (A best … E worst) |
| `max_cc` | `10` | max cyclomatic complexity per function |
| `no_god_files` | `true` | no single file with fan-out > 15 |

## Seeding the threshold values

Before `installSentrux` writes the files, the `SENTRUX_*` values are seeded:
`probeSentrux()` (in [[03-detection#architecture-sniffer.ts|architecture-sniffer]]) reads the
live metrics, and the interview's `allowCycles`/`maxCC` answers finalize them
([[04-generation-and-install#Project interview]]):

- **Enforce mode** — cycles currently 0 → `SENTRUX_MAX_CYCLES = "0"` (keep it strict).
- **Ratchet mode** — cycles > 0 → `SENTRUX_MAX_CYCLES = <current>` (lock today's debt, block
  increases).
- **Advisory** — sentrux unavailable → `unknown` (rule commented out).

## `.sentrux/baseline.json`

The metrics snapshot the gate compares against. In this repo (current):

| Metric | Value |
|---|---|
| `quality_signal` | ~0.634 (i.e. **6339** on the 0–10000 scale) |
| `coupling_score` | **keep as low as possible** — there is no "normal"/acceptable target; every change must drive coupling down or hold it, never up |
| `cycle_count` | 0 |
| `god_file_count` | 1 |
| `complex_fn_count` | ~9–15 functions over `max_cc` |
| `max_depth` | 3 |
| import edges | 149 total / 136 cross-module |

The one god file and the high-complexity functions are concentrated in
`src/analyze/project-detector.ts` and `src/cli/init.ts` — see [[01-architecture#Known architecture debt]].

## The gate at commit/push/PR (deterministic, zero-LLM)

From `hooks/pre-tool-sentrux-gate.js` — gates `git commit`, `git push`, `gh pr create`:

```
fingerprint = sha256(HEAD + `git stash create` snapshot + untracked list)
verdict = cache[fingerprint] ?? `sentrux gate .`   # cached in .sentrux/.gate-cache.json
read verdict from STDOUT TEXT (exit code is always 0):
  ├─ "DEGRADED"                 → permissionDecision: "ask"  (hand human the metrics + playbook)
  ├─ any metric improved, none worse → `sentrux gate . --save`  (ratchet baseline up)
  │     └─ on `git push`: also commit baseline (path-scoped) so it travels with the push
  │     └─ on commit/PR : leave saved baseline UNSTAGED; tell model to commit separately
  └─ "No degradation detected"  → allow silently
```

Key design points:
- **Read the text, not the exit code** — `sentrux gate` exits 0 even when degraded.
- **Fingerprint cache** — a commit-then-push (e.g. `/as-ship`) scans the identical tree once.
  Uses `git stash create` (staged + unstaged) not `git write-tree` (index-only).
- **Never auto-approve a regression** — only the human can accept it.
- **Monotonic ratchet** — the baseline only ever moves up, automatically, with no tokens spent.

## Remediation playbook (on a degraded verdict)

Restore the baseline before adding features (remediation only):
- quality drop / new god file → re-extract the flattened pattern into its proper module
- new duplication → factor back into the shared abstraction
- new cycles / coupling up → break the cycle, restore layering

Touch only the regressing files, keep tests green, re-run `sentrux gate .`. Full version: **Step
0 of `/as-pr-review`**.

## Bounded remediation loop in /as-ship and /as-pr-review

A sentrux regression detected during `/as-ship` or `/as-pr-review` no longer hard-stops
immediately. Instead the flow enters a **bounded remediation loop**:

1. **Identify** the degraded metric(s) from the `sentrux gate` output (quality signal,
   coupling, cycles, god-file count, complex-function count).
2. **Attempt a targeted, behaviour-preserving fix** — extract a module, break a cycle,
   factor duplication — touching only the regressing files, keeping all tests green.
3. **Re-gate** with `sentrux gate .` to confirm the metric is restored.
4. Repeat for **at most 3 rounds**. The round budget is **independent of** (and does not
   consume) the broader CI/review fix budget.
5. If still degraded after 3 rounds, **escalate to the human** with explicit before→after
   metric deltas so the decision to accept or block is informed.

**Hard-stops remain immediate (not subject to the loop):** red tests, typecheck failures,
lint errors, and secret-scan hits — these are never retried autonomously.

> The 3-round cap prevents an unbounded autonomous repair spiral while still giving the model
> a realistic chance to resolve a single accidental regression (e.g. a new import edge) without
> human interruption.

## Manual commands

```bash
sentrux gate .          # regression check vs baseline (what the hook runs)
sentrux gate . --save   # ratchet/save a new baseline
sentrux check .         # enforce rules.toml thresholds (lists violations)
sentrux mcp             # start the MCP server
```
