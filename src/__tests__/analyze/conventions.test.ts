// C4 — programmatic convention detection: concrete, evidence-cited conventions from the real
// tree, and the offline seeding of best-practices.md "Followed".
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { detectConventions, renderFollowedConventions } from "../../analyze/conventions.js";
import { writeArchitectureDocs } from "../../adapt/architecture-writer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject } from "../../shared/types.js";

function project(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    rootPath: "/x", projectType: "web-app", backend: null, frontend: null,
    testing: { backend: null, frontend: null }, linting: { backend: null, frontend: null },
    cicd: null, monorepo: null, database: null, ...overrides,
  };
}

describe("detectConventions (C4)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "conv-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("detects layered architecture with evidence when services + repositories dirs exist", async () => {
    fs.ensureDirSync(path.join(tmp, "src", "services"));
    fs.ensureDirSync(path.join(tmp, "src", "repositories"));
    fs.ensureDirSync(path.join(tmp, "src", "controllers"));
    const conv = await detectConventions(tmp, project({ rootPath: tmp }));
    const layered = conv.find((c) => c.id === "layered-architecture");
    expect(layered).toBeDefined();
    expect(layered!.evidence.length).toBeGreaterThan(0);
    expect(layered!.confidence).toBe("high"); // all three layers present
  });

  it("does NOT report layered architecture for a flat CLI tree", async () => {
    fs.ensureDirSync(path.join(tmp, "src"));
    fs.writeFileSync(path.join(tmp, "src", "index.ts"), "export const x = 1;\n");
    const conv = await detectConventions(tmp, project({ rootPath: tmp, projectType: "cli-tool" }));
    expect(conv.find((c) => c.id === "layered-architecture")).toBeUndefined();
  });

  it("detects a test suite with fixtures (conftest.py)", async () => {
    fs.ensureDirSync(path.join(tmp, "tests"));
    fs.writeFileSync(path.join(tmp, "tests", "conftest.py"), "import pytest\n");
    const conv = await detectConventions(tmp, project({ rootPath: tmp }));
    const test = conv.find((c) => c.id === "test-suite");
    expect(test).toBeDefined();
    expect(test!.confidence).toBe("high");
  });

  it("renders a 'confirm' hint when nothing is detected", () => {
    expect(renderFollowedConventions([])).toContain("agent-smith confirm");
  });
});

describe("best-practices.md seeding (C4, offline)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bp-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("populates the Followed section from detected conventions with --no-llm (useLlm:false)", async () => {
    fs.ensureDirSync(path.join(tmp, "services"));
    fs.ensureDirSync(path.join(tmp, "repositories"));
    await writeArchitectureDocs(tmp, { ...DEFAULT_TEMPLATE_VARS, BACKEND_FRAMEWORK: "echo" }, false, {
      useLlm: false,
      project: project({ rootPath: tmp, backend: { framework: "echo" } as DetectedProject["backend"] }),
    });
    const bp = fs.readFileSync(path.join(tmp, "docs", "architecture", "best-practices.md"), "utf-8");
    expect(bp).toContain("Detected conventions");
    expect(bp).toContain("Layered architecture");
  });
});
