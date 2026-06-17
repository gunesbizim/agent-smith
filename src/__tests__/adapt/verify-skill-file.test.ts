// C3 — the shared "perfect fit" oracle: a generated skill must be a real, decorated file with
// no residual placeholders, plausible length, and intact frontmatter. Shared with P4's report.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { verifySkillFile, crossCheckReport } from "../../adapt/llm-skills.js";

const GOOD = `---
name: pr-review-backend
---
You are a senior backend reviewer for this Go/Echo service. Read docs/architecture/backend-architecture.md.
Run the gate with: go test ./... and golangci-lint run. Use gitnexus for impact, serena for edits.
Step 0 — Plan. Step 1 — Impact. Step 2 — Review against the architecture rules. Verify with the test gate.
This skill is grounded in the real repository structure and commands, with no template residue.
`;

describe("verifySkillFile (C3)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-skill-")); });
  afterEach(() => { fs.removeSync(tmp); });

  function write(name: string, content: string): string {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it("passes a genuinely decorated skill", () => {
    expect(verifySkillFile(write("ok.md", GOOD))).toEqual([]);
  });

  it("flags a residual {{placeholder}}", () => {
    expect(verifySkillFile(write("ph.md", GOOD + "\nFramework: {{BACKEND_FRAMEWORK}}\n")))
      .toContain("unresolved {{placeholder}}");
  });

  it("flags an implausibly short (undecorated) file", () => {
    expect(verifySkillFile(write("short.md", "---\nname: x\n---\nstub\n")))
      .toContain("implausibly short (likely not decorated)");
  });

  it("flags missing frontmatter name", () => {
    const noFm = GOOD.replace(/^---[\s\S]*?---\n/, "");
    expect(verifySkillFile(write("nofm.md", noFm))).toContain("missing frontmatter name");
  });

  it("returns 'file missing' for a non-existent path", () => {
    expect(verifySkillFile(path.join(tmp, "nope.md"))).toEqual(["file missing"]);
  });

  it("crossCheckReport downgrades a claimed-rewritten skill that fails verification", () => {
    const rel = "skill.md";
    write(rel, GOOD + "\n{{LEFTOVER}}\n");
    const checked = crossCheckReport(
      { stack: "go", skills: [{ name: "x", path: rel, rewritten: true, recommendedPractices: 1 }] },
      tmp,
    );
    expect(checked.skills[0].rewritten).toBe(false);
  });
});
