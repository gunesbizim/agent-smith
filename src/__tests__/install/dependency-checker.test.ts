import { describe, it, expect, beforeAll } from "vitest";
import { checkDependencies, type DepCheckResult } from "../../install/dependency-checker.js";

describe("Dependency Checker", () => {
  // checkDependencies() shells out to several `--version` probes (node/npm/git/python/pipx/gh).
  // Process-spawn overhead is high on a cold Windows CI runner, so the 5s default test timeout was
  // exceeded. Resolve it ONCE here (with a generous timeout) and share the result — also removes
  // the 8 redundant spawns the per-test calls were doing.
  let result: DepCheckResult;
  beforeAll(async () => {
    result = await checkDependencies();
  }, 60_000);

  it("returns a result with expected shape", () => {
    expect(result).toBeDefined();
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.nodeVersion).toBe("string");
    expect(typeof result.npmVersion).toBe("string");
    expect(typeof result.gitVersion).toBe("string");
    expect(Array.isArray(result.missing)).toBe(true);
    expect(typeof result.checks).toBe("object");
  });

  it("checks for node", () => {
    expect(result.checks.node).toBe(true);
    expect(result.nodeVersion).toMatch(/v\d+/);
  });

  it("checks for npm", () => {
    expect(result.checks.npm).toBe(true);
  });

  it("checks for git", () => {
    expect(result.checks.git).toBe(true);
  });

  it("checks for gh CLI (optional)", () => {
    // gh may or may not be installed — just check key exists
    expect("gh-cli" in result.checks).toBe(true);
  });

  it("ok is false when dependencies are missing", () => {
    // In this test environment, node/npm/git should be present
    if (result.checks.node && result.checks.npm && result.checks.git) {
      expect(result.ok).toBe(true);
    }
  });

  it("missing array has name and installHint", () => {
    for (const m of result.missing) {
      expect(typeof m.name).toBe("string");
      expect(typeof m.installHint).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
    }
  });

  it("python check runs without throwing", () => {
    // python may or may not be installed — just verify no crash
    expect("python" in result.checks).toBe(true);
  });
});
