// Regression guard: smith-mode must be scaffolded into every initialized project so the
// SessionStart hook can surface it. If this breaks, projects silently lose the execution-
// discipline skill that all /as-* commands and the session hook reference.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

describe("scaffoldSkills — smith-mode", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-smith-"));
    fs.ensureDirSync(path.join(tmp, ".claude"));
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  it("copies the smith-mode skill (SKILL.md + EXAMPLE.md) into .claude/skills", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, false);

    const skillPath = path.join(tmp, ".claude", "skills", "smith-mode", "SKILL.md");
    const examplePath = path.join(tmp, ".claude", "skills", "smith-mode", "EXAMPLE.md");

    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.existsSync(examplePath)).toBe(true);

    const skill = fs.readFileSync(skillPath, "utf-8");
    expect(skill).toContain("name: smith-mode");
    expect(skill).toContain("Stage map");
  });

  it("does not write smith-mode on a dry run", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, true);
    expect(fs.existsSync(path.join(tmp, ".claude", "skills", "smith-mode", "SKILL.md"))).toBe(false);
  });

  it("documents the hierarchical planning tiers and the when-to-tier guard (A7)", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, false);
    const skill = fs.readFileSync(path.join(tmp, ".claude", "skills", "smith-mode", "SKILL.md"), "utf-8");
    expect(skill).toContain("Hierarchical planning tiers");
    expect(skill).toMatch(/\*\*Strategic\*\*/);
    expect(skill).toMatch(/\*\*Tactical\*\*/);
    expect(skill).toMatch(/\*\*Atomic\*\*/);
    expect(skill).toContain("When to tier"); // the anti-over-engineering guard
  });
});
