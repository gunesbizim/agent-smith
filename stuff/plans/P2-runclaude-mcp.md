# P2 — `runClaude` project-MCP access

**Goal:** Let the headless-claude runner boot with the project's MCP servers instead of the
hardcoded empty `'{"mcpServers":{}}'`, so skill generation can use gitnexus/serena/git-memory.

**Depth:** Short — one new option, an argv change, a guarded default, one test.

## Files

- **Edit** `src/analyze/claude-runner.ts` — extend `ClaudeRunOptions`, branch the `--mcp-config` argv.
- **Edit** `src/__tests__/analyze/claude-runner.test.ts` (or create) — argv assertion.

## Approach

1. Add to `ClaudeRunOptions`:
   - `mcpConfigPath?: string` — path to an `.mcp.json` to pass through.
   - `suppressHooks?: boolean` — see P3 (kept here because it's the same spawn surface).
2. In `runClaude`, build the MCP args:
   - If `mcpConfigPath` is set **and the file exists**, pass `--mcp-config <path>` (keep
     `--strict-mcp-config` so only that file's servers load — no user-global leakage).
   - Else keep today's behavior exactly: `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`.
3. `suppressHooks` → append the flag/settings override that disables project hooks for this
   spawn (exact mechanism resolved in P3; P2 just threads the option and the argv).

## Decisions

- **Default unchanged.** Every existing caller (stack classification, arch docs) keeps the
  zero-MCP isolated path. Only the generation caller opts into project MCP. This keeps the fast
  detection path deterministic and dependency-free.
- **File-exists guard.** If the project has no `.mcp.json` yet, silently fall back to zero-MCP
  rather than passing a path that makes `claude` error — generation should degrade, not crash.
- **Keep `--strict-mcp-config`.** We want *only* the project's declared servers, never the
  developer's user-scope MCP set, so generation is reproducible across machines.

## Verification (must be able to fail)

- Test: `mcpConfigPath` set + file exists → argv includes `--mcp-config <thatPath>` and
  **not** the empty-object literal.
- Test: `mcpConfigPath` set + file missing → argv falls back to the empty-object literal.
- Test: no option → argv identical to today (regression guard).

## Effort

~30–45 min. Risk: low. Note: cannot end-to-end test that MCP servers actually boot in CI
(no claude binary) — argv-shape tests are the failable proxy; real boot is verified manually
in P3's integration check.
