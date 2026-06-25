# A9 — Generated permission system (config + deny hooks per role)

**Goal:** Emit a real, enforceable permission layer from a per-role policy: command allowlists,
denied commands, and tool scopes — as **generated Claude Code config + PreToolUse deny hooks**.
Highest-value safety item and uniquely well-fitted: the runtime (Claude Code) already enforces
settings/permissions and the repo already scaffolds hooks. No execution engine needed.

**Depth:** Medium — a policy schema + a generator + a deny-hook template + tests.

## Files

- **New** `templates/policies/` or extend the interview — a per-role policy
  (`{ role, shell: {allowed, denied}, tools: {allowed, denied} }`).
- **Edit** `src/scaffold/configs.ts` — emit permission blocks into `.claude/settings.json`.
- **New** `hooks/pre-tool-permission-guard.js` — denies disallowed Bash/tool calls per policy.
- **Edit** `src/scaffold/hooks.ts` — register the guard in `buildHookConfig` (PreToolUse/Bash).
- **Edit** `src/__tests__/` — policy → settings + hook-decision tests.

## Approach

1. Define the policy schema (example from the review: `backend-dev: shell.allowed:[npm test,
   dotnet test]; denied:[rm -rf]`). Seed defaults per detected stack; let the interview refine.
2. `scaffoldConfigs` writes the `permissions` block of `.claude/settings.json` from the policy.
3. The PreToolUse guard hook reads the policy and **blocks** a Bash command / tool call that
   matches a deny rule (or isn't in an allowlist when allowlist-mode is on), returning the
   hook deny decision JSON.
4. Stack-aware defaults: a Go project's allowlist has `go test ./...`; a Node project `npm test`.

## Decisions

- **Generated config + hook, not a new runtime.** Enforcement is Claude Code's; agent-smith only
  emits the policy artifacts. This is why A9 fits today.
- **Deny-by-rule first; allowlist-mode opt-in.** Full allowlisting is stricter but noisier;
  default to denylist for known-dangerous ops, offer allowlist via the interview.
- **Network/secret isolation is out of scope** (host/OS concern) — note it, don't build it.

## Verification (must be able to fail)

- Test: policy with `denied:[rm -rf]` → guard hook returns a deny decision for `rm -rf /tmp/x`
  and an allow for `go test ./...`.
- Test: `scaffoldConfigs` writes the expected `permissions` block from a sample policy.

## Effort

~1 day. Risk: low–medium (hook decision JSON shape must match Claude Code's contract — verify
against current schema). Depends on: none.
