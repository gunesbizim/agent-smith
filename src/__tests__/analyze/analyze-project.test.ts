// B11 — the shared analysis builder used by both `init` and `analyze`. Proves scanPackages runs
// in this path (the gap the review flagged) and that the bundle carries everything init needs.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { analyzeProject } from "../../analyze/analyze-project.js";
import { writeLedger } from "../../artifacts/ground-truth.js";

describe("analyzeProject (B11)", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-project-")); });
  afterEach(() => { fs.removeSync(tmp); });

  it("returns the full bundle including package-scan data (scanPackages ran)", async () => {
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
      dependencies: { "@nestjs/core": "^10.0.0", "@prisma/client": "^5.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }));
    const a = await analyzeProject(tmp, { useLlm: false });
    expect(a.project.backend?.framework).toBe("nestjs");
    expect(a.packageUsage).toBeDefined();
    // package-scan version data must be present — proves scanPackages ran in this path.
    expect(JSON.stringify(a.packageUsage)).toContain("@nestjs/core");
    expect(a.templateVars.BACKEND_FRAMEWORK.toLowerCase()).toContain("nest");
  });

  it("applies the D1 ledger: a confirmed value overrides detection in the bundle", async () => {
    fs.writeFileSync(path.join(tmp, "go.mod"), "module x\ngo 1.22\nrequire github.com/labstack/echo/v4 v4.11.0");
    writeLedger(tmp, { version: 1, values: { "backend.testCommand": { value: "go test -race ./...", source: "confirmed", by: "human" } } });
    const a = await analyzeProject(tmp, { useLlm: false });
    expect(a.templateVars.BACKEND_TEST_CMD).toBe("go test -race ./...");
  });

  it("is deterministic for the same input (init and analyze get identical bundles)", async () => {
    fs.writeFileSync(path.join(tmp, "go.mod"), "module x\ngo 1.22\nrequire github.com/gin-gonic/gin v1.9.0");
    const a = await analyzeProject(tmp, { useLlm: false });
    const b = await analyzeProject(tmp, { useLlm: false });
    expect(a.templateVars).toEqual(b.templateVars);
    expect(a.project.backend?.framework).toBe(b.project.backend?.framework);
  });
});
