// Regression guard: fable-mode must be scaffolded into every initialized project so the
// SessionStart hook can surface it. If this breaks, projects silently lose the execution-
// discipline skill that all /as-* commands and the session hook reference.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

describe("scaffoldSkills — fable-mode", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-fable-"));
    fs.ensureDirSync(path.join(tmp, ".claude"));
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  it("copies the fable-mode skill (SKILL.md + EXAMPLE.md) into .claude/skills", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, false);

    const skillPath = path.join(tmp, ".claude", "skills", "fable-mode", "SKILL.md");
    const examplePath = path.join(tmp, ".claude", "skills", "fable-mode", "EXAMPLE.md");

    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.existsSync(examplePath)).toBe(true);

    const skill = fs.readFileSync(skillPath, "utf-8");
    expect(skill).toContain("name: fable-mode");
    expect(skill).toContain("Stage map");
  });

  it("does not write fable-mode on a dry run", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, true);
    expect(fs.existsSync(path.join(tmp, ".claude", "skills", "fable-mode", "SKILL.md"))).toBe(false);
  });
});
