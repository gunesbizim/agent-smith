// P1 — the skill-generator master prompt is externalized to templates/prompts/ and loaded +
// interpolated at runtime. These tests guard that externalization did not drop content and
// that a missing template fails loudly rather than producing a silently-empty prompt.
import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import {
  loadSkillGeneratorPrompt,
  buildMasterSkillPrompt,
  GENERATED_SKILLS,
  SkillPromptError,
} from "../../adapt/llm-skills.js";

describe("loadSkillGeneratorPrompt (P1)", () => {
  afterEach(() => {
    delete process.env.AGENT_SMITH_PROMPTS_DIR;
  });

  it("interpolates every generated skill path and the example stub, leaving no real placeholder", () => {
    const prompt = loadSkillGeneratorPrompt();
    for (const s of GENERATED_SKILLS) {
      expect(prompt).toContain(`.claude/skills/${s}/SKILL.md`);
    }
    // The example stub's marker text (its frontmatter name line) must be inlined.
    expect(prompt).toContain("name: pr-review-backend");
    // The two interpolation slots must be consumed (the literal {{TEMPLATE_VARS}} the prompt
    // instructs the model about is intentional and stays).
    expect(prompt).not.toContain("{{SKILL_LIST}}");
    expect(prompt).not.toContain("{{STUB_EXAMPLE}}");
  });

  it("preserves the Serena-correctness sentinel (content not dropped in the lift)", () => {
    const prompt = loadSkillGeneratorPrompt();
    expect(prompt).toContain("There is NO find_implementations");
    expect(prompt).toMatch(/Serena correctness/i);
  });

  it("buildMasterSkillPrompt remains a working alias", () => {
    expect(buildMasterSkillPrompt("/proj")).toBe(loadSkillGeneratorPrompt());
  });

  it("throws a typed SkillPromptError when the template files are missing", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-empty-"));
    process.env.AGENT_SMITH_PROMPTS_DIR = empty;
    try {
      expect(() => loadSkillGeneratorPrompt()).toThrow(SkillPromptError);
    } finally {
      fs.removeSync(empty);
    }
  });

  it("honours AGENT_SMITH_PROMPTS_DIR override", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-custom-"));
    fs.writeFileSync(path.join(dir, "skill-generator.md"), "CUSTOM {{SKILL_LIST}} END");
    fs.writeFileSync(path.join(dir, "skill-stub-example.md"), "EXAMPLE");
    process.env.AGENT_SMITH_PROMPTS_DIR = dir;
    try {
      const prompt = loadSkillGeneratorPrompt();
      expect(prompt).toContain("CUSTOM");
      expect(prompt).toContain(".claude/skills/pr-review-backend/SKILL.md");
    } finally {
      fs.removeSync(dir);
    }
  });
});
