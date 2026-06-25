# P1 — Externalize the generator prompt (C1)

**Goal:** Move the skill-generator master prompt out of the hardcoded TypeScript string array
in `buildMasterSkillPrompt()` into editable files under `templates/prompts/`, read and
interpolated at runtime. Makes the generator tunable without recompiling and is the keystone
of the C1 directive.

**Depth:** Medium — new template files + a loader + an interpolation contract + tests.

## Files

- **New** `templates/prompts/skill-generator.md` — the full master prompt (Phases 1–3, the
  per-subagent rules, the Serena-correctness block, the report contract from P4).
- **New** `templates/prompts/skill-stub-example.md` — one example SKILL.md the model treats as
  a shape/intent reference (so "decorate, don't replace" has a concrete anchor).
- **Edit** `src/adapt/llm-skills.ts` — replace `buildMasterSkillPrompt()` body with
  `loadSkillGeneratorPrompt(projectRoot)` that reads the template files and interpolates.
- **New** `src/__tests__/adapt/llm-skills-prompt.test.ts`.
- **Edit** `package.json` `files` array already ships `templates/` — confirm `templates/prompts/`
  is included (it is, by the `templates/` glob).

## Approach

1. Lift the current prompt text verbatim into `skill-generator.md`. Replace the dynamic bits
   with placeholders: `{{SKILL_LIST}}` (the bulleted skill paths) and `{{STUB_EXAMPLE}}`
   (inlined contents of `skill-stub-example.md`, or a path reference — see decision below).
2. Write `loadSkillGeneratorPrompt(projectRoot)`:
   - Resolve the prompts dir from the package root (same `getPackageRoot()` pattern as
     `hooks.ts`), **not** the project root — these ship with agent-smith.
   - Read `skill-generator.md`, substitute `{{SKILL_LIST}}` from `GENERATED_SKILLS`, substitute
     `{{STUB_EXAMPLE}}` with the example file's contents.
   - Throw a typed error if a template file is missing (caller converts to `ran:false`).
3. Keep `GENERATED_SKILLS` in code (it's the contract for which files get rewritten) — only the
   *prose* externalizes.

## Decisions

- **Inline the example vs reference by path:** inline its contents into the prompt. The model
  shouldn't have to Read an agent-smith package file it can't see from the project cwd.
- **Discovery override:** allow `AGENT_SMITH_PROMPTS_DIR` env to point elsewhere (lets a user
  test a custom prompt without editing the installed package). Low cost, high tinkerability.
- **No project-level copy yet:** prompts live in the package, not copied into each project.
  (If we later want per-project prompt overrides, that's a follow-up — note it, don't build it.)

## Verification (must be able to fail)

- Unit test: `loadSkillGeneratorPrompt(tmp)` returns a string that **contains every entry of
  `GENERATED_SKILLS`** and **the example stub's marker text**, and has **no residual `{{`** .
- Unit test: missing template file → throws the typed error (not a silent empty prompt).
- Snapshot guard: the loaded prompt still contains the Serena-correctness sentinel
  ("There is NO find_implementations") so externalization didn't drop content.

## Effort

~1–2 hrs. Mechanical lift + loader + 3 small tests. Risk: low.
