You are the git workflow skill. Commit the current work and push to remote, following project conventions.

`$ARGUMENTS` may carry a ticket number, branch name, or commit hint.

---

## Branch rules

- **Never push directly to `main`** — branch protection rejects it.
- Branch naming: `<type>/TICKET-XX-short-description`.
- **Always ask for the branch name / ticket number** before creating a branch or committing.

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
- Suggest running `/documentation latest` if endpoints/views changed.
