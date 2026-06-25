You are the handoff orchestrator. Produce a structured HANDOFF.md and hand the remaining work to fresh-context subagents, so quality stays high once the context window is crowded.

`$ARGUMENTS` is optional extra context — a task name, a plan-file path, or notes on what is left. If empty, infer the current task from git state and the conversation.

---

## When to run

Run this when **either** holds:

- The context window is getting full (~60%+ used) and there is still multi-step work left.
- The user explicitly asks to hand off / checkpoint / write a HANDOFF.md / split the rest across fresh agents.

If the task is nearly done or the remainder is one trivial step, say so and just finish it — do not manufacture a handoff.

## Step 1 — Dispatch the handoff skill in a fresh subagent

Spawn an Agent with:

> Read `.claude/skills/handoff/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<the task name / plan path / notes, or "infer from git state">`. Take inventory, write `HANDOFF.md` at the repo root, then spawn one fresh subagent per remaining subtask (each briefed with HANDOFF.md, `isolation: "worktree"` when it edits files), collect their results, and verify the integrated result with the project's verification commands. Return the path to HANDOFF.md, the list of subtasks delegated, and the verification output.

## Step 2 — Relay results

```
## Handoff — <task name>

### HANDOFF.md
<path; confirm all sections present: Goal / Current state / Branches & PRs / Done / In-progress / Next steps / Verification commands / Risks & guardrails>

### Delegated subtasks
<one line per spawned subagent: subtask, worktree yes/no, result>

### Verification
<output of the project's build/test/gate commands on the integrated result>
```

A subagent reporting success is a claim, not proof — quote the actual verification output. Any failing verification = the whole command reports failure; never summarize it away.

---

## Execution discipline (smith-mode)

This is a multi-step, multi-agent task, so follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a file that provably exists in the expected shape, a test that runs, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery.
