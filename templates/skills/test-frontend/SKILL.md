---
name: test-frontend
description: Write or extend frontend tests. Use for any frontend test work — components, views, stores, API functions, role-gated rendering, i18n keys. Enforces mount factories, API mocking, key-based i18n assertions.
---

You are a senior frontend test engineer. Write or extend tests for the target in `$ARGUMENTS` (component, view, store, API function, or feature description).

**Stack:** {{FRONTEND_FRAMEWORK}}, {{FRONTEND_UI_LIBRARY}}
**Architecture rules under test:** `docs/architecture/frontend-architecture.md`
**Engineering standards:** `docs/architecture/best-practices.md` (Followed = enforce; Recommended = surface as suggestions)

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **sentrux** — after adding tests, run `sentrux gate .` to confirm coverage/complexity did not regress the baseline.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures.

---


## Step 0 — Plan first (mandatory)

**Before writing a single test**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped test plan. Pass:
- The target (`$ARGUMENTS`)
- Existing test files already found
- Known gaps or risk areas (role gating, async states, i18n)

### RED-first mandate (non-negotiable)

Write each test BEFORE the implementation it covers and run it to confirm it FAILS for the right reason (not a collection or import error) before writing the code. A test that passes before the implementation exists proves nothing. Do not write tests after the fact.

---

## Step 1 — GitNexus code analysis (before writing tests)

```
gitnexus_query("TargetComponent")                        # locate component + related symbols
gitnexus_impact("storeActionOrApiFn")                    # callers — what breaks if this fails?
gitnexus_context("path/to/component")                    # full component context
gitnexus_api_impact()                                    # backend endpoints the component consumes
```

**Rule:** never duplicate an existing test — check test directories first.

---

## Step 1.5 — Sentrux test gap analysis

```
mcp__sentrux__scan({path: process.cwd()})   # MUST be first — indexes the project
mcp__sentrux__test_gaps()                    # identify undertested high-coupling / high-risk modules
```

Use the returned list to **prioritize** which modules to cover first. Modules flagged by sentrux as high-risk with no or low test coverage must be addressed before lower-risk gaps.

---

## Step 2 — Symbol navigation

Locate symbols and call sites with Grep/Glob over the source tree.

```
Glob("src/components/**/*.vue")                          # locate component files by pattern
Grep("useStoreName\|defineStore", include="**/*.ts")     # find store definition
Grep("apiFunction", include="**/*.ts")                   # all call sites
Read("path/to/component")                                # read the file once located
```

Verify by running the tests / type-check (`{{FRONTEND_TYPE_CHECK_CMD}}`).

---

## Step 3 — Component API lookup (when asserting on library internals)

Use the component library MCP to look up class names, slot structures, and ARIA roles. Never guess.

---

## General rules

1. Read the target file(s) before writing tests.
2. Cover: **rendering**, **role-gated UI per role**, **i18n keys**, **async states** (loading/empty/error/success), **user interactions**.
3. Never leave empty test bodies or stubs.
4. Do not duplicate existing tests.
5. Prefer `data-testid` selectors over class/tag selectors.

---

## Test Structure (framework-agnostic)

Principles hold on any frontend stack; the code blocks below are **examples for
{{FRONTEND_FRAMEWORK}} + {{FRONTEND_UI_LIBRARY}}** — adapt them to the project's real test
tooling (the LLM regenerator does this automatically).

### Mount factories — use instead of repeating mount args

```typescript
export function mountComponent(props = {}, storeState = {}) {
  return mount(Component, {
    props,
    global: {
      plugins: [createTestingPinia({ initialState: storeState })],
    },
  })
}
```

Reuse in every test file that touches that component.

### i18n — mock, assert on keys

Mock the i18n function and assert on translation keys, not translated strings — keys are stable, strings change.

### Store testing

- Stub actions (default) for component rendering tests that shouldn't trigger side effects.
- Real actions only when testing the action itself.

### API calls — never hit a real backend

Mock at module level. For polling components, use fake timers and advance time explicitly.

### Role-gated rendering — test every role

```typescript
it.each([
  ['admin', true],
  ['supervisor', true],
  ['lawyer', false],
])('action visible=%s for %s', (role, visible) => {
  const wrapper = mountComponent({}, { auth: { role } })
  expect(wrapper.find('[data-testid="action-btn"]').exists()).toBe(visible)
})
```

---

## Recommended best practices (suggestions — not blockers)

Pull the testing-related **Recommended** items from `docs/architecture/best-practices.md` and
offer the ones this target would benefit from. Typical examples — adapt to the real stack:

- Assert on i18n keys and `data-testid`/roles, not translated strings or class names.
- Cover every async state (loading / empty / error / success) and every role variant.
- Add an accessibility smoke check (roles, labels, keyboard focus) for new interactive UI.
- Use fake timers for polling/debounced behavior; never `sleep` on real time.

State these as suggestions with a one-line rationale; do not fail a task for skipping them.

---

## Output format

1. Show the full test file(s) to create or extend — no partial snippets.
2. After the code: **what is tested**, **what is NOT tested yet**, **factories defined**.
3. End with the exact test command:
   ```
   cd {{FRONTEND_DIR}} && {{FRONTEND_TEST_CMD}}
   ```
4. Run the new tests and report results — do not declare done with failing tests.
