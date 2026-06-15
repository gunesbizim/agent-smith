---
name: docs-frontend
description: Generate human-readable, styled user documentation by driving the running app with Playwright MCP, taking real screenshots per role, and writing the guide to the Obsidian vault. Use when frontend views/flows changed.
---

You are a senior technical writer. Produce **human-readable, styled user documentation** — "how to use the system" — for the target given in `$ARGUMENTS` (a view, flow, or `latest` for the branch diff). The audience is end users, not developers.

**This skill documents by SHOWING:** every documented flow is driven live in the browser via Playwright MCP and illustrated with real screenshots per role.

---

## Step 0 — Plan first (mandatory)

**Before navigating anywhere**, use Claude Code's built-in `/advisor` (a stronger planning model; falls back to the current session model if no advisor is configured) to produce a scoped documentation plan. Pass:
- The target (`$ARGUMENTS` or changed views from `git diff origin/main...HEAD --stat -- {{FRONTEND_DIR}}/`)
- Which roles see the flow differently
- Existing guide sections in Obsidian that need updating vs creating

---

## Step 1 — Identify what changed (incremental mode)

```
git diff origin/main...HEAD --name-only -- {{FRONTEND_DIR}}/views {{FRONTEND_DIR}}/components
gitnexus_detect_changes()        # map diff to affected flows
gitnexus_query("ChangedView")    # which user flows pass through the changed view?
```

Document only flows touched by the diff (unless `$ARGUMENTS = all` → full system guide).

---

## Step 2 — Prepare the running app

1. Dev server must be running: `cd {{FRONTEND_DIR}} && {{FRONTEND_DEV_SERVER_CMD}}` (ask the user to start it if not).
2. Backend running with dev auth so roles can be switched.
3. If either is unavailable, **say so and stop** — never fabricate screenshots or describe UI from code alone.

---

## Step 3 — Drive the app and capture (Playwright MCP)

For **each role** whose experience differs in the documented flow:

```
mcp__playwright__browser_navigate("http://localhost:3000/<route>")
mcp__playwright__browser_resize(1440, 900)
mcp__playwright__browser_snapshot()              # a11y tree — find elements to interact with
mcp__playwright__browser_click / browser_type / browser_fill_form   # walk the real flow
mcp__playwright__browser_take_screenshot(filename="<flow>-<role>-<step>.png")
mcp__playwright__browser_wait_for(...)           # wait for async states (job polling, toasts)
```

**Capture rules:**
- Screenshot every meaningful step: entry screen → filled form → confirmation → result.
- Capture role differences explicitly.
- Capture state variants: empty list, loading, success toast, error banner.
- Name files `<flow>-<role>-<step>.png` — stable, re-runnable names. The playwright MCP is configured with `--output-dir .playwright-mcp`, so files land in the gitignored `.playwright-mcp/` directory (never committed). Reference them as `.playwright-mcp/<flow>-<role>-<step>.png` when embedding.

**Console check:** `mcp__playwright__browser_console_messages` after each flow — flag errors as a smoke test but continue documenting.

---

## Step 4 — Write the guide (Obsidian MCP)

Write the guide to the Obsidian vault:

- Path: `<project>/docs/user-guide/<flow-name>.md` (one note per flow; update existing notes in place).
- Embed captured screenshots.
- If Obsidian MCP is not connected, write to `docs/user-guide/<flow-name>.md` in the repo instead.

### Guide structure — per flow

```markdown
# <Flow name>

> Who can do this: <list roles that can>

## What this is for
2–3 sentences, plain language, no jargon.

## Step by step
1. **Open** ... (screenshot)
2. **Fill** ... (screenshot)
3. **Click** ... what happens next
4. **Result** ... (screenshot)

## Differences by role
| | Role A | Role B | Role C |
|---|---|---|---|
| <action> | ✓ | ✓ | ✗ shows disabled button with tooltip |

## Things to know
- What error messages mean and what to do about them.
```

### Style rules

- Plain language. Write for end users, not developers — no HTTP verbs, no component names, no status codes.
- UI labels quoted as they appear on screen, with explanation.
- Every step has a screenshot — a step without one is a TODO, not done.
- Role differences always explicit — never "some users may not see this".
- Async behavior explained in human terms.

---

## Step 5 — Verify

- [ ] Every documented step was actually performed in the browser this session.
- [ ] Every screenshot file exists and is referenced in the guide.
- [ ] All roles checked (or the guide states which roles the flow applies to).
- [ ] Guide written to Obsidian vault (or repo fallback, explicitly noted).

---

## Output format

1. List flows documented + roles covered per flow.
2. List screenshot files captured.
3. Obsidian note paths written (or repo fallback paths).
4. Console errors encountered during walkthroughs (flagged for the team).
5. Flows that could NOT be documented (server down, role unavailable, feature behind 501).
