// A5 — adversarial critic panel: scaffolding produces each distinct-lens critic, and the
// /as-pr-review orchestrator fans out to the panel + synthesizes consensus.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { GENERATED_SKILLS } from "../../adapt/llm-skills.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LENSES = ["security", "performance", "simplicity", "maintainability", "dx"];

describe("critic panel scaffolding (A5)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "critic-")); fs.ensureDirSync(path.join(tmp, ".claude")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("scaffolds each critic SKILL.md with valid frontmatter and a distinct lens", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, false);
    for (const lens of LENSES) {
      const p = path.join(tmp, ".claude", "skills", `pr-critic-${lens}`, "SKILL.md");
      expect(fs.existsSync(p), `pr-critic-${lens} scaffolded`).toBe(true);
      const c = fs.readFileSync(p, "utf-8");
      expect(c).toContain(`name: pr-critic-${lens}`);
      expect(c).toMatch(/REFUTE/); // adversarial framing
      expect(c).toMatch(/blocker\|suggestion|severity/); // severity model
    }
  });

  it("critics carry DISTINCT lenses (descriptions differ)", async () => {
    await scaffoldSkills(tmp, DEFAULT_TEMPLATE_VARS, false);
    const descs = LENSES.map((lens) =>
      fs.readFileSync(path.join(tmp, ".claude", "skills", `pr-critic-${lens}`, "SKILL.md"), "utf-8")
        .split("\n").find((l) => l.startsWith("description:")) ?? "");
    expect(new Set(descs).size).toBe(LENSES.length); // all distinct
  });

  it("GENERATED_SKILLS includes the critic panel (grounded per project)", () => {
    for (const lens of LENSES) expect(GENERATED_SKILLS).toContain(`pr-critic-${lens}`);
  });

  it("/as-pr-review references the critic panel and a synthesis step", () => {
    const cmd = fs.readFileSync(path.join(repoRoot, "templates", "commands", "as-pr-review.md"), "utf-8");
    expect(cmd).toContain("critic panel");
    expect(cmd).toContain("Synthesis");
    expect(cmd).toMatch(/consensus/i);
    for (const lens of LENSES) expect(cmd).toContain(`pr-critic-${lens}`);
  });
});
