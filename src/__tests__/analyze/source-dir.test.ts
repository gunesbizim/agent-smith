import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { detectSourceDirs, resolveSourceDirs, writeSourceConfig } from "../../analyze/source-dir.js";
import type { DetectedProject } from "../../shared/types.js";

const BASE_PROJECT: DetectedProject = {
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

describe("source-dir resolution", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "srcdir-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects a src/ directory", () => {
    fs.ensureDirSync(path.join(tmp, "src"));
    expect(detectSourceDirs(tmp, { ...BASE_PROJECT, rootPath: tmp })).toContain("src");
  });

  it("detects backend/ and frontend/ directories", () => {
    fs.ensureDirSync(path.join(tmp, "backend"));
    fs.ensureDirSync(path.join(tmp, "frontend"));
    const dirs = detectSourceDirs(tmp, { ...BASE_PROJECT, rootPath: tmp });
    expect(dirs).toContain("backend");
    expect(dirs).toContain("frontend");
  });

  it("returns empty when no conventional source dir exists", () => {
    expect(detectSourceDirs(tmp, { ...BASE_PROJECT, rootPath: tmp })).toEqual([]);
  });

  it("falls back to src when nothing detected and non-interactive", async () => {
    const dirs = await resolveSourceDirs(tmp, { ...BASE_PROJECT, rootPath: tmp }, { interactive: false });
    expect(dirs).toEqual(["src"]);
  });

  it("writes resolved source dirs to config.json", async () => {
    await writeSourceConfig(tmp, ["src", "lib"]);
    const cfg = fs.readJsonSync(path.join(tmp, ".claude", "agent-smith", "config.json"));
    expect(cfg.sourceDirs).toEqual(["src", "lib"]);
  });

  it("does not write config on dryRun", async () => {
    await writeSourceConfig(tmp, ["src"], true);
    expect(fs.existsSync(path.join(tmp, ".claude", "agent-smith", "config.json"))).toBe(false);
  });
});
