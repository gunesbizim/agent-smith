# B9 — Pipeline honesty (label the stubs)

**Goal:** `runPipeline`/`executePhase` return hardcoded `{success:true, summary}` — no real
work. A user running `agent-smith ticket PROJ-123 --auto` sees "PR created" with no PR. Until
the engine is real (Phase 5 / A1), label these commands honestly so the CLI doesn't lie.

**Depth:** Short — the 20-minute honesty fix from the review. (Real implementation = A1.)

## Files

- **Edit** `src/cli/index.ts` — command descriptions for `ticket` and `pipeline`.
- **Edit** `src/cli/ticket.ts`, `src/cli/pipeline.ts` — print an explicit experimental banner.
- **Edit** `README.md` — mark the autonomous pipeline section as experimental / not-yet-wired.
- **Edit** `vault/agent-smith/09-pipeline.md` — same caveat.

## Approach

1. Append `(experimental — orchestration not yet wired; see roadmap A1)` to the `ticket` and
   `pipeline` command descriptions in commander.
2. At the top of each command's run, print a yellow banner: "Experimental: this prints a planned
   phase sequence but does not yet execute it." Keep the phase output (it's a useful preview).
3. Soften README claims from "autonomous ticket-to-PR pipeline" to "planned pipeline (preview)".

## Decision

**Label, don't gut.** The phase scaffold is a useful preview and the foundation A1 builds on.
The fix is truth-in-advertising, not deletion.

## Verification (must be able to fail)

- Test: `pipeline`/`ticket` stdout contains the experimental banner string.
- Grep README/vault for "autonomous ticket-to-PR" presented as a shipped capability → zero
  unqualified hits.

## Effort

~30 min. Risk: none. Superseded by A1 when the engine ships.
