# B2 — Golden per-stack fixture test

**Goal:** One test that runs `init` (or the scaffold+map pipeline) against fixture repos for
Go/Echo, Rust/Axum, NestJS, and Django, and asserts the generated skills contain the right
commands and **no** wrong-stack tooling. This single test would have caught the headline bug and
guards every future detection change — the cheapest insurance in the scorecard.

**Depth:** Medium — fixtures + a harness + per-stack assertions.

## Files

- **New** `src/__tests__/fixtures/golden/{go-echo,rust-axum,nestjs,django}/` — minimal but
  realistic project trees (manifests, a few source files, configs).
- **New** `src/__tests__/golden/init-golden.test.ts` — the harness.
- Possibly **edit** `src/__tests__/fixtures.ts` to reuse existing fixture scaffolding.

## Approach

1. Build 4 fixture repos with the real markers (go.mod with `go 1.22`, Cargo.toml with axum,
   package.json with `@nestjs/core`, manage.py + Django dep).
2. Harness runs the **non-LLM** path (`--no-llm`, deterministic) end-to-end: detect → map →
   scaffold → customize, into a temp dir.
3. Assert per stack:
   - test/lint/format/migrate commands match the stack (Go → `go test ./...`, `golangci-lint`;
     Rust → `cargo test`, `clippy`; Django → `pytest`/`ruff` only here),
   - **no** foreign tooling appears (grep generated skills for `ruff`/`pytest` on Go/Rust/Node
     → zero hits),
   - no leftover `{{...}}` placeholders,
   - reported language version equals the fixture's real directive.
4. Wire into CI so every detection change must keep it green.

## Decisions

- **Deterministic (`--no-llm`) for the golden assertions.** Tests the static/fallback path
  precisely; the LLM path is non-deterministic and covered by manual integration (P3).
- **Grep-for-foreign-tooling is the key assertion.** It's exactly the failure mode that shipped.

## Verification (must be able to fail)

- The test itself is the verification. Sanity: temporarily reintroduce a Django default on the Go
  path → the Go fixture assertion must fail. (Run once during impl to prove the test bites.)

## Effort

~half day. Risk: low. Depends on: ideally lands beside B10/C2 so it locks them; can be written
first against current behavior, then tightened.
