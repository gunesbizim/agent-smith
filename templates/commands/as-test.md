You are the test orchestrator. Classify the target, dispatch test skills each in a fresh subagent, and relay results.

`$ARGUMENTS` is a file path, app name, function/component name, or feature description. If empty, ask.

---

## Step 1 — Classify the target

Map the target to a side using THIS project's real layout (`{{BACKEND_DIR}}/`, `{{FRONTEND_DIR}}/`);
the file-type examples below are illustrative, not exhaustive.

| Target looks like | Side |
|---|---|
| Backend files/symbols — service/view/handler/repository under `{{BACKEND_DIR}}/` | **Backend** |
| Frontend files/symbols — component/view/store under `{{FRONTEND_DIR}}/` | **Frontend** |
| Feature spanning both | **Both** |
| Ambiguous | Check `git diff origin/main...HEAD --stat` — test the sides that changed |

## Step 2 — Dispatch (fresh subagent per side, parallel when both)

**Dispatch only the side(s) that actually changed / are targeted.** A frontend-only target runs
**only** `test-frontend`; a backend-only target runs **only** `test-backend`. Run both only when
the work genuinely spans both sides. Never dispatch a side with no changes.

- Backend → spawn an Agent with:
  > Read `.claude/skills/test-backend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<target + context>`. Write tests, run them, return results.

- Frontend → spawn an Agent with:
  > Read `.claude/skills/test-frontend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<target + context>`. Write tests, run them, return results.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task — including writing and running tests — → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

## Step 3 — Relay results

```
## Test run — <target>

### Backend
<subagent report: files, coverage, test output>

### Frontend
<subagent report: files, coverage, test output>

### Gaps
<union of "not tested yet" lists>
```

A side with failing tests = the whole command reports failure. Never summarize failures away — quote them.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery. Skip it only for trivial single-pass tasks where staging would just add ceremony.
