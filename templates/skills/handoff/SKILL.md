---
name: handoff
description: >
  Produce a structured HANDOFF.md and hand remaining work to fresh-context
  subagents. Use when the context window is getting full (~60%+ used) and there
  is still work left, or when the user explicitly asks to "hand off", "write a
  handoff", "checkpoint", or "split this across fresh agents". Captures Goal /
  Current state / Branches & PRs / Done / In-progress / Next steps / Verification
  commands / Risks, then spawns one fresh subagent per remaining subtask so each
  starts with a clean context window briefed by the handoff document.
---

# Handoff

When a long task has eaten most of the context window, the cheapest way to keep quality high
is **not** to push on with a crowded context — it is to write down the state precisely and
restart the remaining work in fresh contexts. This skill does exactly that: it writes a
durable `HANDOFF.md`, then delegates each remaining subtask to a brand-new subagent that
reads the handoff as its briefing.

This is execution discipline, not a capability boost. A fresh subagent reasons better on a
clean context than a crowded one reasons on a full one — but only if the handoff document is
genuinely self-contained. A vague handoff just moves the confusion downstream.

## When to trigger

Run this skill when **either** holds:

- **Context pressure** — roughly 60%+ of the context window is used and there is still
  multi-step work remaining. Don't wait for a hard compaction; a deliberate handoff beats an
  emergency one.
- **Explicit request** — the user asks to hand off, checkpoint, write a HANDOFF.md, or split
  the rest across fresh agents.

## When NOT to trigger

- The task is nearly done and finishing it costs less than writing a handoff. Just finish.
- The remaining work is a single trivial step. Do it directly.
- Context is comfortable and the work is coherent in one head. Handing off mid-thought
  fractures a single idea across agents for no gain.

## Execution discipline (fable-mode)

This is a multi-step, multi-agent task, so follow `.claude/skills/fable-mode/SKILL.md`:
write a numbered stage map first, delegate independent subtasks to subagents, verify each
stage with a check that can actually fail, and self-critique before delivery. The stages
below ARE that map.

---

## Stage 1 — Take inventory (before writing anything)

Reconstruct ground truth from artifacts, not memory:

- `git status` and `git branch --show-current` — what is uncommitted, what branch.
- `git log --oneline -10` — what landed already.
- `gh pr list --head <branch>` (best-effort) — any open PR for this work.
- The original task / ticket and any plan file (e.g. `stuff/plans/*.md`) — the intended end
  state and the verification commands the project actually uses.

Expected output: a clear list of what is done, what is in flight, and what is still open —
each open item phrased as a **discrete, independently-actionable subtask** (one a fresh agent
could pick up cold).

## Stage 2 — Write `HANDOFF.md`

Write `HANDOFF.md` at the repo root (or update it in place if one already exists). It MUST
contain these sections, in this order, each filled with specifics — file paths, command
strings, branch names, not vibes:

```markdown
# HANDOFF — <short task name>

## Goal
What success looks like, end to end. The done criteria.

## Current state
Where things stand right now: branch, build/test status, what is mid-edit.

## Branches & PRs
Active branch, base branch, any open PR URL, CI status.

## Done
Completed, verified work — each item with the evidence (a passing test, a merged commit).

## In-progress
Work started but not finished, and exactly where it was left (file + line, or "edit half
applied"). Flag anything that could be in a broken intermediate state.

## Next steps
The remaining work as a NUMBERED list of discrete, independently-actionable subtasks. Each
subtask names its files, its acceptance check, and whether it edits files (needs a worktree)
or is read-only. Order them; note dependencies between them explicitly.

## Verification commands
The exact commands that prove the work is correct (build, typecheck, test, lint, any project
gate). Copy them verbatim from the project — do not invent.

## Risks & guardrails
Known traps, things not to touch, conventions to honor (Conventional Commits, no
Co-Authored-By trailers, additive-only, "keep the gate green", etc.), and any place a
subagent could plausibly go wrong.
```

**Failable check:** re-read `HANDOFF.md` and confirm every section is present and the
"Next steps" items are each independently actionable (a fresh agent could start one without
asking you a question). If any section is empty or hand-wavy, fix it before delegating — a
weak handoff is the failure mode this skill exists to prevent.

## Stage 3 — Delegate one fresh subagent per remaining subtask

For **each** subtask in "Next steps", spawn **one** subagent via the **Agent** tool. Do not
batch unrelated subtasks into one agent — fresh context per subtask is the whole point.

Brief every subagent with:

- The path to `HANDOFF.md` and an instruction to read it first as its primary context.
- Its specific subtask number and the acceptance check it must satisfy.
- The project's verification commands and guardrails (from the handoff).
- For a subtask that **edits files**: pass `isolation: "worktree"` so it works on an isolated
  copy and cannot collide with sibling agents or your working tree.
- For a **read-only** subtask (research, analysis): no worktree needed.

Dispatch independent subtasks **concurrently** (multiple Agent calls in one turn). For
subtasks with a stated dependency, wait for the prerequisite to finish, then dispatch the
dependent one — or fold the dependency into a single sequential agent if splitting would
fracture one coherent change.

Suggested brief per subagent:

> Read `HANDOFF.md` at the repo root — it is your full briefing. Execute **Next step #N**
> only. Acceptance check: `<the check>`. Honor the guardrails in the handoff's "Risks &
> guardrails" section. When done, report: files changed, the verification command output,
> and any follow-up the next agent needs.

**Failable check:** confirm the number of subagents dispatched equals the number of open
subtasks in "Next steps" (every open item is claimed by exactly one agent — nothing dropped,
nothing double-assigned).

## Stage 4 — Collect, verify, self-critique

As subagents return, record each result back into `HANDOFF.md` (move finished items from
"Next steps" to "Done" with their evidence). Then run the project's verification commands
yourself to confirm the integrated result is actually green — a subagent reporting success is
a claim, not proof.

Before declaring done, name at least one weakness: a subtask whose acceptance check was weak,
a possible interaction between two subagents' changes, or a section of the handoff that was
thinner than it should have been. Fix it or flag it to the user.

---

## Notes

- `HANDOFF.md` is a working artifact. If it should not be committed, the project may gitignore
  it — check the project's conventions before committing it as part of a change.
- The deterministic `pre-compact-handoff` hook (if installed) writes a best-effort snapshot
  before a context compaction. That snapshot is a safety net, not a substitute for this skill:
  the hook cannot reason about which work is done or delegate it. Run this skill deliberately
  while you still have context to write a good handoff.
