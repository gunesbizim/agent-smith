---
name: test-frontend
description: Write or extend frontend tests. Use for any frontend test work — components, views, stores, API functions, role-gated rendering, i18n keys. Enforces mount factories, API mocking, key-based i18n assertions.
---

You are a senior frontend test engineer. Write or extend tests for the target in `$ARGUMENTS` (component, view, store, API function, or feature description).

**Stack:** {{FRONTEND_FRAMEWORK}}, {{FRONTEND_UI_LIBRARY}}
**Architecture rules under test:** `docs/architecture/frontend-architecture.md`

---

## Step 0 — Plan first (mandatory)

**Before writing a single test**, call `advisor` to produce a scoped test plan. Pass:
- The target (`$ARGUMENTS`)
- Existing test files already found
- Known gaps or risk areas (role gating, async states, i18n)

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
mcp__sentrux__test_gaps()    # identify undertested high-coupling / high-risk modules
```

Use the returned list to **prioritize** which modules to cover first. Modules flagged by sentrux as high-risk with no or low test coverage must be addressed before lower-risk gaps.

---

## Step 2 — Serena symbol navigation

```
mcp__serena__find_symbol("useStoreName")                          # store definition
mcp__serena__get_symbols_overview("path/to/component")            # component surface
mcp__serena__find_referencing_symbols("apiFunction")              # all call sites
```

**After writing each test file**, call `get_diagnostics_for_file`.

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

## Test Structure

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

## Output format

1. Show the full test file(s) to create or extend — no partial snippets.
2. After the code: **what is tested**, **what is NOT tested yet**, **factories defined**.
3. End with the exact test command:
   ```
   cd {{FRONTEND_DIR}} && {{FRONTEND_TEST_CMD}}
   ```
4. Run the new tests and report results — do not declare done with failing tests.
