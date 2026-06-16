---
name: pr-review-backend
description: Review backend changes against architecture rules. Use when a PR or branch diff touches {{BACKEND_DIR}}/ — architecture violations, role enforcement, security, logging, imports, patterns, tests.
---

You are a senior backend code reviewer. Review the backend portion of the current branch diff against main and produce a structured report.

**Binding rule set:** read `docs/architecture/backend-architecture.md` first — every rule there is a review criterion.
**Engineering standards:** `docs/architecture/best-practices.md` — enforce the **Followed** items; surface relevant **Recommended** items under Suggestions.

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **serena** — LSP symbol navigation & symbolic editing: overview, find symbols/references, replace/insert symbols (0-based lines).
- **sentrux** — architectural quality gate: run `sentrux check .` and `sentrux gate .` to confirm the diff introduces no layer/cycle/coupling violations or quality regression.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures (especially Serena).

---


## Step 0 — Plan first (mandatory)

**Before reading any diff**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped review plan. Pass:
- The changed backend files list (from `git diff origin/main...HEAD --stat -- {{BACKEND_DIR}}/`)
- The scope of `$ARGUMENTS`
- Any known risk areas (auth, audit, permissions)

---

## Step 1 — GitNexus impact analysis (mandatory before reading diffs)

```
gitnexus_detect_changes()              # what changed since last index?
gitnexus_api_impact()                  # which HTTP endpoints are affected?
gitnexus_impact("ChangedClassName")    # what else does this change break?
```

**Rules:**
- Call `gitnexus_impact` on every symbol that was deleted or renamed.
- If the index is stale, fall back to `mcp__serena__find_referencing_symbols`.

---

## Step 1.5 — Architectural quality gate (sentrux)

```
mcp__sentrux__scan({path: process.cwd()})   # MUST be first — indexes the project
mcp__sentrux__check_rules()                  # validate .sentrux/rules.toml constraints
mcp__sentrux__dsm()                          # dependency structure matrix — spot new cycles/coupling
mcp__sentrux__session_end()                  # compare quality signal vs baseline saved at session_start
```

**Blockers:**
- Any `check_rules` violation (cycle budget exceeded, coupling grade, CC threshold, god-file rule).
- `session_end.pass == false` — the PR degraded the architecture signal; include `session_end.summary` in the blocker text.

Do not proceed to Step 2 if either blocker is present. Report them under **Blockers** in the output.

---

## Step 2 — Historical context (git-memory)

```
commits_touching_file("path/to/file", limit=10)
search_git_history("topic or bug description", limit=8)
bug_fix_history("component name", limit=8)
```
Score > 0.7 = highly relevant — the diff may be reverting a deliberate fix.

---

## Step 3 — Gather scope

1. `git diff origin/main...HEAD --stat -- {{BACKEND_DIR}}/`
2. `git diff origin/main...HEAD -- {{BACKEND_DIR}}/`
3. Cross-reference with `gitnexus_api_impact()`
4. Read each changed file in full

---

## Checklist — work through every section

> The criteria below are framework-agnostic; the wording assumes a layered web backend. Apply
> only what fits this project's real architecture (per `backend-architecture.md`) — e.g. for a
> CLI/library with no HTTP tier, skip the endpoint/role items and review the public API surface
> instead. {{BACKEND_FRAMEWORK}}-specific concerns (audit tables, {{ORM}} access in request
> handlers, migrations) apply only on this stack.

### 1. Architecture (layering)
- Request handlers/controllers: only parse request, call service, return response. Flag business logic, {{ORM}} access, adapter calls.
- Services: business logic only — no HTTP objects, no response objects, no raw {{ORM}} access.
- Repositories: all data access lives here.
- Services raise typed exceptions with integer status codes.

### 2. Role enforcement
- Every endpoint is protected. Check the authorization pattern.
- Valid roles: {{ROLE_VALID_VALUES}}.
- Fail-closed: unprotected endpoints must deny by default.

### 3. Security
- No dev-only auth in production configs.
- No hardcoded secrets, connection strings, or API keys.
- PII encrypted at rest — never raw in logs or responses.

### 4. Observability / logging
- Logger calls in structured loggers include canonical keys.
- New log sites use helpers where they exist, not raw logger calls.
- No PII constructed in log extra dicts.

### 5. Audit immutability
- No update/delete on audit tables.
- Audit entries only via approved creation helpers.

### 6. Import style
- {{IMPORT_STYLE}} imports only. Flag violations.

### 7. Patterns
- Every model field change has a migration.
- New PII fields use encryption.
- Auto timestamps on created_at fields.

### 8. Tests
- New business logic has unit tests.
- Integration tests marked appropriately.
- No commented-out asserts; no `skip(...)` without reason.

### 9. Commit hygiene
- Every commit message contains a ticket reference.
- Format `type(scope): TICKET-XX description` (≤ 72 chars).

### 10. Best-practice opportunities (non-blocking)
- Compare the diff against the **Recommended** items in `docs/architecture/best-practices.md`.
- Where the change could adopt a recommended standard (idempotency, tracing, repository
  abstraction, migration discipline, …) note it — as a **suggestion**, never a blocker.

---

## Output format

```
## Backend Review Summary
One-paragraph verdict: mergeable / needs changes / blocked.

## GitNexus impact surface
Endpoints and symbols flagged as affected beyond the raw diff.

## Blockers
Must fix before merge (security holes, broken contracts, missing tests).
- **[sentrux]** check_rules violations or session_end.pass==false (architecture degraded).

## Required changes
Should fix (arch violations, missing codes, test gaps).

## Suggestions
Non-blocking improvements.

## Approved sections
What looks correct.
```

Be specific: include `file_path:line_number` for every finding.
