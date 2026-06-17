---
name: smoke-test
description: Post-PR verification — launch the app and check health, then walk the migrate/smoke/rollback checklist. Use after a merge or before a release to confirm the running app is healthy. Guidance executed by Claude Code, not by agent-smith infra.
---

You verify a change actually works in the running app and guide post-merge steps. agent-smith
generates this skill; **Claude Code is the runtime** — there is no agent-smith deploy engine.

## Step 0 — Plan (fable-mode for multi-step verification)

For anything beyond a single check, follow `.claude/skills/fable-mode/SKILL.md`: stage map →
delegate → failable verification → self-critique.

## Step 1 — Launch the app

Use the project's real run command (`{{FRONTEND_DEV_SERVER_CMD}}` for web, or the backend's
documented start command). For a web app, drive it with the Playwright / chrome-devtools MCP;
for a CLI/service, invoke it and inspect output/exit code.

## Step 2 — Health checks (failable)

- Hit the health/readiness endpoint (or run the smoke command) and assert a 2xx / expected output.
- Exercise one critical happy-path flow end-to-end.
- A check that cannot fail is not a check — assert a concrete observable, never "looks fine".

## Step 3 — Post-merge checklist (guidance)

Walk these as guidance (you execute via Claude Code; agent-smith does not own infra):
1. **Migrations** — run pending DB migrations with the project's real migrate command; confirm success.
2. **Smoke** — repeat Step 2 against the deployed/staging target.
3. **Rollback readiness** — confirm the previous release is recoverable (tag/image/commit), and
   note the exact rollback command before promoting.

## Output

Report: launched (y/n), health result per check (with the observed value), checklist status,
and a clear go / no-go verdict with the reason.
