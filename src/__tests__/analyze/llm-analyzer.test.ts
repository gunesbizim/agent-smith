import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { extractJsonObject, mergeStack, gatherEvidence, refineWithLlm, isClaudeAvailable } from "../../analyze/llm-analyzer.js";
import type { DetectedProject, BackendInfo } from "../../shared/types.js";

const BASE: DetectedProject = {
  rootPath: "/test/project",
  projectType: "unknown",
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

const DJANGO_BACKEND: BackendInfo = {
  framework: "django", language: "python", languageVersion: "3.12",
  hasHexagonalArch: true, hasServiceRepo: true, usesAPIView: true, usesFunctionViews: false,
  importStyle: "absolute", rolePattern: "decorators", authMethod: "JWT",
  loggingPattern: "structured", orm: "Django ORM",
};

describe("extractJsonObject", () => {
  it("parses a bare minified JSON object", () => {
    expect(extractJsonObject('{"projectType":"cli-tool"}')).toEqual({ projectType: "cli-tool" });
  });

  it("extracts JSON embedded in surrounding prose / fences", () => {
    const out = 'Here is the result:\n```json\n{"projectType":"library","backend":null}\n```\nDone.';
    expect(extractJsonObject(out)).toEqual({ projectType: "library", backend: null });
  });

  it("handles braces inside string values", () => {
    expect(extractJsonObject('{"note":"uses {curly} braces"}')).toEqual({ note: "uses {curly} braces" });
  });

  it("returns null when there is no JSON object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(extractJsonObject('{"a": }')).toBeNull();
  });
});

describe("mergeStack", () => {
  it("overrides projectType while keeping other programmatic fields", () => {
    const merged = mergeStack({ ...BASE, projectType: "web-app" }, { projectType: "cli-tool" });
    expect(merged.projectType).toBe("cli-tool");
  });

  it("nulls out a side when the LLM says it does not exist", () => {
    const merged = mergeStack({ ...BASE, backend: DJANGO_BACKEND }, { backend: null });
    expect(merged.backend).toBeNull();
  });

  it("preserves rich heuristic backend fields the LLM omits", () => {
    const merged = mergeStack(
      { ...BASE, backend: DJANGO_BACKEND },
      { backend: { framework: "fastapi", language: "python" } },
    );
    expect(merged.backend?.framework).toBe("fastapi");
    // rolePattern/authMethod were not in the LLM output → kept from programmatic detection.
    expect(merged.backend?.rolePattern).toBe("decorators");
    expect(merged.backend?.authMethod).toBe("JWT");
  });

  it("constructs a backend from scratch when programmatic found none", () => {
    const merged = mergeStack(BASE, { backend: { framework: "express", language: "typescript" } });
    expect(merged.backend?.framework).toBe("express");
    expect(merged.backend?.language).toBe("typescript");
  });

  it("builds a frontend when the LLM detects one the heuristics missed", () => {
    const merged = mergeStack(BASE, { frontend: { framework: "react", uiLibrary: "MUI", usesTypeScript: true } });
    expect(merged.frontend?.framework).toBe("react");
    expect(merged.frontend?.uiLibrary).toBe("MUI");
    expect(merged.frontend?.usesTypeScript).toBe(true);
  });

  it("ignores a backend entry with no framework string", () => {
    const merged = mergeStack({ ...BASE, backend: DJANGO_BACKEND }, { backend: { language: "python" } });
    // No framework provided and not explicitly null → leave programmatic backend untouched.
    expect(merged.backend?.framework).toBe("django");
  });
});

describe("gatherEvidence", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("includes a top-level listing and present manifest contents", () => {
    fs.writeJsonSync(path.join(tmp, "package.json"), { name: "demo", bin: { demo: "x.js" } });
    fs.ensureDirSync(path.join(tmp, "src"));
    const ev = gatherEvidence(tmp);
    expect(ev).toContain("Top-level entries:");
    expect(ev).toContain("package.json");
    expect(ev).toContain("--- package.json ---");
    expect(ev).toContain("demo");
  });

  it("skips manifest files that are not present", () => {
    const ev = gatherEvidence(tmp);
    expect(ev).not.toContain("--- go.mod ---");
    expect(ev).not.toContain("--- Cargo.toml ---");
  });

  it("truncates oversized manifests to the per-file cap", () => {
    fs.writeFileSync(path.join(tmp, "requirements.txt"), "x".repeat(10_000));
    const ev = gatherEvidence(tmp);
    // 4000-char per-file cap means the full 10k payload is not emitted verbatim.
    expect(ev.length).toBeLessThan(9_000);
  });
});

describe("refineWithLlm fallback", () => {
  const PROG: DetectedProject = { ...BASE, projectType: "cli-tool" };

  it("returns the programmatic project unchanged when claude is unavailable", () => {
    if (isClaudeAvailable()) return; // environment-dependent; only assert the fallback path
    const result = refineWithLlm("/nonexistent", PROG);
    expect(result.usedLlm).toBe(false);
    expect(result.project).toEqual(PROG);
    expect(result.reason).toMatch(/claude/i);
  });
});
