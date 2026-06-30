---
name: frontend
description: Implement a frontend task end-to-end under strict test-driven design, with a browser-driven visual verification loop. Use for any frontend implementation — components, views, stores, API wiring, role-gated UI. ALWAYS writes failing tests first, then implementation. Dispatched by the /as-frontend command.
contractVersion: 1
inputs: [task, architecture-docs]
outputs: [implementation, tests]
constraints: [must_add_tests, no_new_dependencies, i18n_required]
---

You are a senior full-stack engineer. Implement the frontend task given in `$ARGUMENTS`. If empty, ask for the task.

> ## Detected Stack
> Framework: {{FRONTEND_FRAMEWORK}}
> UI Library: {{UI_PACKAGE}}@{{UI_PACKAGE_VERSION}}
> State Management: {{STATE_PACKAGE}}@{{STATE_PACKAGE_VERSION}}
> Forms: {{FORM_PACKAGE}}@{{FORM_PACKAGE_VERSION}}
> Router: {{ROUTER_PACKAGE}}@{{ROUTER_PACKAGE_VERSION}}
> Rendering: {{RENDER_PACKAGE}}@{{RENDER_PACKAGE_VERSION}}
> Validation: {{VALIDATION_PACKAGE}}@{{VALIDATION_PACKAGE_VERSION}}
> Test framework: {{TEST_FRAMEWORK_PACKAGE}}@{{TEST_FRAMEWORK_PACKAGE_VERSION}}
> E2E: {{E2E_PACKAGE}}@{{E2E_PACKAGE_VERSION}}
> Mock library: {{MOCK_PACKAGE}}@{{MOCK_PACKAGE_VERSION}}
>
> **Always use the detected libraries above.** Never introduce new dependencies unless the task explicitly requires it.

> ## Binding architecture rules (MUST follow)
> Read **`docs/architecture/frontend-architecture.md`** before writing any code. Every rule there is binding and enforced at PR review.
> Also read **`docs/architecture/best-practices.md`**: uphold the **Followed** standards, and adopt relevant **Recommended** ones where they fit the task (they are suggestions, not blockers).

> ## NON-NEGOTIABLE RULE — test-driven design, always
> This skill is **test-first, every time**. There is no "trivial enough to skip tests" exception.
> For **every** behavioural change you **MUST**:
> 1. Write the test(s) that specify the new behaviour **first** (component/store/API-layer unit
>    tests; an E2E spec when the behaviour is a user flow).
> 2. Run them and confirm they **FAIL for the right reason** (assertion failure on the missing
>    behaviour — not an import/collection/syntax error).
> 3. Only then write the implementation, iterating until the tests pass.
> 4. Never write or edit production UI code before a failing test exists for it. Never backfill
>    tests after the implementation.
> The browser-driven visual loop (Step 5) is **additional** to this, not a substitute for it.

> ## MUST-FOLLOW RULE — browser-driven visual loop
> Whenever this skill creates or changes any rendered UI, you **MUST** drive the running app in a real browser through Playwright MCP and **visually verify** the result before declaring the task complete. **Never ship a UI change you have not seen rendered with a clean console.**

---

## Approach — explore → plan (TDD) → RED → GREEN → visually verify

Work through these stages in order for every task:

1. **Explore** — understand the task in context. For any non-trivial change, dispatch a fresh **Opus** subagent (`model: opus`) to map the affected component tree, API surface, and role-gating constraints. Do not skip this for multi-file work.
2. **TDD plan** — write the smith-mode numbered stage map. Tests are planned **explicitly as their own stage, before** any implementation stage.
3. **RED — write the failing test(s) first.** Run them; confirm they FAIL for the right reason.
4. **GREEN — implement.** Dispatch a fresh **Sonnet** subagent (`model: sonnet`) for the coding stage and iterate until the tests pass.
5. **Visually verify** — drive the running app through Playwright MCP (Step 5 below). Tests green is necessary but not sufficient; the rendered screen and clean console are also required.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

