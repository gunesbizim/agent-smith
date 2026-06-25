# B7 — Reconcile `insights` CLI drift

**Goal:** The README documents `npx agent-smith insights`, but `cli/index.ts` registers only
`init/configure/analyze/doctor/ticket/pipeline`. Either register the command or fix the docs.
(There is an `/insights` *skill*, which is likely the source of the confusion.)

**Depth:** Short — a doc/CLI consistency fix; pick one of two cheap paths.

## Files

- **Edit** either `src/cli/index.ts` (+ a new `src/cli/insights.ts`) **or** `README.md`.
- **Edit** docs to match whichever path is chosen.

## Approach — pick one

- **Path A (recommended): fix the docs.** Remove the `insights` CLI claim from the README;
  point users at the `/insights` skill (which runs inside Claude Code). ~15 min, zero risk.
- **Path B: implement the command.** Add an `insights` subcommand that reads the architecture
  docs + config and prints suggestions. Larger; only worth it if a *non-interactive* insights
  output is genuinely wanted outside Claude Code.

## Decision

Default to **Path A** unless you want a headless insights report. The skill already covers the
interactive case; a CLI duplicate adds surface for little gain.

## Verification (must be able to fail)

- Grep README for `agent-smith insights` → either zero hits (Path A) or the command exists and
  `--help` lists it (Path B).
- `npx agent-smith --help` output matches the README command list exactly (add a test that
  diffs the two if Path B).

## Effort

Path A ~15 min · Path B ~2 hrs. Risk: low.
