import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

// Mock readline so the interactive prompt path can be exercised without a real TTY.
let promptAnswer = "";
vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: (_q: string, cb: (answer: string) => void) => cb(promptAnswer),
      close: vi.fn(),
    })),
  },
}));

import { resolveSourceDirs } from "../../analyze/source-dir.js";
import type { DetectedProject } from "../../shared/types.js";

const BASE: DetectedProject = {
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

describe("resolveSourceDirs — interactive prompt", () => {
  let tmp: string;
  const origTTY = process.stdin.isTTY;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "srcprompt-"));
    (process.stdin as { isTTY?: boolean }).isTTY = true; // empty dir → forces the prompt
  });
  afterEach(() => {
    (process.stdin as { isTTY?: boolean }).isTTY = origTTY;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("uses the user-pinpointed path(s) when nothing is auto-detected", async () => {
    promptAnswer = "lib, packages";
    const dirs = await resolveSourceDirs(tmp, { ...BASE, rootPath: tmp }, { interactive: true });
    expect(dirs).toEqual(["lib", "packages"]);
  });

  it("falls back to src when the user enters nothing", async () => {
    promptAnswer = "";
    const dirs = await resolveSourceDirs(tmp, { ...BASE, rootPath: tmp }, { interactive: true });
    expect(dirs).toEqual(["src"]);
  });
});
