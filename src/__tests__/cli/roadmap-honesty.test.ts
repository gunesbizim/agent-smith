// Honesty invariant after A1 shipped. The real execution engine landed as `agent-smith run`, so the
// ROADMAP marks A1 shipped and the legacy `ticket`/`pipeline` banner must stay truthful: it prints
// previews and points to `agent-smith run` for real execution (the B9 guarantee — never imply a PR
// was created when none was).
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { EXPERIMENTAL_BANNER_TEXT } from "../../cli/experimental-banner.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("execution-engine roadmap honesty (A1 shipped)", () => {
  const roadmap = fs.readFileSync(path.join(repoRoot, "docs", "ROADMAP.md"), "utf-8");

  it("documents A1 (event-sourced workflow engine) as shipped", () => {
    expect(roadmap).toMatch(/A1 — Event-sourced workflow engine/);
    expect(roadmap).toMatch(/A1[\s\S]*shipped/i);
  });

  it("ties the shipped engine to the real `agent-smith run` command", () => {
    expect(roadmap).toMatch(/agent-smith run/);
  });

  it("keeps the legacy preview banner truthful and points to real execution (B9 invariant)", () => {
    expect(EXPERIMENTAL_BANNER_TEXT).toMatch(/does not execute/i);
    expect(EXPERIMENTAL_BANNER_TEXT).toMatch(/agent-smith run/);
  });
});
