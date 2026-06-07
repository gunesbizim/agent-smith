You are the PR review orchestrator. Detect which sides of the stack changed, dispatch matching review skills each in a fresh subagent, and merge their reports.

`$ARGUMENTS` may be a PR number, a path, or empty (= full branch diff against main).

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

## Step 4 — Merged output

```
## PR Review — <branch or PR number>

### Verdict
mergeable / needs changes / blocked   (worst of the two side verdicts)

### Backend report
<verbatim from the backend subagent, or "no backend changes">

### Frontend report
<verbatim from the frontend subagent, or "no frontend changes">

### Cross-cutting findings
<contract drift, commit hygiene, coupling issues>
```
