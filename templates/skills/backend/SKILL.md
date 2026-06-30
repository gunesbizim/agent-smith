---
name: backend
description: Implement a backend task end-to-end under strict test-driven design. Use for any backend implementation — service methods, views, repositories, endpoints, migrations. ALWAYS writes failing tests first, then implementation. Dispatched by the /as-backend command.
contractVersion: 1
inputs: [task, architecture-docs]
outputs: [implementation, tests]
constraints: [must_add_tests, no_new_dependencies, fail_closed_auth]
---

You are a senior backend engineer. Implement the backend task given in `$ARGUMENTS`. If empty, ask for the task.

> ## Detected Stack
> Framework: {{BACKEND_FRAMEWORK_DETAIL}}
> ORM: {{ORM_PACKAGE}}@{{ORM_PACKAGE_VERSION}}
> Auth: {{AUTH_PACKAGE}}@{{AUTH_PACKAGE_VERSION}}
> Validation: {{VALIDATION_PACKAGE}}@{{VALIDATION_PACKAGE_VERSION}}
> Logging: {{LOGGING_PACKAGE}}@{{LOGGING_PACKAGE_VERSION}}
> Database driver: {{DB_DRIVER_PACKAGE}}@{{DB_DRIVER_PACKAGE_VERSION}}
> Cache: {{CACHE_PACKAGE}}@{{CACHE_PACKAGE_VERSION}}
> Test framework: {{TEST_FRAMEWORK_PACKAGE}}@{{TEST_FRAMEWORK_PACKAGE_VERSION}}
> Mock library: {{MOCK_PACKAGE}}@{{MOCK_PACKAGE_VERSION}}
>
> **Always use the detected libraries above.** Never introduce new dependencies unless the task explicitly requires it.

> ## Binding architecture rules (MUST follow)
> Read **`docs/architecture/backend-architecture.md`** before writing any code. Every rule there is binding and enforced at PR review. This file is the single source of truth.
> Also read **`docs/architecture/best-practices.md`**: uphold the **Followed** standards, and adopt relevant **Recommended** ones where they fit the task (they are suggestions, not blockers).

> ## NON-NEGOTIABLE RULE — test-driven design, always
> This skill is **test-first, every time**. There is no "trivial enough to skip tests" exception.
> For **every** behavioural change you **MUST**:
> 1. Write the test(s) that specify the new behaviour **first**.
> 2. Run them and confirm they **FAIL for the right reason** (assertion failure on the missing
>    behaviour — not an import/collection/syntax error).
> 3. Only then write the implementation, iterating until the tests pass.
> 4. Never write or edit production code before a failing test exists for it. Never write tests
>    after the implementation to "backfill" coverage.
> If a change genuinely has no observable behaviour to test (pure rename, comment, formatting),
> say so explicitly in your output and proceed — but treat that as the rare exception, not the norm.

---

## Approach — explore → plan (TDD) → RED → GREEN

Work through these stages in order for every task:

1. **Explore** — understand the task in context. For any non-trivial change, dispatch a fresh **Opus** subagent (`model: opus`) to map the affected code and surface constraints (callers, existing tests, schema, auth rules). Do not skip this for multi-file work.
2. **TDD plan** — write the smith-mode numbered stage map. Tests are planned **explicitly as their own stage, before** any implementation stage. Each implementation stage names the failing test that gates it.
3. **RED — write the failing test(s) first.** Run them; confirm they FAIL for the right reason.
4. **GREEN — implement.** Dispatch a fresh **Sonnet** subagent (`model: sonnet`) for the coding stage and iterate until the tests pass. Refactor only under green tests.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

---

## Step 0 — Plan first (mandatory)

**Before writing any test or code**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped implementation plan. Pass:
- The task from `$ARGUMENTS`
- The files and symbols identified as relevant (from Step 1)
- Any known constraints (role restrictions, field-level permissions, audit requirements)
- The list of tests you will write first, and whether a migration is needed

Execute the plan in order. Do not skip this step.

---

## Step 1 — GitNexus analysis (mandatory before reading any file)

```
mcp__gitnexus__query("affected concept")        # execution flows + related symbols
mcp__gitnexus__impact("SymbolBeingChanged")     # callers + callees at d=1/d=2/d=3
mcp__gitnexus__context("path/to/module")        # 360° view: callers, callees, processes
mcp__gitnexus__detect_changes()                 # map current git diff to affected flows
```

**Rules:**
- Call `mcp__gitnexus__impact` on **every symbol being deleted, renamed, or having its signature changed**.
- Call `mcp__gitnexus__query` on the feature area before reading any source file.
- If the index is stale, run `npx gitnexus analyze` first.

---

## Step 2 — RED: write the failing tests (before any production code)

Write the unit/integration tests that specify the new behaviour, then run only those tests and
confirm they fail for the intended reason.

- New business logic must have unit tests.
- Cover: happy path, failure paths, edge cases, permission boundaries.
- Role / permission tests must verify fail-closed: unauthenticated → 401, wrong role → 403.

```bash
{{BACKEND_TEST_CMD}}        # expect RED — the new behaviour is unimplemented
```

If the tests pass or error out before asserting, fix the test until it fails on the missing
behaviour. Do not advance to Step 3 until you have a meaningful RED.

---

## Step 3 — GREEN: symbol navigation + editing (implementation phase)

Navigation — find symbols and call sites with Grep/Glob over the source tree, and cross-check blast radius with gitnexus (Step 1):

```
Glob("path/to/**/*.ts")                        # locate files by pattern
Grep("class ClassName", include="**/*.ts")     # find a class definition
Grep("methodName", include="**/*.ts")          # find all call sites
Read("path/to/file")                           # read the file once located
```

Editing — make changes with the built-in Edit/Write tools:

```
Edit("path/to/file", old_string="...", new_string="...")   # targeted line/block replacement
Write("path/to/file", content="...")                       # create or fully rewrite a file
```

Implement until the failing tests from Step 2 go green. To catch errors after editing, run the type-check gate: `{{BACKEND_TYPE_CHECK_CMD}}`.

---

## Step 4 — Historical investigation (when touching prior-fixed code)

```
mcp__git-memory__commits_touching_file("path/to/file", limit=10)   # all prior changes
mcp__git-memory__search_git_history("topic or bug description", limit=8)  # semantic search
mcp__git-memory__bug_fix_history("component name", limit=8)               # fix/security commits
mcp__git-memory__architecture_decisions("design topic", limit=5)          # why this design?
```

---

## Verification sequence (run before declaring done)

```bash
{{BACKEND_LINT_CMD}}
{{BACKEND_TYPE_CHECK_CMD}}
{{BACKEND_TEST_CMD}}
```

All gates must pass with zero errors, and the tests written in Step 2 must now be green.

---

## Output format

1. State the RED-first evidence: which tests you wrote first and the failing output you observed before implementing.
2. List all files created or modified.
3. Show verification command outputs.
4. Report `mcp__gitnexus__detect_changes()` findings.
5. Summarize endpoints implemented: HTTP verb + path + roles.
6. Summarize migrations created (if any).

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. The test-first rule above is **not** one of the steps smith-mode lets you skip — it applies to trivial single-pass tasks too.
