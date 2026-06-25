# B3 — Stop fabricating `sqlc`/ORM (facts only)

**Goal:** Detection must never present a guess as a detected fact. `project-detector.ts:1076`
returns `{ engine:"postgresql", orm:"sqlc" }` for any pgx/lib-pq project, while the Echo branch
hardcodes `orm:null` — a self-contradiction that then gets written into skills. Return `null`
(or only proven values) whenever the evidence is absent.

**Depth:** Short — surgical edits to detection, plus a regression test. Down-payment on C2's
"facts only, never guess" principle.

## Files

- **Edit** `src/analyze/project-detector.ts` — `detectDatabase()` (~line 1051–1076) and the Go
  framework branches' `orm`/`authMethod`/`loggingPattern` literals.
- **Edit** `src/__tests__/` — detector fixtures for Go + pgx without an ORM.

## Approach

1. `detectDatabase`: only set `orm` when a real ORM marker is present (gorm/sqlx/ent/sqlc as an
   actual dependency). pgx/lib-pq are **drivers, not ORMs** → `orm:null`, engine inferred from
   the driver only if unambiguous.
2. Reconcile the Go framework branches with `detectDatabase` so the two never disagree: a single
   source decides `orm`. Prefer the dependency-scan result over the framework default.
3. Audit sibling fabricated fields surfaced in the review: `authMethod:"JWT"` and
   `loggingPattern` should be evidence-gated too (only assert JWT when a jwt dep/usage exists).

## Decisions

- **Null beats a plausible guess.** A skill that says "ORM: none detected — confirm" is honest;
  one that says `sqlc` the user never used is a trust bug.
- **Driver ≠ ORM.** Encode this distinction explicitly so it can't regress.

## Verification (must be able to fail)

- Test: Go + pgx, no ORM dep → `orm` is `null` AND `detectDatabase` agrees (no `sqlc`).
- Test: Go + gorm → `orm:"GORM"` from both paths (no contradiction).
- Test: no jwt evidence → `authMethod` not asserted as `"JWT"`.

## Effort

~1 hr. Risk: low. Depends on: none (but B10 later makes this a one-line change).
