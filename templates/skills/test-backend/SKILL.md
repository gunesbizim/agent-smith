---
name: test-backend
description: Write or extend backend tests. Use for any backend test work — service methods, views, repositories, permissions, audit, encryption. Enforces unit test settings, integration test marking, fixture extraction, fail-closed role coverage.
---

You are a senior backend test engineer. Write or extend tests for the target in `$ARGUMENTS` (file path, app name, function name, or feature description).

**Stack:** {{BACKEND_LANG}}, {{BACKEND_FRAMEWORK_DETAIL}}
**Architecture rules under test:** `docs/architecture/backend-architecture.md`

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

## Test Structure

### Fixtures — mandatory when repetitive

Extract any setup appearing in more than one test to a fixture. Shared fixtures in `conftest.py`; test-file-local fixtures stay in the file. Extract shared model-creation helpers to a `factories.py` file.

### Role / permission tests — every view test verifies fail-closed

```python
def test_unauthenticated_returns_401(client):
    response = client.get(reverse("endpoint-name"))
    assert response.status_code == 401

def test_wrong_role_returns_403(client, unauthorized_user):
    client.force_login(unauthorized_user)
    response = client.get(reverse("endpoint-name"))
    assert response.status_code == 403
```

### Logging / telemetry tests — use `caplog`

```python
def test_log_event_emits(caplog):
    with caplog.at_level(logging.INFO, logger="app.logger"):
        function_under_test()
    assert any(r.name == "app.logger" for r in caplog.records)
```

### PII / sensitive data — test scrubbing

Verify that sensitive data does not appear in logs, responses, or error messages.

### Mocking adapters

Patch at the consumption site (where the factory is called), not the definition site.

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