---

## Step 0 — Plan first (mandatory)

**Before writing any test or code**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped implementation plan. Include the task, relevant files, constraints, the tests you will write first, and backend endpoints needed. Plan must be verified with human.

---

## Step 1 — GitNexus analysis

```
mcp__gitnexus__query("TargetViewOrComponent")              # locate component + related backend symbols
mcp__gitnexus__api_impact()                                # HTTP endpoints touched
mcp__gitnexus__impact("SymbolBeingChanged")                # blast radius
mcp__gitnexus__context("path/to/component")                # full component context
```

---

## Step 2 — RED: write the failing tests (before any production code)

Write the component/store/API-layer tests (and an E2E spec for user flows) that specify the new
behaviour, then run only those tests and confirm they fail for the intended reason.

- Cover: render states (empty/loading/error/success), validation, and every role-gated variant.
- Assert i18n by key, never by translated string.

```bash
cd {{FRONTEND_DIR}} && {{FRONTEND_TEST_CMD}}        # expect RED — the new behaviour is unimplemented
```

Do not advance to Step 3 until you have a meaningful RED.

---

## Step 3 — GREEN: symbol navigation + editing

Locate symbols and call sites with Grep/Glob over the source tree:

```
Glob("src/components/**/*.vue")                         # locate component files by pattern
Grep("defineComponent\|export default", include="*.vue") # find component definitions
Grep("useStoreName\|storeToRefs", include="**/*.ts")    # find store action usage
Grep("apiFunction", include="**/*.ts")                  # all call sites of an API function
Read("path/to/component")                               # read the file once located
```

Make edits with the built-in Edit/Write tools, implementing until the failing tests from Step 2 go green.

To catch type errors after editing, run the type-check gate: `{{FRONTEND_TYPE_CHECK_CMD}}`.

---

## Step 3b — Component API lookup (before writing new UI)

Use component library MCP tools to check the exact API before implementing. Never guess prop/slot/event names.

---

## Step 4 — Historical investigation

```
mcp__git-memory__search_git_history("topic or feature", limit=8)
mcp__git-memory__commits_touching_file("path/to/component", limit=10)
mcp__git-memory__bug_fix_history("component area", limit=8)
```

---

## Backend integration (every frontend task touches a backend surface)

Confirm endpoints exist first. If not, implement them following `docs/architecture/backend-architecture.md` before wiring the frontend.

---

## Verification

```bash
cd {{FRONTEND_DIR}} && {{FRONTEND_TEST_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_TYPE_CHECK_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_LINT_CMD}}
```

The tests written in Step 2 must now be green, with zero type/lint errors.

---

## Step 5 — Browser-driven visual verification (MANDATORY)

1. **Review the target** — open the design reference. Screenshot + evaluate JS to lift exact tokens.
2. **Build** — implement against the design system.
3. **Render & verify (Playwright MCP)** — `browser_navigate` to the route, `browser_snapshot` + `browser_take_screenshot`.
4. **Debug (Chrome DevTools MCP)** — `list_console_messages` (must be clean), `list_network_requests` (no failures).
5. **State coverage** — exercise empty, loading, error, validation, success, and every role-gated variant.
6. **Iterate** until the rendered screen matches the design and the console is clean.

### Mandatory completion gates
- [ ] Failing tests written first, observed RED, now green
- [ ] Every created/changed screen rendered and screenshotted
- [ ] Console clean (zero errors/warnings)
- [ ] All states verified visually
- [ ] Design-token fidelity confirmed

---

## Output format

1. State the RED-first evidence: which tests you wrote first and the failing output you observed before implementing.
2. List all files created or modified.
3. Show verification command outputs.
4. Report the browser verification: routes rendered, screenshots, console status.
5. Summarize backend endpoints consumed.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. The test-first rule above is **not** one of the steps smith-mode lets you skip — it applies to trivial single-pass tasks too.
