// A8 — generated CI uses the project's REAL commands and never leaks foreign-stack steps.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { generateCIWorkflow, scaffoldCI } from "../../scaffold/ci-workflow.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

const goVars = () => ({
  ...DEFAULT_TEMPLATE_VARS,
  BACKEND_TEST_CMD: "go test ./...",
  BACKEND_LINT_CMD: "golangci-lint run",
  BACKEND_TYPE_CHECK_CMD: "go vet ./...",
});

describe("generateCIWorkflow (A8)", () => {
  it("Go stack → workflow has go commands and NO Python steps", () => {
    const yml = generateCIWorkflow(goVars())!;
    expect(yml).toContain("go test ./...");
    expect(yml).toContain("golangci-lint run");
    expect(yml).not.toMatch(/pytest|ruff|manage\.py/);
    expect(yml).toContain("name: agent-smith CI");
  });

  it("skips 'none' commands rather than emitting empty steps", () => {
    const yml = generateCIWorkflow({ ...DEFAULT_TEMPLATE_VARS, BACKEND_TEST_CMD: "go test ./..." })!;
    expect(yml).toContain("go test ./...");
    expect(yml).not.toContain("run: none");
  });

  it("returns null when nothing is determinable (no honest steps)", () => {
    expect(generateCIWorkflow(DEFAULT_TEMPLATE_VARS)).toBeNull();
  });

  it("emits a frontend job when frontend commands are real", () => {
    const yml = generateCIWorkflow({ ...goVars(), FRONTEND_TEST_CMD: "npx vitest run" })!;
    expect(yml).toContain("npx vitest run");
    expect(yml).toMatch(/^ {2}frontend:/m);
  });
});

describe("scaffoldCI (A8)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ci-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("writes the workflow under a non-clobbering name", async () => {
    const wrote = await scaffoldCI(tmp, goVars());
    expect(wrote).toBe(true);
    const p = path.join(tmp, ".github", "workflows", "agent-smith-ci.yml");
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, "utf-8")).toContain("go test ./...");
  });

  it("writes nothing when there are no real commands", async () => {
    expect(await scaffoldCI(tmp, DEFAULT_TEMPLATE_VARS)).toBe(false);
    expect(fs.existsSync(path.join(tmp, ".github"))).toBe(false);
  });
});
