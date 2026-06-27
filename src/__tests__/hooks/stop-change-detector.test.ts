import { describe, it, expect } from "vitest";
// The hook is a plain ESM .js module at repo root; import its pure helpers directly.
import { classifyFile, buildReport } from "../../../hooks/stop-change-detector.js";

describe("classifyFile", () => {
  it("classifies TypeScript source under src/ as code (the CLI-tool bug)", () => {
    expect(classifyFile("src/cli/init.ts", ["src"])).toEqual({ kind: "code", side: "other" });
  });

  it("classifies a .ts file as code by extension even with no configured source dir", () => {
    expect(classifyFile("lib/foo.ts", [])).toEqual({ kind: "code", side: "other" });
  });

  it("labels backend-dir code as backend", () => {
    expect(classifyFile("backend/app/views.py", ["backend"])).toEqual({ kind: "code", side: "backend" });
  });

  it("labels .vue and frontend-dir code as frontend", () => {
    expect(classifyFile("frontend/App.vue", ["frontend"]).side).toBe("frontend");
    expect(classifyFile("src/components/Btn.tsx", ["src"]).side).toBe("frontend");
  });

  it("classifies markdown as docs", () => {
    expect(classifyFile("docs/guide.md", ["src"])).toEqual({ kind: "docs" });
    expect(classifyFile("README.md", ["src"])).toEqual({ kind: "docs" });
  });

  it("treats files under a configured source dir as code even with unknown extensions", () => {
    expect(classifyFile("src/weird.xyz", ["src"]).kind).toBe("code");
  });

  it("classifies unrelated files as other", () => {
    expect(classifyFile("assets/logo.png", ["src"])).toEqual({ kind: "other" });
  });
});

describe("buildReport", () => {
  it("does NOT flag documentation-only when .ts files changed (regression test)", () => {
    const report = buildReport(
      ["src/cli/init.ts", "src/analyze/llm-analyzer.ts", "stuff/notes.md"],
      ["src"],
      "/tmp/proj",
    );
    expect(report.changedCodeFiles).toHaveLength(2);
    expect(report.suggestions).not.toContain("commit: documentation-only changes ready to commit");
    expect(report.suggestions.some((s: string) => s.startsWith("commit: uncommitted code changes"))).toBe(true);
  });

  it("flags documentation-only ONLY when there are no code changes", () => {
    const report = buildReport(["docs/a.md", "README.md"], ["src"], "/tmp/proj");
    expect(report.changedCodeFiles).toHaveLength(0);
    expect(report.suggestions).toContain("commit: documentation-only changes ready to commit");
  });

  it("reports no suggestions when nothing changed", () => {
    const report = buildReport([], ["src"], "/tmp/proj");
    expect(report.hasUncommittedChanges).toBe(false);
    expect(report.suggestions).toEqual([]);
  });
});
