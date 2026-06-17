// A11 (D1-backed determinism scope) — record the generator prompt hash per run so a later run
// can detect the prompt changed. Full run-replay is gated on A1; this is the reproducible-inputs
// piece agent-smith can deliver today.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

const runClaudeMock = vi.fn();
vi.mock("../../analyze/claude-runner.js", () => ({
  isClaudeAvailable: () => true,
  runClaude: (...args: unknown[]) => runClaudeMock(...args),
}));

import { hashPrompt, generateSkills, GENERATED_SKILLS, loadSkillGeneratorPrompt } from "../../adapt/llm-skills.js";
import { writeMarker } from "../../adapt/skill-gen-marker.js";

function scaffoldStubs(root: string): void {
  for (const s of GENERATED_SKILLS) {
    const dir = path.join(root, ".claude", "skills", s);
    fs.ensureDirSync(dir);
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${s}\n---\nstub\n`);
  }
  fs.ensureDirSync(path.join(root, "docs", "architecture"));
  fs.writeFileSync(path.join(root, "docs", "architecture", "backend-architecture.md"), "# Backend\n");
}

describe("hashPrompt (A11)", () => {
  it("is stable and content-sensitive", () => {
    expect(hashPrompt("abc")).toBe(hashPrompt("abc"));
    expect(hashPrompt("abc")).not.toBe(hashPrompt("abd"));
    expect(hashPrompt("abc")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("generateSkills prompt-hash + drift (A11)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a11-")); runClaudeMock.mockReset(); });
  afterEach(() => { fs.removeSync(tmp); });

  it("returns the current prompt hash on a successful run", () => {
    scaffoldStubs(tmp);
    runClaudeMock.mockReturnValue("done");
    const r = generateSkills(tmp);
    expect(r.ran).toBe(true);
    expect(r.promptHash).toBe(hashPrompt(loadSkillGeneratorPrompt()));
  });

  it("flags prompt drift when the marker's recorded hash differs", () => {
    scaffoldStubs(tmp);
    writeMarker(tmp, { generatedAt: "t", promptHash: "deadbeef0000" }); // stale hash
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).toMatch(/prompt CHANGED/);
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("no drift note when the recorded hash matches the current prompt", () => {
    scaffoldStubs(tmp);
    writeMarker(tmp, { generatedAt: "t", promptHash: hashPrompt(loadSkillGeneratorPrompt()) });
    const r = generateSkills(tmp);
    expect(r.ran).toBe(false);
    expect(r.reason).not.toMatch(/CHANGED/);
  });
});
