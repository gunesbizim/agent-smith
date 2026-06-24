import { describe, expect, it } from "vitest";
import { buildRedProof, detectFramework, diffAgainstFresh, parseTestRun } from "../../engine/red-proof.js";

const PYTEST_RED = [
  "============================= test session starts ==============================",
  "tests/test_export.py::test_csv_header PASSED                              [ 50%]",
  "tests/test_export.py::test_csv_rows FAILED                                [100%]",
].join("\n");

const PYTEST_GREEN = [
  "tests/test_export.py::test_csv_header PASSED                              [ 50%]",
  "tests/test_export.py::test_csv_rows PASSED                                [100%]",
].join("\n");

describe("detectFramework", () => {
  it("prefers an explicit hint", () => {
    expect(detectFramework("pytest", "")).toBe("pytest");
    expect(detectFramework("vitest", "")).toBe("vitest");
  });
  it("falls back to output shape", () => {
    expect(detectFramework(undefined, PYTEST_RED)).toBe("pytest");
    expect(detectFramework(undefined, " ✓ a > b 1ms\n × a > c 2ms")).toBe("vitest");
  });
});

describe("parseTestRun", () => {
  it("parses pytest per-test statuses", () => {
    const r = parseTestRun(PYTEST_RED, 1, "pytest");
    expect(r.tests).toEqual([
      { id: "tests/test_export.py::test_csv_header", status: "pass" },
      { id: "tests/test_export.py::test_csv_rows", status: "fail" },
    ]);
    expect(r.collectionError).toBe(false);
    expect(r.idless).toBe(false);
  });

  it("flags a pytest collection error", () => {
    const out = "==================================== ERRORS ====================================\nerrors during collection";
    expect(parseTestRun(out, 2, "pytest").collectionError).toBe(true);
  });

  it("parses vitest ✓/× lines", () => {
    const out = " ✓ src/foo.test.ts > adds 3ms\n × src/foo.test.ts > subtracts 2ms";
    const r = parseTestRun(out, 1, "vitest");
    expect(r.tests).toEqual([
      { id: "src/foo.test.ts > adds", status: "pass" },
      { id: "src/foo.test.ts > subtracts", status: "fail" },
    ]);
  });

  it("is idless for unrecognized output (generic)", () => {
    const r = parseTestRun("everything is fine, 5 tests ran", 0);
    expect(r.framework).toBe("generic");
    expect(r.idless).toBe(true);
  });
});

describe("buildRedProof", () => {
  const newIds = ["tests/test_export.py::test_csv_rows"];

  it("is valid when every new test is failing", () => {
    const proof = buildRedProof({ command: "pytest", stdout: PYTEST_RED, exitCode: 1, newTestIds: newIds, hint: "pytest", capturedAt: "2026-06-23T00:00:00Z" });
    expect(proof.valid).toBe(true);
    expect(proof.newTests).toEqual([{ id: newIds[0], status: "fail" }]);
  });

  it("is INVALID when a new test passes (anti-false-negative)", () => {
    const proof = buildRedProof({ command: "pytest", stdout: PYTEST_GREEN, exitCode: 0, newTestIds: newIds, hint: "pytest", capturedAt: "t" });
    expect(proof.valid).toBe(false);
    expect(proof.reason).toMatch(/passed instead of failing/);
  });

  it("is INVALID on a collection error even with non-zero exit", () => {
    const out = "==================================== ERRORS ====================================\nerrors during collection";
    const proof = buildRedProof({ command: "pytest", stdout: out, exitCode: 2, newTestIds: newIds, hint: "pytest", capturedAt: "t" });
    expect(proof.valid).toBe(false);
    expect(proof.reason).toMatch(/collect/);
  });

  it("is INVALID when per-test results are unextractable (idless runner)", () => {
    const proof = buildRedProof({ command: "make test", stdout: "ran some tests", exitCode: 1, newTestIds: newIds, capturedAt: "t" });
    expect(proof.valid).toBe(false);
    expect(proof.reason).toMatch(/unverifiable/);
  });
});

describe("diffAgainstFresh", () => {
  it("reports stillFailing, nowGreen, and missing", () => {
    const proof = buildRedProof({ command: "pytest", stdout: PYTEST_RED, exitCode: 1, newTestIds: ["tests/test_export.py::test_csv_rows"], hint: "pytest", capturedAt: "t" });
    const diff = diffAgainstFresh(proof, PYTEST_GREEN, 0);
    expect(diff.nowGreen).toEqual(["tests/test_export.py::test_csv_rows"]);
    expect(diff.stillFailing).toEqual([]);

    const stillRed = diffAgainstFresh(proof, PYTEST_RED, 1);
    expect(stillRed.stillFailing).toEqual(["tests/test_export.py::test_csv_rows"]);

    const gone = diffAgainstFresh(proof, "unrelated output", 0);
    expect(gone.missing).toEqual(["tests/test_export.py::test_csv_rows"]);
  });
});
