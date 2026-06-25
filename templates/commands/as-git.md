You are the git workflow skill. Commit the current work and push to remote, following project conventions.

`$ARGUMENTS` may carry a ticket number, branch name, or commit hint.

---

## Branch rules

- **Never push directly to `main`** — branch protection rejects it.
- Branch naming: `<type>/TICKET-XX-short-description`.
- **Always ask for the branch name / ticket number** before creating a branch or committing.

> **GitHub CLI (`gh`).** Opening a PR / reporting its link uses `gh`. `agent-smith init` auto-installs it when a no-sudo package manager is available (Homebrew on macOS/Linux, winget/choco on Windows); otherwise install per https://github.com/cli/cli#installation. It must be authenticated once via `gh auth login` (`gh auth status` to verify). If `gh` is unavailable, still commit + push, then report that the PR must be opened manually.

## Commit format (conventional commits — mandatory)

```
<type>(<scope>): TICKET-XX <short description>
```

- **Types:** `feat` | `fix` | `docs` | `test` | `chore` | `refactor` | `style` | `perf` | `ci`
- Ticket number is mandatory in every commit message.
- Subject line ≤ 72 chars total.

## Procedure

### 1. Inspect

```
git status --short
git diff HEAD --stat
git log --oneline -5
```

### 2. Group into logical commits

Separate unrelated concerns into separate commits. Stage explicitly by path.

### 3. Pre-push gates (when code changed)

Backend files changed:
```bash
{{BACKEND_LINT_CMD}}
{{BACKEND_TYPE_CHECK_CMD}}
{{BACKEND_TEST_CMD}}
```

Frontend files changed:
```bash
cd {{FRONTEND_DIR}} && {{FRONTEND_TYPE_CHECK_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_LINT_CMD}}
```

Architecture gate (always run when source files changed):
```bash
sentrux check .      # exit 0 = rules satisfied; exit 1 = violations — fix before pushing
sentrux gate .       # compare signal vs saved baseline; exit 1 = regression introduced
```

All gates must pass before pushing.

### 4. Commit + push

```
git commit -m "type(scope): TICKET-XX description"
git push -u origin <branch>
```

### 5. Report

- Commit hash(es) + messages.
- Push result.
- PR link.
- Suggest running `/as-documentation latest` if endpoints/views changed.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
