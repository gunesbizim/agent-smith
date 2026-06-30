You are the backend implementation entry point. Dispatch the **backend** skill to implement the task in `$ARGUMENTS`.

`$ARGUMENTS` is the backend task (a feature description, file path, or symbol). If empty, ask for the task before dispatching.

---

## Dispatch

Spawn a fresh subagent and have it execute the backend skill verbatim:

> Read `.claude/skills/backend/SKILL.md` and execute it exactly. `$ARGUMENTS` = `<the backend task + any context>`. Follow its test-driven design rule without exception: write the failing test(s) first, observe RED, then implement until green. Return the files changed, the RED-first evidence, and the verification output.

The **backend** skill is **test-first, always** — it writes failing tests before any production code on
every change. Do not instruct the subagent to skip tests or "just implement"; that violates the skill.

### Subagent model routing

**When you spawn a subagent:** exploration, debugging, planning, or architecture analysis → a FRESH **Opus** subagent (`model: opus`). Implementation, code-writing, or mechanical execution of an already-planned task → a FRESH **Sonnet** subagent (`model: sonnet`). Every subagent starts fresh (no shared context). This mirrors the engine's phase→model map (`src/engine/tdd-engine.ts`): Opus thinks, Sonnet codes.

---

## Relay results

Report the subagent's output faithfully: RED-first evidence, files created/modified, verification
command outputs, endpoints implemented (verb + path + roles), and migrations created. Failing tests
= the command reports failure; never summarize failures away.

---

## Execution discipline (smith-mode)

For work that spans multiple files, sources, or sessions, follow the **smith-mode** skill (`.claude/skills/smith-mode/SKILL.md`): write a numbered stage map before acting, delegate independent stages to subagents where the runtime supports it, verify each stage with a check that can actually fail — a test that runs, a source actually fetched, an output diffed against spec — not "it looks right", and do a skeptical self-review naming at least one weakness before delivery.
