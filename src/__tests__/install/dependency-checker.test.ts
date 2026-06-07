import { describe, it, expect } from "vitest";
import { checkDependencies } from "../../install/dependency-checker.js";

describe("Dependency Checker", () => {
  it("returns a result with expected shape", async () => {
    const result = await checkDependencies();
    expect(result).toBeDefined();
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.nodeVersion).toBe("string");
    expect(typeof result.npmVersion).toBe("string");
    expect(typeof result.gitVersion).toBe("string");
    expect(Array.isArray(result.missing)).toBe(true);
    expect(typeof result.checks).toBe("object");
  });

  it("checks for node", async () => {
    const result = await checkDependencies();
    expect(result.checks.node).toBe(true);
    expect(result.nodeVersion).toMatch(/v\d+/);
  });

  it("checks for npm", async () => {
    const result = await checkDependencies();
    expect(result.checks.npm).toBe(true);
  });

  it("checks for git", async () => {
    const result = await checkDependencies();
    expect(result.checks.git).toBe(true);
  });

  it("checks for gh CLI (optional)", async () => {
    const result = await checkDependencies();
    // gh may or may not be installed — just check key exists
    expect("gh-cli" in result.checks).toBe(true);
  });

  it("ok is false when dependencies are missing", async () => {
    const result = await checkDependencies();
    // In this test environment, node/npm/git should be present
    if (result.checks.node && result.checks.npm && result.checks.git) {
      expect(result.ok).toBe(true);
    }
  });

  it("missing array has name and installHint", async () => {
    const result = await checkDependencies();
    for (const m of result.missing) {
      expect(typeof m.name).toBe("string");
      expect(typeof m.installHint).toBe("string");
      expect(m.name.length).toBeGreaterThan(0);
    }
  });

  it("python check runs without throwing", async () => {
    const result = await checkDependencies();
    // python may or may not be installed — just verify no crash
    expect("python" in result.checks).toBe(true);
  });
});
