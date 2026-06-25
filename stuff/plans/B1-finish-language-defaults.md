# B1 — Finish the Python-on-non-Python fix

**Goal:** The headline bug (Go projects emitting `ruff`/`pytest`) is *mostly* fixed already —
`best-practice-mapper.ts` has per-language blocks and a guard. This plan closes it out by routing
the remaining static command decisions through C2 so no stack-default can leak, and removing the
last hardcoded residue (TS frameworks stamped `5.x`, Rust `"stable"`).

**Depth:** Short — mostly subsumed by B10 + C2; this is the cleanup + proof.

## Files

- **Edit** `src/analyze/best-practice-mapper.ts` — remove any remaining unconditional defaults.
- **Edit** `src/analyze/project-detector.ts` / registry (B10) — parse real TS version; Rust
  toolchain version where available (rust-toolchain.toml) else honest `"unknown"` not `"stable"`.

## Approach

1. After C2 lands, audit `best-practice-mapper.ts` for any path that sets a command without
   evidence; route each through C2's authority order.
2. Replace `languageVersion:"stable"` (Rust) and the `5.x` TS stamp with parsed values or honest
   `"unknown"`.
3. This plan is the *acceptance gate* for "no Python tooling on non-Python projects", proven by
   the B2 golden suite.

## Decision

**Treat B1 as the verification milestone for B10+C2**, not separate logic. If B2 passes for all
fixture stacks, B1 is closed.

## Verification (must be able to fail)

- B2 golden suite green for Go/Rust/NestJS/Django: each generated skill carries only its own
  stack's commands; zero cross-stack tooling.
- Test: TS project reports the real `typescript` dep version, not `5.x`.

## Effort

~1 hr (post B10/C2). Risk: low. Depends on: B10, C2, B2.
