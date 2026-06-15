import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

const runClaudeMock = vi.fn();
vi.mock("../../analyze/claude-runner.js", () => ({
  isClaudeAvailable: () => true,
  runClaude: (...args: unknown[]) => runClaudeMock(...args),
}));

import { generateSkills, GENERATED_SKILLS, buildMasterSkillPrompt } from "../../adapt/llm-skills.js";

function scaffoldStubs(root: string): void {
  for (const s of GENERATED_SKILLS) {
    const dir = path.join(root, ".claude", "skills", s);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s}\n---\nstub\n`);
  }
  fs.ensureDirSync(path.join(root, "docs", "architecture"));
  fs.writeFileSync(path.join(root, "docs", "architecture", "backend-architecture.md"), "# Backend\n");
}

describe("generateSkills", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llmskills-"));
    runClaudeMock.mockReset();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns ran:false when stubs are not scaffolded", () => {
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/stub/i);
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("returns ran:false when architecture docs are missing", () => {
    for (const s of GENERATED_SKILLS) {
      const dir = path.join(tmp, ".claude", "skills", s);
      fs.ensureDirSync(dir);
      fs.writeFileSync(path.join(dir, "SKILL.md"), "stub");
    }
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/architecture/i);
  });

  it("runs the LLM and reports ran:true with a summary when prerequisites exist", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue("did stuff\nRewrote 6 skills grounded in FastAPI + React.");
    const r = generateSkills(tmp);
    expect(r.ran).toBe(true);
    expect(r.summary).toContain("FastAPI");
    expect(runClaudeMock).toHaveBeenCalledOnce();
    // It must be invoked with subagent + write tools enabled.
    const opts = runClaudeMock.mock.calls[0][1];
    expect(opts.allowedTools).toEqual(expect.arrayContaining(["Task", "Write", "Read"]));
  });

  it("returns ran:false when the LLM call fails", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue(null);
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/failed|unavailable/i);
  });
});

describe("buildMasterSkillPrompt", () => {
  it("instructs understand-first then fan-out subagents, listing every skill", () => {
    const p = buildMasterSkillPrompt("/proj");
    expect(p).toMatch(/Understand the project/i);
    expect(p).toMatch(/Task tool/i);
    expect(p).toMatch(/subagent/i);
    for (const s of GENERATED_SKILLS) expect(p).toContain(s);
    // Must warn against leaving wrong-stack rules / unresolved template vars.
    expect(p).toMatch(/NEVER leave a rule that does not apply/i);
    expect(p).toMatch(/\{\{TEMPLATE_VARS\}\}|unresolved braces/i);
  });
});
