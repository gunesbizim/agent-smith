import { describe, it, expect } from "vitest";
import {
  parseGhChecks,
  evaluateCi,
} from "../../pipeline/ci-status.js";
import type { CiCheck } from "../../pipeline/ci-status.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeCheck(overrides: Partial<CiCheck> & { bucket: string; name: string }): CiCheck {
  return { ...overrides };
}

// ---------------------------------------------------------------------------
// parseGhChecks
// ---------------------------------------------------------------------------

describe("parseGhChecks", () => {
  it("parses a valid array and maps fields correctly", () => {
    const json = JSON.stringify([
      { name: "test (20)", state: "SUCCESS", bucket: "pass", link: "https://example.com", workflow: "CI" },
      { name: "lint", bucket: "fail" },
    ]);
    const result = parseGhChecks(json);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "test (20)",
      bucket: "pass",
      state: "SUCCESS",
      link: "https://example.com",
      workflow: "CI",
    });
    expect(result[1]).toEqual({ name: "lint", bucket: "fail" });
  });

  it('returns [] for empty string ""', () => {
    expect(parseGhChecks("")).toEqual([]);
  });

  it('returns [] for "[]"', () => {
    expect(parseGhChecks("[]")).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseGhChecks("{not json")).toThrow(
      /Invalid gh checks JSON/,
    );
  });

  it("throws when parsed value is not an array (object)", () => {
    expect(() => parseGhChecks('{"a":1}')).toThrow(
      /Expected a JSON array of checks/,
    );
  });

  it("coerces missing name/bucket to empty strings", () => {
    const json = JSON.stringify([{ state: "SUCCESS" }]);
    const result = parseGhChecks(json);
    expect(result[0].name).toBe("");
    expect(result[0].bucket).toBe("");
  });

  it("omits optional fields when not present in source", () => {
    const json = JSON.stringify([{ name: "x", bucket: "pass" }]);
    const result = parseGhChecks(json);
    expect(result[0]).not.toHaveProperty("state");
    expect(result[0]).not.toHaveProperty("link");
    expect(result[0]).not.toHaveProperty("workflow");
  });
});

// ---------------------------------------------------------------------------
// evaluateCi
// ---------------------------------------------------------------------------

describe("evaluateCi", () => {
  it('all "pass" → status "green", no failed, no pending', () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "test", bucket: "pass" }),
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("green");
    expect(result.failed).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });

  it('one "fail" among passes → status "failed", failed contains it', () => {
    const failing = makeCheck({ name: "lint", bucket: "fail" });
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      failing,
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("failed");
    expect(result.failed).toContainEqual(failing);
    expect(result.failed).toHaveLength(1);
  });

  it('one "pending" among passes → status "pending"', () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "deploy", bucket: "pending" }),
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("pending");
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].name).toBe("deploy");
  });

  it('"fail" AND "pending" → status "failed" (fail dominates)', () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "fail" }),
      makeCheck({ name: "deploy", bucket: "pending" }),
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("failed");
  });

  it('"skipping" treated as green → status "green"', () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "optional", bucket: "skipping" }),
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("green");
    expect(result.failed).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });

  it('empty array → status "green", sonar.present false, sonar.green null', () => {
    const result = evaluateCi([]);
    expect(result.status).toBe("green");
    expect(result.sonar.present).toBe(false);
    expect(result.sonar.green).toBeNull();
  });

  it('"cancel" bucket treated as failed', () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "deploy", bucket: "cancel" }),
    ];
    const result = evaluateCi(checks);
    expect(result.status).toBe("failed");
    expect(result.failed).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // sonar tests
  // -------------------------------------------------------------------------

  it("sonar present & passing: sonar.present true, sonar.green true", () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "SonarCloud Code Analysis", bucket: "pass" }),
    ];
    const result = evaluateCi(checks);
    expect(result.sonar.present).toBe(true);
    expect(result.sonar.green).toBe(true);
    expect(result.status).toBe("green");
  });

  it("sonar present & pending: sonar.green false, status pending", () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "SonarCloud Code Analysis", bucket: "pending" }),
    ];
    const result = evaluateCi(checks);
    expect(result.sonar.present).toBe(true);
    expect(result.sonar.green).toBe(false);
    expect(result.status).toBe("pending");
  });

  it("sonar matched by workflow field", () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "analysis", bucket: "pass", workflow: "Sonar Analysis" }),
    ];
    const result = evaluateCi(checks);
    expect(result.sonar.present).toBe(true);
    expect(result.sonar.green).toBe(true);
  });

  it("no sonar checks → sonar.present false, sonar.green null", () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "build", bucket: "pass" }),
      makeCheck({ name: "test", bucket: "pass" }),
    ];
    const result = evaluateCi(checks);
    expect(result.sonar.present).toBe(false);
    expect(result.sonar.green).toBeNull();
  });

  it("sonar present & failing: sonar.green false", () => {
    const checks: CiCheck[] = [
      makeCheck({ name: "SonarCloud Code Analysis", bucket: "fail" }),
    ];
    const result = evaluateCi(checks);
    expect(result.sonar.present).toBe(true);
    expect(result.sonar.green).toBe(false);
    expect(result.status).toBe("failed");
  });
});
