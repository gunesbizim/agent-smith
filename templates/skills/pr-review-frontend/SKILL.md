---
name: pr-review-frontend
description: Review frontend changes against architecture rules. Use when a PR or branch diff touches {{FRONTEND_DIR}}/ — component compliance, i18n parity, store/API layering, UI library usage, role-aware UI, TypeScript quality, test coverage.
---

You are a senior frontend code reviewer. Review the frontend portion of the current branch diff against main and produce a structured report.

**Binding rule set:** read `docs/architecture/frontend-architecture.md` first — every rule there is a review criterion.
**Engineering standards:** `docs/architecture/best-practices.md` — enforce the **Followed** items; surface relevant **Recommended** items under Suggestions.

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **sentrux** — architectural quality gate: run `sentrux check .` and `sentrux gate .` to confirm the diff introduces no architectural violations or quality regression.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures.

## Test-driven development (enforced)

This project follows **RED-first TDD**: a failing test is written and confirmed failing before the
implementation that makes it pass. As a reviewer, enforce it — new components/views/store actions
that ship without test coverage (including role-gated rendering) are a blocker, not a suggestion
(see checklist §7).

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

## Step 2 — Symbol checks

For each changed file, find symbols and their call sites with Grep/Glob over the source tree:

```
Grep("functionName\|ClassName", include="**/*.ts")    # find all references to a renamed/changed symbol
Glob("src/**/*.vue")                                  # locate related component files
Read("path/to/file")                                  # inspect a specific file
```

Verify types by running the project's type-check (`{{FRONTEND_TYPE_CHECK_CMD}}`).

---

## Step 3 — Component API verification

When the diff uses UI library props/slots/events you don't recognize, verify them against the wired
UI-library MCP for **{{FRONTEND_UI_LIBRARY}}** (e.g. the Vuetify MCP) when one is configured;
otherwise read the component source with `Read`/`Grep`. Flag invented names — they fail silently at
runtime.

---

## Step 4 — Gather scope

1. `git diff origin/main...HEAD --stat -- {{FRONTEND_DIR}}/`
2. `git diff origin/main...HEAD -- {{FRONTEND_DIR}}/`
3. Read each changed file in full

---

## Severity scale (use for every finding)

Assign one of the four levels to every finding before placing it in an output section:

| Severity | Meaning | Output section |
|---|---|---|
| **critical** | data loss / security hole / breaks prod / corrupts state | Blockers |
| **high** | real bug or regression a user/dev will hit | Blockers or Required changes |
| **medium** | should fix, not blocking (smell, missing edge case) | Required changes |
| **low** | nit / style / cosmetic | Suggestions |

**False-positive check (mandatory for every finding):** before placing a finding in any section,
read the actual lines and call sites in the current code to confirm the issue is real. If you
cannot reproduce the defect from the actual code as it stands, mark it as a false positive
(`falsePositive: true, fpReason: "<why>"`) and list it under a **Dropped as false positive**
section — do NOT escalate it. Only confirmed findings are reported.

## Checklist — work through every section

> Framework-agnostic criteria; the wording uses Vue/Vuetify terms as the example stack. Apply
> the equivalents for this project's real framework (per `frontend-architecture.md`).

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

### 10. Best-practice opportunities (non-blocking)
- Compare the diff against the **Recommended** items in `docs/architecture/best-practices.md`
  (accessibility, async-state handling, design tokens, bundle budget, …).
- Note adoptable improvements as **suggestions**, never blockers.

---

## Step 5 — Adversarial critic panel (sub-skills)

After the checklist, run the five single-lens critic **sub-skills** against the **frontend** diff.
Each one tries to REFUTE the change from its own angle (not a balanced review). Spawn one Agent per
critic, in parallel:

> Read `.claude/skills/pr-critic-<lens>/SKILL.md` and execute it exactly on the frontend diff
> (`git diff origin/main...HEAD -- {{FRONTEND_DIR}}/`). `$ARGUMENTS` = `<scope>`. Return ONLY your
> `{severity, file, line, problem, fix, falsePositive, fpReason?}` findings.

Lenses: `pr-critic-security`, `pr-critic-performance`, `pr-critic-simplicity`,
`pr-critic-maintainability`, `pr-critic-dx`.

### Synthesis (consensus, not raw dump)

After the critics return, consolidate — do NOT dump every critic verbatim:

**Step A — False-positive triage (first, always):** drop every finding where `falsePositive: true`;
list them under **Dropped as false positive** with each `fpReason` for human audit. Dropped findings
are not counted toward the verdict and not auto-fixed.

**Step B — Severity-driven handling of confirmed findings:**
1. **Dedup** confirmed findings pointing at the same file/line across lenses.
2. **Rank** by severity; a finding flagged by ≥2 lenses is high-confidence-real — surface first.
3. **critical / high** → fold into **Blockers** (and auto-fix when confident and run standalone).
4. **medium / low** → list under **Required changes** / **Suggestions**; never block the verdict.
5. A lone single-lens finding with no corroboration is **medium** at most.

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

## Critic panel (synthesized)
Confirmed critic findings folded in by severity (critical/high under Blockers; medium/low under Required/Suggestions), with cross-lens corroboration noted.

## Dropped as false positive
Findings confirmed as false positives, with reason (fpReason) for each — from both the review and the critic panel — listed here for human audit; not counted toward verdict, not auto-fixed.

## Approved sections
What looks correct.
```

Be specific: include `file_path:line_number` for every finding.
