You are the **ship** workflow — the gated-autonomous path from finished work to a green PR.

Invoke this when you judge the user's task is **fully complete** (code written, behavior verified) and it is time to commit, open a PR, address review, and drive CI to green. `$ARGUMENTS` may carry a ticket number, branch name, or hint.

> **You** (the model) run this — not the Stop hook. The Stop hook only *nudges* you to consider shipping. Only ship when the task is genuinely done, never mid-task.

> **Requires the GitHub CLI (`gh`).** Steps 5–8 (open PR, detect/poll CI) all shell out to `gh`. `agent-smith init` auto-installs `gh` when a no-sudo package manager is available (Homebrew on macOS/Linux, winget/choco on Windows); otherwise install it manually (https://github.com/cli/cli#installation). Either way, `gh` must be authenticated once with `gh auth login` before it can create PRs — if `gh auth status` fails, stop and ask the user to authenticate.

---

## Operating mode: gated-autonomous

Run the whole pipeline unattended, but **hard-stop and report** the moment a safety gate fails. Never push past a red gate. Only fix review blockers you are confident about; escalate the rest.

### Hard-stop conditions (abort, report why, do not continue)

- On `main`/`master` (branch protection — never commit or push there).
- Pre-push gates fail: tests red, typecheck/lint errors, secret scan hit.
- `sentrux gate` regression that remains after the remediation loop below (tests red / typecheck / lint errors are still immediate hard-stops).
- A potential secret/credential is staged (scan the diff before committing).
- A CI check stays red after **{{SHIP_MAX_FIX_ATTEMPTS}}** fix attempts (default 3).
- A review blocker you are not confident you can fix correctly.
- **No CI/CD pipelines are configured** → stop after the PR is open and report (per project policy).

---

## Procedure

### 1. Preflight

```bash
git branch --show-current      # must NOT be main/master
git status --short
git diff HEAD --stat
gh --version && gh auth status # gh must be installed AND authenticated for the PR steps
```

If `gh` is missing: `agent-smith init` auto-installs it (no-sudo package managers only) — otherwise install per https://github.com/cli/cli#installation. If `gh auth status` reports not-logged-in, stop and ask the user to run `gh auth login`.

**Branch hygiene — always work on a fresh branch forked from *updated* main.** Never commit onto a stale base. The decision logic is `decideBranch` in `src/pipeline/branch.ts` (unit-tested); apply it here:

- **On `main`/`master`** → create a fresh branch from updated main:
  ```bash
  git fetch origin
  git switch -c <type>/<short-description> origin/main
  ```
- **On a feature branch, but `$ARGUMENTS` names a *different* issue** → you are starting new work; create a fresh branch from updated main (as above).
- **On a feature branch for the *same* issue** (continuing existing work) → stay on it; just refresh remotes with `git fetch origin`.

Always `git fetch origin` **before** creating, so the branch forks from the latest remote main — never from a local stale `main`. Branch name follows the project's commit convention (this repo uses `<type>/<short-description>` with no ticket; other projects may require `TICKET-XX`).

### 2. Safety scan

- Scan the staged/working diff for secrets (API keys, tokens, `.env` values, private keys). Abort if found.
- Confirm no debug-only or commented-out code is being shipped.

### 3. Pre-push gates (must all pass)

Backend changed:
```bash
{{BACKEND_LINT_CMD}}
{{BACKEND_TYPE_CHECK_CMD}}
{{BACKEND_TEST_CMD}}
```

Frontend changed:
```bash
cd {{FRONTEND_DIR}} && {{FRONTEND_TYPE_CHECK_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_LINT_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_TEST_CMD}}
```

Architecture gate (any source change):
```bash
sentrux check .
sentrux gate .
```

Tests-red, typecheck errors, lint errors, or a secret-scan hit → **stop immediately**, report the failing gate and output. Do not commit.

`sentrux gate .` regression → enter a **bounded remediation loop (max 3 rounds — a fixed budget independent of the CI/review fix budget)** before escalating:

1. Identify the degraded metric(s) from the gate output (quality score down, coupling up, new cycle, new god-file, new complex function).
2. Attempt a targeted, behavior-preserving fix for that specific metric (e.g. break the new cycle, split the god-file responsibility, reduce coupling of the offending edge). Re-run the relevant tests to confirm behavior is preserved.
3. Re-run `sentrux gate .`.
   - No degradation → proceed to commit.
   - Still degraded but improved and rounds remain → loop back to step 1.
   - Rounds exhausted and degradation persists → **STOP and escalate to the human** with: the specific degraded metrics and their before→after deltas (quality/coupling/cycles/god-files/complex-fns), the files involved, and a summary of what was tried in each round. Do not push.

**Ratchet on improvement**: if `sentrux gate .` reports the branch is *better* than baseline (quality up, coupling down, fewer cycles/god-files/complex-fns), save the gain before pushing — `sentrux gate . --save` — and include the updated `.sentrux/baseline.json` in a `chore(sentrux): ratchet baseline <old>-><new>` commit. The baseline is monotonic: it only ever moves up.

### 4. Commit (conventional commits — mandatory)

Group unrelated concerns into separate commits, staging explicitly by path.

```
<type>(<scope>): TICKET-XX <short description>
```

Types: `feat|fix|docs|test|chore|refactor|style|perf|ci`. Ticket mandatory. Subject ≤ 72 chars. No `Co-Authored-By` or generated-by trailers.

### 5. Push + open PR

```bash
git push -u origin <branch>
gh pr create --fill --base {{DEFAULT_BRANCH}}
```

### 6. Detect CI

```bash
gh pr checks <pr> || true
```

- **No checks / no pipelines configured** → STOP. Report: PR opened, no CI to wait on, awaiting human merge.
- Checks exist → continue.

### 7. Review + fix loop (max {{SHIP_MAX_FIX_ATTEMPTS}} attempts)

1. Run `/as-pr-review` against the PR diff.
2. For each **required** blocker you are confident about: fix, re-run step 3 gates, commit, push.
3. Re-run review. Repeat until no required blockers remain or attempts exhausted.
4. Unfixable/uncertain blockers → stop and escalate with specifics.

### 8. Wait for CI green

Poll until every check reaches a terminal state:
```bash
gh pr checks <pr> --watch || true
```

- All green → done.
- A check goes red → pull its logs, attempt a fix (counts toward the attempt budget), push, re-poll.
- Still red after the budget → **stop**, report which check and the failing log excerpt.

### 9. Report

- Branch, commit hashes + messages.
- PR link and final CI status (green / stopped-with-reason).
- Any blockers escalated for human attention.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
