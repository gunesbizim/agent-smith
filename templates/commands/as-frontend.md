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

> ## MUST-FOLLOW RULE — browser-driven visual loop
> Whenever this skill creates or changes any rendered UI, you **MUST** drive the running app in a real browser through Playwright MCP and **visually verify** the result before declaring the task complete. **Never ship a UI change you have not seen rendered with a clean console.**

---

## Approach — explore → plan (TDD) → implement

Before touching code, work through these four stages:

1. **Explore** — understand the task in context. For any non-trivial change, dispatch a fresh **Opus** subagent (`model: opus`) to map the affected component tree, API surface, and role-gating constraints. Do not skip this for multi-file work.
2. **Triage complexity** — a trivial single-file change can proceed directly; multi-file or multi-source work requires the full smith-mode stage map (numbered stages, failable verification, self-critique).
3. **TDD plan** — write the smith-mode numbered stage map with tests planned explicitly before any implementation stage.
4. **RED-first implement** — write the failing test(s) first, run them to confirm they FAIL for the right reason (not a collection/import error), THEN dispatch a fresh **Sonnet** subagent (`model: sonnet`) for the coding stage and iterate until green. Never write tests after the code.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

---

## Step 0 — Plan first (mandatory)

**Before writing any code**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped implementation plan. Include the task, relevant files, constraints, and backend endpoints needed. Plan must be verified with human.

---

## Step 1 — GitNexus analysis

```
mcp__gitnexus__query("TargetViewOrComponent")              # locate component + related backend symbols
mcp__gitnexus__api_impact()                                # HTTP endpoints touched
mcp__gitnexus__impact("SymbolBeingChanged")                # blast radius
mcp__gitnexus__context("path/to/component")                # full component context
```

---

## Step 2 — Symbol navigation + editing

Locate symbols and call sites with Grep/Glob over the source tree:

```
Glob("src/components/**/*.vue")                         # locate component files by pattern
Grep("defineComponent\|export default", include="*.vue") # find component definitions
Grep("useStoreName\|storeToRefs", include="**/*.ts")    # find store action usage
Grep("apiFunction", include="**/*.ts")                  # all call sites of an API function
Read("path/to/component")                               # read the file once located
```

Make edits with the built-in Edit/Write tools.

To catch type errors after editing, run the type-check gate: `{{FRONTEND_TYPE_CHECK_CMD}}`.

---

## Step 3 — Component API lookup (before writing new UI)

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
cd {{FRONTEND_DIR}} && {{FRONTEND_TYPE_CHECK_CMD}}
cd {{FRONTEND_DIR}} && {{FRONTEND_LINT_CMD}}
```

---

## Step 5 — Browser-driven visual verification (MANDATORY)

1. **Review the target** — open the design reference. Screenshot + evaluate JS to lift exact tokens.
2. **Build** — implement against the design system.
3. **Render & verify (Playwright MCP)** — `browser_navigate` to the route, `browser_snapshot` + `browser_take_screenshot`.
4. **Debug (Chrome DevTools MCP)** — `list_console_messages` (must be clean), `list_network_requests` (no failures).
5. **State coverage** — exercise empty, loading, error, validation, success, and every role-gated variant.
6. **Iterate** until the rendered screen matches the design and the console is clean.

### Mandatory completion gates
- [ ] Every created/changed screen rendered and screenshotted
- [ ] Console clean (zero errors/warnings)
- [ ] All states verified visually
- [ ] Design-token fidelity confirmed

---

## Output format

1. List all files created or modified.
2. Show verification command outputs.
3. Report the browser verification: routes rendered, screenshots, console status.
4. Summarize backend endpoints consumed.
5. Call the test skill with context.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
