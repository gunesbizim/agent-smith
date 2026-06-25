---
name: test-backend
description: Write or extend backend tests. Use for any backend test work — service methods, views, repositories, permissions, audit, encryption. Enforces unit test settings, integration test marking, fixture extraction, fail-closed role coverage.
---

You are a senior backend test engineer. Write or extend tests for the target in `$ARGUMENTS` (file path, app name, function name, or feature description).

**Stack:** {{BACKEND_LANG}}, {{BACKEND_FRAMEWORK_DETAIL}}
**Architecture rules under test:** `docs/architecture/backend-architecture.md`
**Engineering standards:** `docs/architecture/best-practices.md` (Followed = enforce; Recommended = surface as suggestions)

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **serena** — LSP symbol navigation & symbolic editing: overview, find symbols/references, replace/insert symbols (0-based lines).
- **sentrux** — after adding tests, run `sentrux gate .` to confirm coverage/complexity did not regress the baseline.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures (especially Serena).

---


## Step 0 — Plan first (mandatory)

**Before writing a single test**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped test plan. Pass:
- The target (`$ARGUMENTS`)
- Existing test files already found
- Known gaps or risk areas (permissions, audit, encryption)

### RED-first mandate (non-negotiable)

Write each test BEFORE the implementation it covers and run it to confirm it FAILS for the right reason (not a collection or import error) before writing the code. A test that passes before the implementation exists proves nothing. Do not write tests after the fact.

---

## Step 1 — GitNexus code analysis (before writing tests)

```
gitnexus_query("TargetClassName")          # locate symbol, file, methods
gitnexus_impact("TargetClassName")         # what callers exist? what breaks if this fails?
gitnexus_context("path/to/file")           # full module context
```

**Rule:** never duplicate an existing test; never test a symbol without first running `gitnexus_impact`.

---

## Step 1.5 — Sentrux test gap analysis

```
mcp__sentrux__scan({path: process.cwd()})   # MUST be first — indexes the project
mcp__sentrux__test_gaps()                    # identify undertested high-coupling / high-risk modules
```

Use the returned list to **prioritize** which modules to cover first. Modules flagged by sentrux as high-risk with no or low test coverage must be addressed before lower-risk gaps.

---

## Step 2 — Serena symbol navigation

Run `mcp__serena__check_onboarding_performed` once before using Serena; load its tools via tool-search if deferred. Name paths use `/` (not `.`); `find_referencing_symbols` requires BOTH `name_path` and `relative_path`.

```
mcp__serena__get_symbols_overview(relative_path="path/to/file")                                    # all testable methods (start here)
mcp__serena__find_symbol(name_path_pattern="ServiceName/method_name")                              # exact line/file
mcp__serena__find_referencing_symbols(name_path="function_name", relative_path="path/to/file.py")  # all call sites
```

There is no `find_implementations` tool — find implementations via `find_referencing_symbols` on the base symbol. There is no `get_diagnostics_for_file` tool — verify by running the tests / type-check (`{{BACKEND_TYPE_CHECK_CMD}}`).

---

## General rules

1. Read the target file(s) before writing tests.
2. Cover: **happy path**, **failure paths**, **edge cases**, **permission boundaries**.
3. Never leave empty test bodies or stubs.
4. All imports {{IMPORT_STYLE}}.
5. Do not duplicate existing tests.

---

## Test Structure (framework-agnostic)

- **De-duplicate setup** — extract repeated setup into the project's reuse mechanism (fixtures,
  factories, builders, `beforeEach`); share broadly-used helpers in the conventional shared
  location, keep local helpers local.
- **Role / permission tests — verify fail-closed** — every protected entry point gets a test
  proving unauthenticated → 401 (or the project's equivalent) and wrong-role → 403. Never assume
  a path is protected; prove it.
- **Logging / telemetry** — assert the expected event is emitted with its canonical keys, using
  the project's log-capture mechanism.
- **PII / sensitive data** — assert sensitive values never appear in logs, responses, or errors.
- **Mock at the consumption site** — patch where a dependency is used, not where it is defined;
  never hit a real external service.

## Framework-specific patterns ({{BACKEND_FRAMEWORK}})

*Apply this with the idioms of **{{BACKEND_FRAMEWORK_DETAIL}}** and the project's test runner
(`{{BACKEND_TEST_CMD}}`). The generic rules above always hold; translate the shapes below into the
stack's real test API (test client, request helper, log-capture fixture, shared-setup mechanism).*

```
# Fail-closed role tests — shared setup in the project's conventional location
test "unauthenticated request -> 401":
    GET <endpoint> without credentials  =>  status == 401

test "wrong-role request -> 403":
    authenticate as a user lacking the required role
    GET <endpoint>                      =>  status == 403

# Logging assertion — capture logs and assert the canonical event/keys were emitted
test "log event emits":
    capture logs at INFO for logger "app.logger"
    call function under test
    assert a record was emitted on logger "app.logger" with the canonical keys
```

---

## Recommended best practices (suggestions — not blockers)

Pull the **Recommended** items relevant to testing from `docs/architecture/best-practices.md` and
offer the ones this target would benefit from. Typical examples — adapt to the real stack:

- Follow the test pyramid: many fast unit tests, fewer integration, fewest E2E; mark slow/integration tests.
- Assert on stable contracts (status codes, i18n keys, schema shapes), not volatile strings.
- Add property-based or table-driven cases for pure logic with many input permutations.
- Track coverage on the changed code and call out untested high-risk branches.

State these as suggestions with a one-line rationale; do not fail a task for skipping them.

---

## Output format

1. Show the full test file(s) to create or extend — no partial snippets.
2. After the code: **what is tested**, **what is NOT tested yet** (known gaps), **fixtures defined**.
3. If a shared fixture belongs in `conftest.py`, show that separately.
4. End with the exact test command:
   ```
   cd {{BACKEND_DIR}} && {{BACKEND_TEST_CMD}}
   ```
5. Run the new tests and report results — do not declare done with failing tests.
