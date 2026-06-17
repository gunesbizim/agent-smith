// A1/A10 are deferred (no execution engine). This guards the honesty invariant: the roadmap
// documents A1 as not-yet-built, and as long as it is, the pipeline command stays experimental
// (the B9 guarantee). If someone builds the engine, they update both together.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { EXPERIMENTAL_BANNER_TEXT } from "../../cli/experimental-banner.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("execution-engine roadmap honesty (A1/A10)", () => {
  const roadmap = fs.readFileSync(path.join(repoRoot, "docs", "ROADMAP.md"), "utf-8");

  it("documents A1 as the gated, not-yet-built foundation", () => {
    expect(roadmap).toMatch(/A1 — Event-sourced workflow engine/);
    expect(roadmap).toMatch(/executes nothing|stub|do not start/i);
  });

  it("documents A10 as gated on A1", () => {
    expect(roadmap).toMatch(/A10[\s\S]*gated on A1/i);
  });

  it("keeps the pipeline experimental banner while the engine is unbuilt (B9 invariant)", () => {
    expect(EXPERIMENTAL_BANNER_TEXT).toMatch(/does not yet execute/i);
  });
});
