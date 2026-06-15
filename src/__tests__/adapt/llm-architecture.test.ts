import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

// Mock the claude runner so no real subprocess is spawned.
const isClaudeAvailableMock = vi.fn();
const runClaudeMock = vi.fn();
vi.mock("../../analyze/claude-runner.js", () => ({
  isClaudeAvailable: () => isClaudeAvailableMock(),
  runClaude: (...args: unknown[]) => runClaudeMock(...args),
}));

import { writeArchitectureDocs } from "../../adapt/architecture-writer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject } from "../../shared/types.js";

const PROJECT: DetectedProject = {
  rootPath: "/test",
  projectType: "web-app",
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

describe("writeArchitectureDocs — LLM vs template", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    isClaudeAvailableMock.mockReset();
    runClaudeMock.mockReset();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("uses LLM output when claude is available and useLlm is on", async () => {
    isClaudeAvailableMock.mockReturnValue(true);
    runClaudeMock.mockReturnValue("# Backend Architecture (LLM)\n\n" + "x".repeat(300));
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, false, { useLlm: true, project: PROJECT });
    const doc = fs.readFileSync(path.join(tmp, "docs", "architecture", "backend-architecture.md"), "utf-8");
    expect(doc).toContain("# Backend Architecture (LLM)");
    expect(runClaudeMock).toHaveBeenCalled();
  });

  it("unwraps a ```markdown fence the model wrapped the doc in", async () => {
    isClaudeAvailableMock.mockReturnValue(true);
    runClaudeMock.mockReturnValue("```markdown\n# Backend (fenced)\n\n" + "y".repeat(300) + "\n```");
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, false, { useLlm: true, project: PROJECT });
    const doc = fs.readFileSync(path.join(tmp, "docs", "architecture", "backend-architecture.md"), "utf-8");
    expect(doc.startsWith("# Backend (fenced)")).toBe(true);
    expect(doc).not.toContain("```");
  });

  it("falls back to the template when claude is unavailable", async () => {
    isClaudeAvailableMock.mockReturnValue(false);
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, false, { useLlm: true, project: PROJECT });
    const doc = fs.readFileSync(path.join(tmp, "docs", "architecture", "backend-architecture.md"), "utf-8");
    expect(doc).toContain("Backend Architecture");
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("falls back to the template when the LLM returns something unusable", async () => {
    isClaudeAvailableMock.mockReturnValue(true);
    runClaudeMock.mockReturnValue("nope"); // too short / no heading
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, false, { useLlm: true, project: PROJECT });
    const doc = fs.readFileSync(path.join(tmp, "docs", "architecture", "backend-architecture.md"), "utf-8");
    expect(doc).toContain("Backend Architecture"); // template heading, not "nope"
    expect(doc).not.toBe("nope");
  });

  it("does not call the LLM when useLlm is false", async () => {
    isClaudeAvailableMock.mockReturnValue(true);
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, false, { useLlm: false, project: PROJECT });
    expect(runClaudeMock).not.toHaveBeenCalled();
  });

  it("does not call the LLM on dryRun", async () => {
    isClaudeAvailableMock.mockReturnValue(true);
    await writeArchitectureDocs(tmp, DEFAULT_TEMPLATE_VARS, true, { useLlm: true, project: PROJECT });
    expect(runClaudeMock).not.toHaveBeenCalled();
  });
});
