import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

// Mock child_process so the claude subprocess path is covered without a real binary.
const execFileSyncMock = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
  execSync: vi.fn(),
}));

import { refineWithLlm } from "../../analyze/llm-analyzer.js";
import type { DetectedProject } from "../../shared/types.js";

const PROG: DetectedProject = {
  rootPath: "/test",
  projectType: "cli-tool",
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

describe("refineWithLlm — claude available (mocked exec)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llmexec-"));
    fs.writeJsonSync(path.join(tmp, "package.json"), { name: "demo", bin: { demo: "x.js" } });
    execFileSyncMock.mockReset();
  });

  it("merges the LLM descriptor when claude returns valid JSON", () => {
    // 1st call = isClaudeAvailable (--version); 2nd = the analysis.
    execFileSyncMock
      .mockReturnValueOnce("claude 1.0.0")
      .mockReturnValueOnce('{"projectType":"library","backend":null,"frontend":null}');
    const result = refineWithLlm(tmp, PROG);
    expect(result.usedLlm).toBe(true);
    expect(result.project.projectType).toBe("library");
  });

  it("falls back when claude returns unparseable output", () => {
    execFileSyncMock
      .mockReturnValueOnce("claude 1.0.0")
      .mockReturnValueOnce("sorry, I cannot help with that");
    const result = refineWithLlm(tmp, PROG);
    expect(result.usedLlm).toBe(false);
    expect(result.reason).toMatch(/failed|no usable JSON/i);
    expect(result.project).toEqual(PROG);
  });

  it("falls back when the analysis subprocess throws (timeout/non-zero)", () => {
    execFileSyncMock.mockReturnValueOnce("claude 1.0.0").mockImplementationOnce(() => {
      throw new Error("ETIMEDOUT");
    });
    const result = refineWithLlm(tmp, PROG);
    expect(result.usedLlm).toBe(false);
    expect(result.project).toEqual(PROG);
  });

  it("reports claude-not-found when --version throws", () => {
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error("command not found");
    });
    const result = refineWithLlm(tmp, PROG);
    expect(result.usedLlm).toBe(false);
    expect(result.reason).toMatch(/claude/i);
  });
});
