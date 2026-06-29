---
name: docs-backend
description: Generate or update backend technical documentation — API annotations, endpoint and request/response schema docs, and a technical summary note in Obsidian. Use when backend endpoints, request/response schemas, or services changed.
---

You are a senior API documentation engineer. Write or update API annotations and technical documentation for the target given in `$ARGUMENTS`. This project's backend stack is **{{BACKEND_FRAMEWORK_DETAIL}}**.

**Two modes:**
- `$ARGUMENTS` is empty or `all` → **from-scratch mode**: audit every endpoint and annotate the full API surface.
- `$ARGUMENTS` is a path, app name, or `latest` → **incremental mode**: scope to git diff or named files only.

**Architecture reference:** `docs/architecture/backend-architecture.md`.
**Engineering standards:** `docs/architecture/best-practices.md` — keep docs aligned with the Followed standards; flag Recommended doc practices the API could adopt.

## How this runs (LLM + write path)

- **LLM engine:** this skill runs inside the Claude Code session — the Claude Code CLI *is* the LLM. There is no `--llm` flag, no API key, and no external model to configure; generation is on by default whenever you run the skill. The optional `/advisor` step (below) only swaps the *planning* model when one is configured.
- **Write path:** documentation is written to the project's Obsidian vault through the **`obsidian` MCP** by default. If that MCP is not connected, fall back to writing the same markdown into `docs/` in the repo — never skip the write.
- **Stack-agnostic:** every command, path, and annotation style below comes from this project's detected stack via `{{...}}` variables. Nothing here is tied to a specific framework — follow the generic rules and apply the framework-specific block only if it matches this project.

## Available MCP tools

These MCP servers are configured for this project — use the ones relevant to the step:

- **gitnexus** — code graph: impact, callers, route maps, blast radius before/after changes.
- **git-memory** — why code changed: commit history, bug-fix history, file timelines.
- **obsidian** — write the technical summary note into the configured Obsidian vault.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures.

---


## Step 0 — Plan first (mandatory)

**Before touching any file**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped plan. Pass the mode, target files, and known schema warnings.

---

## Step 1 — GitNexus code analysis

```
gitnexus_route_map()                   # full HTTP verb + path + handler index
gitnexus_query("HandlerName")          # find the symbol, its file, its methods
gitnexus_impact("RequestResponseType") # what else references this schema/DTO?
gitnexus_context("path/to/handler")    # full module-level context
gitnexus_detect_changes()              # files changed since last index snapshot
gitnexus_api_impact()                  # which endpoints are affected?
```

**Rule:** never open a file to "explore" — use GitNexus first.

---

## Step 2 — Gather scope

### Incremental mode
1. `git diff origin/main...HEAD --name-only` to list changed files.
2. Filter to files containing API endpoints, request/response schemas, routes.
3. Cross-reference with `gitnexus_api_impact()` — annotate the union.

### From-scratch mode
1. `gitnexus_route_map()` to enumerate all endpoints.
2. Find all request-handler and request/response-schema files.
3. Read every file. Map handler → request/response schema → route/URL pattern.

---

## Step 3 — Annotation implementation

Locate the handler/symbol with Grep/Glob, then add the annotation with the built-in Edit tool:

```
Grep("class HandlerName\|def method_name", include="**/*.py")   # locate the handler
Read("path/to/handler")                                          # read to confirm location
Edit("path/to/handler", old_string="...", new_string="...")      # insert the annotation immediately before the handler
```

After edits, verify with the type-check (`{{BACKEND_TYPE_CHECK_CMD}}`).

---

## Annotation rules (framework-agnostic)

Document the API in whatever mechanism this project's API-docs library (`{{API_DOCS_LIBRARY}}`) uses — decorators, attributes, doc-comments, an OpenAPI/YAML spec, or generated schema. The *content* requirements are the same on every stack:

- **Every endpoint** carries a summary, a description, the success response shape, and the relevant error responses (at minimum: unauthenticated, insufficient-permission, not-found, validation error).
- **Public endpoints** explicitly mark themselves as unauthenticated so the schema does not demand credentials.
- **Role/permission restrictions** are stated in the endpoint description — list the roles allowed: `**Roles:** {{ROLE_VALID_VALUES}}` (or "public" when open).
- **Field-level docs** — every request/response field gets a human description (help text, doc-comment, or schema `description`) so it surfaces in the generated API docs.
- **Tags** — group endpoints under stable, canonical tags that match this project's module/app names.

After annotating, regenerate/validate the schema with this project's tooling and fix every warning.

## Framework-specific annotation ({{BACKEND_FRAMEWORK}})

*Apply this project's API-docs mechanism — **{{API_DOCS_LIBRARY}}** on **{{BACKEND_FRAMEWORK}}**. The exact decorator/attribute/annotation syntax depends on the stack; follow the idiom {{API_DOCS_LIBRARY}} uses on {{BACKEND_FRAMEWORK}}.*

On every request handler, attach the API-docs annotation with the four content requirements above, and give every request/response field a human description. The concrete shape — for example a schema-annotation decorator on the handler plus per-field descriptions on the request/response (DTO/serializer) type — looks like this:

```
ANNOTATE handler "Retrieve an entity":
    summary     = "Retrieve an entity"
    description = "Returns full entity details. **Roles:** {{ROLE_VALID_VALUES}}"
    responses   =
        200 -> EntityResponseSchema
        401 -> "Missing or invalid credentials"
        403 -> "Insufficient role"
        404 -> "Entity not found"
    tags        = ["<module-name>"]
```

---

## Step 4 — Obsidian vault note

Write a technical summary note to the Obsidian vault via the **`obsidian` MCP**:

- Path: `<project>/docs/backend/<branch-or-ticket>.md`
- Content: endpoints added/changed, request/response schemas (DTOs/serializers) touched, migration notes, breaking changes.
- If the Obsidian MCP is not connected, write the same markdown to `docs/backend/<branch-or-ticket>.md` in the repo instead — and say so. Never skip the write.

---

## Recommended best practices (suggestions — not blockers)

From `docs/architecture/best-practices.md` (Documentation → Recommended), surface adoptable
documentation standards for this API — e.g. generate the API reference from the schema, document
every error response and auth requirement, keep an ADR log for non-obvious design choices. Offer
these as suggestions in the output; never block the doc run on them.

## Verification

Validate the API schema before finishing. Fix all warnings.

Any code annotations added (docstrings, decorator arguments, schema descriptions) must survive the project's type-check and test gate — run `{{BACKEND_TYPE_CHECK_CMD}}` and `{{BACKEND_TEST_CMD}}` after annotating and fix any failures before writing the Obsidian note.

---

## Test-driven development (mandatory)

Follow RED-first TDD: write the failing test(s) first and run them to confirm they fail for the right reason, then implement until green. Never write tests after the code. This is the failable-verification stage of smith-mode.

---

## Output format

1. Show the **full annotated file(s)** — not diff snippets.
2. List: **endpoints documented**, **endpoints skipped** (with reason), **request/response schemas (DTOs/serializers) annotated**.
3. Show the Obsidian note path written (or inline content if MCP unavailable).
4. End with the validation command output.
5. If you find an endpoint missing authorization, flag it as a blocker before proceeding.
