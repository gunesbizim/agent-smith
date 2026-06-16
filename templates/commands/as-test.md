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

- Backend → spawn an Agent with:
  > Read `.claude/skills/test-backend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<target + context>`. Write tests, run them, return results.

- Frontend → spawn an Agent with:
  > Read `.claude/skills/test-frontend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<target + context>`. Write tests, run them, return results.

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
