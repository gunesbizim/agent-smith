# P4 — Skills report output

**Goal:** At the end of generation the user sees a clear report of every skill created — which
files were rewritten, the stack they were grounded in, and how many recommended best practices
each surfaced. This is the explicit "at the end user should see all created skills as a report"
requirement.

**Depth:** Medium — a report *contract* the model must emit + a parser + a terminal renderer.

## Files

- **Edit** `templates/prompts/skill-generator.md` (from P1) — add the structured report contract
  to Phase 3 / final output.
- **Edit** `src/adapt/llm-skills.ts` — parse the report block out of claude's stdout; type it.
- **New** `src/cli/skills-report.ts` — `renderSkillsReport(report)` → formatted terminal output.
- **Edit** `src/cli/init.ts` — call the renderer after a successful generation step.
- **New** `src/__tests__/adapt/skills-report.test.ts`.

## Report contract

The current prompt asks for a one-line summary. Replace with a **machine-parseable block** the
model emits as its final output, fenced by sentinels so init can extract it reliably even if the
model adds prose around it:

```
<<<AGENT_SMITH_SKILLS_REPORT
{
  "stack": "Go 1.22 / Echo + React/Zustand",
  "skills": [
    { "name": "pr-review-backend", "path": ".claude/skills/pr-review-backend/SKILL.md",
      "rewritten": true, "recommendedPractices": 3 },
    ...
  ],
  "bestPracticesDoc": "docs/architecture/best-practices.md",
  "notes": "frontend skills scoped to React; no Vue rules emitted"
}
AGENT_SMITH_SKILLS_REPORT>>>
```

## Approach

1. **Prompt:** instruct the model to end with exactly one sentinel-fenced JSON block matching the
   schema above; everything outside it is ignored by the parser.
2. **Parser** (`llm-skills.ts`): regex-extract between the sentinels, `JSON.parse`, validate
   shape (array of `{name, rewritten, recommendedPractices}`). On parse failure, degrade to the
   old one-line summary so the report is best-effort, never a crash.
3. **Renderer** (`skills-report.ts`): print a boxed table —
   - header: stack grounded + best-practices doc path,
   - one row per skill: ✓/✗ rewritten, name, recommended-practice count,
   - footer: totals + the `notes` line.
   Use the existing `chalk` style vocabulary (cyan headers, gray detail, green ✓).
4. **init:** on `ran:true`, call `renderSkillsReport(result.report)`; if `report` is absent
   (parse failed) fall back to printing `result.summary`.

## Decisions

- **The report is the D1 human-resolution surface.** Beyond listing generated skills, the report
  includes an **"Unconfirmed values"** section — the low-confidence facts (A3) the run guessed
  (stack, commands, ORM, conventions). This is where the human resolves uncertainties; confirmed
  answers persist to the D1 ledger so the next run skips re-inferring them (see
  [D1](D1-correction-artifact-loop.md)). Resolution is offered inline or via `agent-smith confirm`.
- **Sentinel-fenced JSON, not free text.** Robust to the model's surrounding prose; one
  extraction path; testable without a live model (feed canned stdout).
- **Best-effort.** A malformed/missing report never fails init — it falls back to the summary
  line. The skills are already written regardless.
- **Cross-check (optional, cheap):** after parsing, init can stat each reported `path` and mark a
  skill ✗ if the file is missing or still contains `{{` — catches a model that *claimed* success
  but left placeholders. Include this; it's the failable verification the report itself needs.

## Verification (must be able to fail)

- Test: canned stdout with a valid report block → parser returns the typed object; renderer
  output contains each skill name + count.
- Test: stdout with no sentinel block → parser returns null; init path falls back to summary
  (asserted via the renderer not being called / summary printed).
- Test: report lists a skill whose file still has `{{TEMPLATE}}` → cross-check downgrades it to ✗.

## Effort

~2 hrs. Risk: low–medium (the prompt must reliably emit the block — covered by the canned-stdout
tests and the file cross-check guard).
