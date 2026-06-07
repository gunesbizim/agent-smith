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

> ## MUST-FOLLOW RULE — browser-driven visual loop
> Whenever this skill creates or changes any rendered UI, you **MUST** drive the running app in a real browser through Playwright MCP and **visually verify** the result before declaring the task complete. **Never ship a UI change you have not seen rendered with a clean console.**

---

## Step 0 — Plan first (mandatory)

**Before writing any code**, call `advisor` to produce a scoped implementation plan. Include the task, relevant files, constraints, and backend endpoints needed. Plan must be verified with human.

---

## Step 1 — GitNexus analysis

```
gitnexus_query("TargetViewOrComponent")              # locate component + related backend symbols
gitnexus_api_impact()                                # HTTP endpoints touched
gitnexus_impact("SymbolBeingChanged")                # blast radius
gitnexus_context("path/to/component")                # full component context
```

---

## Step 2 — Serena symbol navigation

```
mcp__serena__find_symbol("StoreName.actionName")          # Pinia actions
mcp__serena__find_symbol("ViewName")                      # Vue components
mcp__serena__get_diagnostics_for_file("path/to/file")     # catch TS errors
```

**After editing every file**, call `get_diagnostics_for_file`.

---

## Step 3 — Component API lookup (before writing new UI)

Use component library MCP tools to check the exact API before implementing. Never guess prop/slot/event names.

---

## Step 4 — Historical investigation

```
search_git_history("topic or feature", limit=8)
commits_touching_file("path/to/component", limit=10)
bug_fix_history("component area", limit=8)
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
