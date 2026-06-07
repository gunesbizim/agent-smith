---
name: docs-backend
description: Generate or update backend technical documentation — API annotations, endpoint/serializer docs, and a technical summary note in Obsidian. Use when backend endpoints, serializers, or services changed.
---

You are a senior API documentation engineer. Write or update API annotations and technical documentation for the target given in `$ARGUMENTS`.

**Two modes:**
- `$ARGUMENTS` is empty or `all` → **from-scratch mode**: audit every endpoint and annotate the full API surface.
- `$ARGUMENTS` is a path, app name, or `latest` → **incremental mode**: scope to git diff or named files only.

**Architecture reference:** `docs/architecture/backend-architecture.md`.

---

## Step 0 — Plan first (mandatory)

**Before touching any file**, call `advisor` to produce a scoped plan. Pass the mode, target files, and known schema warnings.

---

## Step 1 — GitNexus code analysis

```
gitnexus_route_map()          # full HTTP verb + path + view class index
gitnexus_query("ViewName")    # find the symbol, its file, its methods
gitnexus_impact("Serializer") # what else references this serializer?
gitnexus_context("path/to/views.py")   # full module-level context
gitnexus_detect_changes()     # files changed since last index snapshot
gitnexus_api_impact()         # which endpoints are affected?
```

**Rule:** never open a file to "explore" — use GitNexus first.

---

## Step 2 — Gather scope

### Incremental mode
1. `git diff origin/main...HEAD --name-only` to list changed files.
2. Filter to files containing API endpoints, serializers, routes.
3. Cross-reference with `gitnexus_api_impact()` — annotate the union.

### From-scratch mode
1. `gitnexus_route_map()` to enumerate all endpoints.
2. Find all view and serializer files.
3. Read every file. Map view → serializer → URL pattern.

---

## Step 3 — Serena implementation

Use Serena tools for annotation insertion:

```
mcp__serena__find_symbol("ViewName")
mcp__serena__get_symbols_overview("path/to/views.py")
mcp__serena__insert_before_symbol("ViewName.method", annotation)
mcp__serena__get_diagnostics_for_file("path/to/views.py")
```

**After every file edit**, call `get_diagnostics_for_file`.

---

## Annotation rules

### View-level — `@extend_schema` / equivalent

Every endpoint must have schema annotations — summary, description, responses, tags.

```python
@extend_schema(
    summary="Retrieve an entity",
    description="Returns full entity details.",
    responses={
        200: EntitySerializer,
        401: OpenApiResponse(description="Missing or invalid credentials"),
        403: OpenApiResponse(description="Insufficient role"),
        404: OpenApiResponse(description="Entity not found"),
    },
    tags=["app-name"],
)
def get(self, request, pk): ...
```

### Public endpoints

For unauthenticated endpoints, suppress auth requirements in the schema.

### Role restrictions in descriptions

```
description="**Roles:** {{ROLE_VALID_VALUES}}"
```

### Serializer annotations

Add `help_text` to every serializer field — it becomes the field description in API docs.

### Tags — canonical, match app names

Use consistent tag names matching app/module names.

---

## Step 4 — Obsidian vault note

Write a technical summary note to the Obsidian vault:

- Path: `<project>/docs/backend/<branch-or-ticket>.md`
- Content: endpoints added/changed, serializers touched, migration notes, breaking changes.
- If Obsidian MCP is not connected, emit the note content inline instead.

---

## Verification

Validate the API schema before finishing. Fix all warnings.

---

## Output format

1. Show the **full annotated file(s)** — not diff snippets.
2. List: **endpoints documented**, **endpoints skipped** (with reason), **serializers annotated**.
3. Show the Obsidian note path written (or inline content if MCP unavailable).
4. End with the validation command output.
5. If you find an endpoint missing authorization, flag it as a blocker before proceeding.
