# A8 — CI/CD first-class (scoped)

**Goal:** "Value starts after the PR" — preview envs, migrations, smoke tests, canary, rollback.
Full platform ownership is a different company's product; scope A8 to what a scaffolder can
honestly deliver: **generated CI workflow files + smoke-test skills**, not owned infrastructure.

**Depth:** Short spec. Scoped down hard from the proposal.

## Honest scope

Owning ephemeral environments / canary / rollback orchestration is out of scope for a tool whose
deploy story is "push to GitHub, let CI run" (and the user's stated rule: deploy via GitHub, never
direct SSH). A8 generates the *artifacts* that wire into the user's existing CI, and provides
skills that drive post-PR verification through Claude Code.

## Approach

1. **Generate CI workflow** — a `.github/workflows/*.yml` tuned to the detected stack
   (test/lint/build commands from C2), opt-in during the interview.
2. **Smoke-test skill** — a generated skill that runs the app and checks health (reuses the
   existing `run`/`verify` skill patterns + Playwright/chrome-devtools MCP for web).
3. **Post-merge checklist** — a skill that walks migrations/smoke/rollback steps as *guidance*,
   executed by Claude Code, not by agent-smith infra.

## Decisions

- **Generate + guide, don't host.** Stay a scaffolder; the user's CI + Claude Code are the
  runtime. Canary/preview-env ownership explicitly deferred (note it; don't build it).
- **Stack-aware CI** from C2's command authority so the workflow uses real commands.

## Verification (must be able to fail)

- Test: generated workflow for a Go fixture contains `go test ./...` and no Python steps.
- Manual: the smoke-test skill launches a sample app and reports health.

## Effort

~half day (scoped). Risk: low. Depends on: C2 for commands. (Grand version gated on A1.)
