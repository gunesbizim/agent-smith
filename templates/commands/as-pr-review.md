You are the PR review orchestrator. Detect which sides of the stack changed, dispatch the matching **main review skill** for each side in a fresh subagent, and merge their reports.

> **Structure:** this command is a thin dispatcher — `command → main skill → sub-skill`. Each main review skill (`pr-review-backend` / `pr-review-frontend`) owns its workflow **and** runs its own adversarial **critic sub-skill panel** (`pr-critic-*`) scoped to that side, returning an already-synthesized report. The orchestrator does not run critics itself.

> **This command may modify the working tree.** Beyond reporting, the review skills auto-fix confirmed critical/high findings, and this command runs the Step 0 architecture remediation loop. When invoked from `/as-ship`, the ship workflow owns the fix/commit/push cycle; when run standalone, fixes are applied directly to the working tree.

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

**Dispatch only the side(s) that actually changed.** If the diff touches only `{{FRONTEND_DIR}}/`,
run **only** `pr-review-frontend` — do not spawn the backend reviewer (and vice versa). Run both
only when both sides changed. A side with zero changed files is never dispatched.

## Step 2 — Dispatch the main review skill per side (fresh subagent, parallel when both)

Each main review skill runs its own checklist **and** its `pr-critic-*` sub-skill panel scoped to
that side, returning an already-synthesized report (critic findings folded in by severity).

- Backend changes → spawn an Agent with:
  > Read `.claude/skills/pr-review-backend/SKILL.md` and execute it exactly, including its critic sub-skill panel. `$ARGUMENTS` = `<scope>`. Return the full structured report.

- Frontend changes → spawn an Agent with:
  > Read `.claude/skills/pr-review-frontend/SKILL.md` and execute it exactly, including its critic sub-skill panel. `$ARGUMENTS` = `<scope>`. Return the full structured report.

## Step 3 — Cross-cutting checks (orchestrator-only)

These span both sides, so the orchestrator runs them after the side reports return:

- **API contract drift**: backend endpoint signature changes vs frontend API callers — flag mismatches.
- **Commit hygiene**: every commit contains a ticket reference, format `type(scope): TICKET-XX description` (≤ 72 chars).
- **Migration ↔ frontend coupling**: new backend fields surfaced in UI without i18n keys, or vice versa.

## Step 4 — Merged output

```
## PR Review — <branch or PR number>

### Verdict
mergeable / needs changes / blocked   (worst of the side verdicts; each side already folds in its confirmed critical/high critic findings; medium/low never block)

### Backend report
<verbatim from the backend subagent (incl. its critic panel), or "no backend changes">

### Frontend report
<verbatim from the frontend subagent (incl. its critic panel), or "no frontend changes">

### Cross-cutting findings
<contract drift, commit hygiene, coupling issues>
```

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
