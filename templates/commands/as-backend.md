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

---

## Approach — explore → plan (TDD) → implement

Before touching code, work through these four stages:

1. **Explore** — understand the task in context. For any non-trivial change, dispatch a fresh **Opus** subagent (`model: opus`) to map the affected code and surface constraints (callers, existing tests, schema, auth rules). Do not skip this for multi-file work.
2. **Triage complexity** — a trivial single-file change can proceed directly; multi-file or multi-source work requires the full smith-mode stage map (numbered stages, failable verification, self-critique).
3. **TDD plan** — write the smith-mode numbered stage map with tests planned explicitly before any implementation stage.
4. **RED-first implement** — write the failing test(s) first, run them to confirm they FAIL for the right reason (not a collection/import error), THEN dispatch a fresh **Sonnet** subagent (`model: sonnet`) for the coding stage and iterate until green. Never write tests after the code.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

---

## Step 0 — Plan first (mandatory)

**Before writing any code**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped implementation plan. Pass:
- The task from `$ARGUMENTS`
- The files and symbols identified as relevant (from Step 1)
- Any known constraints (role restrictions, field-level permissions, audit requirements)
- Whether a migration is needed

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

## Step 2 — Serena symbol navigation + editing (implementation phase)

**Handshake first (once per session).** Before any Serena call, run `mcp__serena__check_onboarding_performed`. If Serena tools are deferred/unloaded, load them via tool-search before using them. Serena line numbers are **0-based**.

Navigation — name paths use `/` (not `.`), and `find_referencing_symbols` requires BOTH `name_path` and `relative_path`:

```
mcp__serena__get_symbols_overview(relative_path="path/to/file")                                   # symbols in a file (start here)
mcp__serena__find_symbol(name_path_pattern="ClassName/method_name")                               # exact file + line
mcp__serena__find_symbol(name_path_pattern="ClassName", depth=1)                                  # a class + its methods
mcp__serena__find_referencing_symbols(name_path="function_name", relative_path="path/to/file")    # all call sites
```

Editing — when you change code you discovered via Serena, edit with Serena (built-in Edit is refused after a Serena read):

```
mcp__serena__replace_symbol_body(...)     # rewrite a whole function/method/class
mcp__serena__insert_after_symbol(...)     # add a new symbol after another
mcp__serena__replace_content(...)         # regex/string edit for a few lines within a symbol
```

There is **no** `find_implementations` or `get_diagnostics_for_file` tool. For implementations, use `find_referencing_symbols` on the base symbol. To catch errors after editing, run the type-check gate: `{{BACKEND_TYPE_CHECK_CMD}}`.

---

## Step 3 — Historical investigation (when touching prior-fixed code)

```
mcp__git-memory__commits_touching_file("path/to/file", limit=10)   # all prior changes
mcp__git-memory__search_git_history("topic or bug description", limit=8)  # semantic search
mcp__git-memory__bug_fix_history("component name", limit=8)               # fix/security commits
mcp__git-memory__architecture_decisions("design topic", limit=5)          # why this design?
```

---

## Tests (mandatory for every new service method)

- New business logic must have unit tests.
- Cover: happy path, failure paths, edge cases, permission boundaries.
- Role / permission tests must verify fail-closed: unauthenticated → 401, wrong role → 403.

---

## Verification sequence (run before every push)

```bash
{{BACKEND_LINT_CMD}}
{{BACKEND_TYPE_CHECK_CMD}}
{{BACKEND_TEST_CMD}}
```

All gates must pass with zero errors.

---

## Output format

1. List all files created or modified.
2. Show verification command outputs.
3. Report `mcp__gitnexus__detect_changes()` findings.
4. Summarize endpoints implemented: HTTP verb + path + roles.
5. Summarize migrations created (if any).
6. Call the **test skill** if new service methods were added.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
