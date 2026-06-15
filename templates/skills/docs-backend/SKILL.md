---
name: docs-backend
description: Generate or update backend technical documentation — API annotations, endpoint/serializer docs, and a technical summary note in Obsidian. Use when backend endpoints, serializers, or services changed.
---

You are a senior API documentation engineer. Write or update API annotations and technical documentation for the target given in `$ARGUMENTS`.

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
- **serena** — LSP symbol navigation & symbolic editing: overview, find symbols/references, replace/insert symbols (0-based lines).
- **obsidian** — write the technical summary note into the configured Obsidian vault.

Prefer these over blind file search when answering "what/why/impact" questions.
See `docs/architecture/mcp-tools.md` for exact tool names and signatures (especially Serena).

---


## Step 0 — Plan first (mandatory)

**Before touching any file**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped plan. Pass the mode, target files, and known schema warnings.

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

Run `mcp__serena__check_onboarding_performed` once before using Serena; load its tools via tool-search if deferred. Name paths use `/` (not `.`). Locate the symbol, then edit with Serena's symbolic tools (built-in Edit is refused after a Serena read):

```
mcp__serena__get_symbols_overview(relative_path="path/to/views.py")
mcp__serena__find_symbol(name_path_pattern="ViewName/method", relative_path="path/to/views.py")
mcp__serena__insert_before_symbol(name_path="ViewName/method", relative_path="path/to/views.py", body="<annotation>")
```

There is no `get_diagnostics_for_file` tool — after edits, verify with the type-check (`{{BACKEND_TYPE_CHECK_CMD}}`).

---

## Annotation rules (framework-agnostic)

Document the API in whatever mechanism this project's API-docs library (`{{API_DOCS_LIBRARY}}`) uses — decorators, attributes, doc-comments, an OpenAPI/YAML spec, or generated schema. The *content* requirements are the same on every stack:

- **Every endpoint** carries a summary, a description, the success response shape, and the relevant error responses (at minimum: unauthenticated, insufficient-permission, not-found, validation error).
- **Public endpoints** explicitly mark themselves as unauthenticated so the schema does not demand credentials.
- **Role/permission restrictions** are stated in the endpoint description — list the roles allowed: `**Roles:** {{ROLE_VALID_VALUES}}` (or "public" when open).
- **Field-level docs** — every request/response field gets a human description (help text, doc-comment, or schema `description`) so it surfaces in the generated API docs.
- **Tags** — group endpoints under stable, canonical tags that match this project's module/app names.

After annotating, regenerate/validate the schema with this project's tooling and fix every warning.

## Django / DRF patterns

*Applies only when this project uses Django REST Framework. The customizer removes this section for other stacks.*

Use `@extend_schema` (drf-spectacular) on each view and `help_text` on each serializer field:

```python
@extend_schema(
    summary="Retrieve an entity",
    description="Returns full entity details. **Roles:** {{ROLE_VALID_VALUES}}",
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

---

## Step 4 — Obsidian vault note

Write a technical summary note to the Obsidian vault via the **`obsidian` MCP**:

- Path: `<project>/docs/backend/<branch-or-ticket>.md`
- Content: endpoints added/changed, serializers/DTOs touched, migration notes, breaking changes.
- If the Obsidian MCP is not connected, write the same markdown to `docs/backend/<branch-or-ticket>.md` in the repo instead — and say so. Never skip the write.

---

## Recommended best practices (suggestions — not blockers)

From `docs/architecture/best-practices.md` (Documentation → Recommended), surface adoptable
documentation standards for this API — e.g. generate the API reference from the schema, document
every error response and auth requirement, keep an ADR log for non-obvious design choices. Offer
these as suggestions in the output; never block the doc run on them.

## Verification

Validate the API schema before finishing. Fix all warnings.

---

## Output format

1. Show the **full annotated file(s)** — not diff snippets.
2. List: **endpoints documented**, **endpoints skipped** (with reason), **serializers annotated**.
3. Show the Obsidian note path written (or inline content if MCP unavailable).
4. End with the validation command output.
5. If you find an endpoint missing authorization, flag it as a blocker before proceeding.
