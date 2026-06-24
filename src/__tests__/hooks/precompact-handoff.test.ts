import { describe, it, expect } from "vitest";
import { renderSnapshot, SNAPSHOT_FILENAME } from "../../../hooks/pre-compact-handoff.js";

describe("pre-compact-handoff renderSnapshot", () => {
  it("uses a stable snapshot filename", () => {
    expect(SNAPSHOT_FILENAME).toBe("HANDOFF-autosnapshot.md");
  });

  it("renders branch, commits, open PR and flags a dirty tree", () => {
    const md = renderSnapshot({
      branch: "feat/x",
      status: " M a.ts",
      recentCommits: "abc feat: y",
      openPr: "#42 do thing",
      timestamp: "2026-06-24T00:00:00Z",
    });
    expect(md).toContain("feat/x");
    expect(md).toContain("DIRTY");
    expect(md).toContain("abc feat: y");
    expect(md).toContain("#42 do thing");
  });

  it("marks a clean tree and tolerates missing facts", () => {
    const md = renderSnapshot({ branch: "main", timestamp: "t" });
    expect(md).toContain("Working tree: clean");
    expect(md).toContain("_none detected_");
  });
});
