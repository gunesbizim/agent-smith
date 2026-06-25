You are the PR review orchestrator. Detect which sides of the stack changed, dispatch matching review skills each in a fresh subagent, and merge their reports.

`$ARGUMENTS` may be a PR number, a path, or empty (= full branch diff against main).

---

## Step 0 — Architecture regression gate (runs first, always)

Before any review work, enforce the structural baseline. The PR may not lower architectural quality below the saved baseline (`.sentrux/baseline.json`).

```bash
sentrux gate .
```

Read the output: `Quality: <baseline> -> <current>`, plus Coupling / Cycles / God files deltas.

- **Pass** (exit 0, `✓ No degradation detected`) → proceed to Step 1.
  - **Ratchet**: if the gate reports *improvement* over baseline (quality up, coupling down, fewer cycles/god-files/complex-fns), lock in the gain — `sentrux gate . --save` — and commit the updated `.sentrux/baseline.json` as `chore(sentrux): ratchet baseline <old>-><new>`. The baseline only ever moves up; never let a future PR regress against the old, lower bar.
- **Regression** (non-zero exit, or any metric worse than baseline: quality dropped, coupling up, new cycles, new god files, more complex fns) → **STOP. Do not run Steps 1–4.** Do not dispatch review skills, cross-cutting checks, or merged output. The ONLY permitted action is remediation:

  ### Remediation loop (restore-to-baseline only)

  Dispatch a fresh **Agent** per regressed dimension (parallel when independent), each scoped strictly to recovering the lost metric — never to add features or change behavior:

  > A `sentrux gate` regression was detected on this branch. Current vs baseline: `<paste the gate metrics>`. Your ONLY job is to raise the structural metrics back to **at least** the baseline in `.sentrux/baseline.json`, without changing runtime behavior. Specifically:
  > - **Quality drop / new god file** → restore the architectural pattern that was flattened; re-extract responsibilities into their proper modules. Do not inline what belonged in a separate unit.
  > - **New code duplication** → factor the duplicated logic back into the shared abstraction it was copied from.
  > - **New cycles / coupling up** → break the dependency cycle; restore the layering/direction that existed at baseline.
  > - **Complex fn count up** → decompose the new high-CC functions.
  > Touch only the regressing files. Add no new dependencies. Preserve all existing tests green. Return the diff and a one-line rationale per change.

  After agents return, re-run `sentrux gate .`. Repeat (max 3 rounds) until the gate passes or no further progress is possible.

  - Gate passes → continue to Step 1 (now review the remediated diff).
  - Still regressed after 3 rounds → **stop and report**: which metric is still below baseline, what was attempted, what remains. Do not proceed to review.

The intent: a PR can never silently erode architecture. We recover lost patterns and de-duplicate *before* spending review effort on anything else.

---

## Step 1 — Detect scope

```
git fetch origin main
git diff origin/main...HEAD --stat
```

| Side | Paths |
|---|---|
| **Backend** | `{{BACKEND_DIR}}/`, scripts/, workers/ |
| **Frontend** | `{{FRONTEND_DIR}}/` |
| Both / docs-only | run both / report "no reviewable code" |

## Step 2 — Dispatch (fresh subagent per side, parallel when both)

- Backend changes → spawn an Agent with:
  > Read `.claude/skills/pr-review-backend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<scope>`. Return the full structured report.

- Frontend changes → spawn an Agent with:
  > Read `.claude/skills/pr-review-frontend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<scope>`. Return the full structured report.

## Step 3 — Cross-cutting checks

- **API contract drift**: backend endpoint signature changes vs frontend API callers — flag mismatches.
- **Commit hygiene**: every commit contains a ticket reference, format `type(scope): TICKET-XX description` (≤ 72 chars).
- **Migration ↔ frontend coupling**: new backend fields surfaced in UI without i18n keys, or vice versa.

## Step 3.5 — Adversarial critic panel (perspective-diverse verification)

Beyond the per-side reviews, fan out the **critic panel** — five single-lens adversarial
reviewers, each trying to REFUTE the change from its own angle (not a balanced review). Run them
as parallel subagents on the same diff:

- `pr-critic-security` — injection, authz, secrets, SSRF, unsafe deserialization.
- `pr-critic-performance` — N+1, unbounded loops/allocations, blocking I/O, missing indexes.
- `pr-critic-simplicity` — unnecessary abstraction, dead code, simpler equivalents.
- `pr-critic-maintainability` — naming, cohesion/coupling, test gaps, undocumented decisions.
- `pr-critic-dx` — API ergonomics, error messages, hidden config, surprising defaults.

Spawn one Agent per critic:
> Read `.claude/skills/pr-critic-<lens>/SKILL.md` and execute it exactly on the branch diff.
> `$ARGUMENTS` = `<scope>`. Return ONLY your `{severity, file, line, problem, fix, falsePositive, fpReason?}` findings.

### Synthesis (consensus, not raw dump)

After the critics return, a synthesis pass consolidates — do NOT dump every critic verbatim:

**Step A — False-positive triage (first, always):**
Drop every finding where `falsePositive: true`. Collect them under a **"Dropped as false positive"**
section with each finding's `fpReason` so the human can audit the triage. These dropped findings
are NOT counted toward the verdict, NOT auto-fixed, and NOT listed in any action section.

**Step B — Severity-driven action on confirmed findings:**
1. **Dedup** confirmed findings that point at the same file/line across lenses.
2. **Rank** by severity; a finding is **high-confidence-real** when ≥2 lenses independently flag
   the same issue — surface those first.
3. **critical and high** severity confirmed findings → **auto-fix** (you are confident; apply
   the fix directly). These block the PR verdict.
4. **medium and low** severity confirmed findings → do NOT fix; list them as non-blocking under
   **"Left for follow-up"** in the output. They do NOT affect the PR verdict.
5. **Uncertain** findings (confirmed real but fix unclear) → escalate to the human with the
   specific question; do not auto-fix and do not block on them.
6. A single critic's lone finding with no cross-lens corroboration is treated as **medium** at
   most — this prevents one noisy lens from blocking the merge.

## Step 4 — Merged output

```
## PR Review — <branch or PR number>

### Verdict
mergeable / needs changes / blocked   (worst of: side verdicts + confirmed critical/high findings from critic panel; medium/low never block)

### Backend report
<verbatim from the backend subagent, or "no backend changes">

### Frontend report
<verbatim from the frontend subagent, or "no frontend changes">

### Critic panel (synthesized)
<triage: dropped-as-false-positive findings with reasons>
<auto-fixed: critical/high confirmed findings that were applied>
<left for follow-up: medium/low confirmed findings, non-blocking>
<escalated-to-human: uncertain findings>

### Cross-cutting findings
<contract drift, commit hygiene, coupling issues>
```

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
