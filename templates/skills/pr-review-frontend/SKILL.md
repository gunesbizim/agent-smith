---
name: pr-review-frontend
description: Review frontend changes against architecture rules. Use when a PR or branch diff touches {{FRONTEND_DIR}}/ — component compliance, i18n parity, store/API layering, UI library usage, role-aware UI, TypeScript quality, test coverage.
---

You are a senior frontend code reviewer. Review the frontend portion of the current branch diff against main and produce a structured report.

**Binding rule set:** read `docs/architecture/frontend-architecture.md` first — every rule there is a review criterion.

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **serena** — LSP symbol navigation & symbolic editing: overview, find symbols/references, replace/insert symbols (0-based lines).
- **sentrux** — architectural quality gate: run `sentrux check .` and `sentrux gate .` to confirm the diff introduces no architectural violations or quality regression.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures (especially Serena).

---


## Step 0 — Plan first (mandatory)

**Before reading any diff**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped review plan. Pass:
- The changed frontend files list (from `git diff origin/main...HEAD --stat -- {{FRONTEND_DIR}}/`)
- The scope of `$ARGUMENTS`
- Any known risk areas (role-gated UI, i18n, API contract changes)

---

## Step 1 — GitNexus impact analysis

```
gitnexus_detect_changes()                              # map diff to affected flows
gitnexus_query("TargetViewOrComponent")                # locate component + related symbols
gitnexus_context("path/to/component")                  # full component context
gitnexus_api_impact()                                  # backend endpoints consumed
gitnexus_impact("storeActionOrApiFn")                  # callers of changed actions/fns
```

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

## Step 2 — Serena symbol checks

Run `mcp__serena__check_onboarding_performed` once before using Serena; load its tools via tool-search if deferred. Name paths use `/` (not `.`); `find_referencing_symbols` requires BOTH `name_path` and `relative_path`. For each changed file:
```
mcp__serena__get_symbols_overview(relative_path="path/to/file")
mcp__serena__find_referencing_symbols(name_path="renamedFunction", relative_path="path/to/file")
```

There is no `get_diagnostics_for_file` tool — verify types by running the project's type-check (`{{FRONTEND_TYPE_CHECK_CMD}}`).

---

## Step 3 — Component API verification

When the diff uses UI library props/slots/events you don't recognize, look them up in the component library MCP. Flag invented names — they fail silently at runtime.

---

## Step 4 — Gather scope

1. `git diff origin/main...HEAD --stat -- {{FRONTEND_DIR}}/`
2. `git diff origin/main...HEAD -- {{FRONTEND_DIR}}/`
3. Read each changed file in full

---

## Checklist — work through every section

### 1. Component compliance
- All components use the canonical pattern (e.g. script setup + TypeScript).
- Typed props and emits.
- No implicit `any` without annotation.

### 2. i18n
- All user-facing strings via i18n — flag hardcoded strings in templates or scripts.
- Every key added to primary locale exists in all locale files.
- Assert on keys, not translated strings, in tests.

### 3. Layering
- Stores never call the backend directly — only via api/ functions.
- All HTTP through the shared client — flag raw fetch/axios outside the API layer.
- API functions have explicit request/response interfaces.
- 401 → refresh/redirect; 403 → role-restriction error handled.

### 4. Design system
- UI library components for layout, forms, tables, dialogs, feedback.
- No hard-coded design tokens outside the theme.
- Reuse shared primitives before writing new ones.

### 5. Role-aware UI
- Role checks from auth store.
- Role-gated actions: disabled + tooltip, not silently hidden for in-page actions.
- Route-level gating via router guards.
- UI checks are UX-only — backend remains authoritative.

### 6. TypeScript quality
- No `any` without annotation.
- Type-only imports for type-only usage.
- Interfaces for API shapes.

### 7. Tests
- New components/views/store actions have test coverage.
- Tests mock the API layer — never hit a real backend.
- Role-gated rendering tested per role.

### 8. Async UX
- No blocking waits; long jobs use poll-status pattern.
- Loading / empty / error / role-gated states handled in templates.

### 9. Commit hygiene
- Every commit message contains a ticket reference.

---

## Output format

```
## Frontend Review Summary
One-paragraph verdict: mergeable / needs changes / blocked.

## Impact surface
Components, stores, API functions, backend endpoints affected beyond the raw diff.

## Blockers
Must fix before merge (i18n parity failures, layering violations, broken role gating).
- **[sentrux]** check_rules violations or session_end.pass==false (architecture degraded).

## Required changes
Should fix (type holes, missing tests, design-token violations).

## Suggestions
Non-blocking improvements.

## Approved sections
What looks correct.
```

Be specific: include `file_path:line_number` for every finding.
