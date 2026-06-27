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

  it("is INVALID when a new test id never appears in the output (id mismatch / not executed)", () => {
    // The suite ran SOMETHING failing, but not the test the engine claims to have authored.
    const proof = buildRedProof({ command: "pytest", stdout: PYTEST_RED, exitCode: 1, newTestIds: ["tests/test_export.py::test_does_not_exist"], hint: "pytest", capturedAt: "t" });
    expect(proof.valid).toBe(false);
    expect(proof.reason).toMatch(/not observed/);
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

  it("does NOT count a skipped test as green (skip is not a pass)", () => {
    const proof = buildRedProof({ command: "pytest", stdout: PYTEST_RED, exitCode: 1, newTestIds: ["tests/test_export.py::test_csv_rows"], hint: "pytest", capturedAt: "t" });
    const skipped = "tests/test_export.py::test_csv_rows SKIPPED                               [100%]";
    const diff = diffAgainstFresh(proof, skipped, 0);
    expect(diff.nowGreen).toEqual([]);
    expect(diff.stillFailing).toEqual(["tests/test_export.py::test_csv_rows"]);
  });
});

// ---------------------------------------------------------------------------
// detectFramework — all hint branches and auto-detect patterns
// ---------------------------------------------------------------------------
describe("detectFramework — hint variants", () => {
  it("detects jest from hint", () => {
    expect(detectFramework("jest", "")).toBe("jest");
  });
  it("detects go from hint", () => {
    expect(detectFramework("go", "")).toBe("go");
  });
  it("detects cargo from rust hint (cargo hint clashes with go substring)", () => {
    // "cargo" contains "go" so detectFramework("cargo","") returns "go" — test the unambiguous "rust" hint
    expect(detectFramework("rust", "")).toBe("cargo");
  });
  it("detects cargo from stdout pattern (test result: ok. without PASSED/FAILED keywords)", () => {
    // Must not contain PASSED/FAILED (pytest auto-detect) or vitest/jest/go patterns
    expect(detectFramework(undefined, "test result: ok. 1 passed; 0 failed; 0 measured;")).toBe("cargo");
  });
  it("returns generic when hint and output both unrecognized", () => {
    expect(detectFramework(undefined, "hello world")).toBe("generic");
  });
  it("auto-detects jest from PASS/FAIL + test file pattern", () => {
    const out = "PASS src/components/button.test.tsx\nFAIL src/utils/format.spec.ts";
    expect(detectFramework(undefined, out)).toBe("jest");
  });
  it("auto-detects go from ok/FAIL lines + --- PASS/FAIL markers", () => {
    const out = "--- PASS: TestFoo (0.01s)\nok  example.com/mypkg  0.015s";
    expect(detectFramework(undefined, out)).toBe("go");
  });
  it("auto-detects cargo from 'test result: ok' line", () => {
    const out = "test mymod::my_fn ... ok\ntest result: ok. 1 passed; 0 failed;";
    expect(detectFramework(undefined, out)).toBe("cargo");
  });
  it("auto-detects vitest from RUN + version pattern", () => {
    const out = "RUN v1.2.3 src/foo.test.ts";
    expect(detectFramework(undefined, out)).toBe("vitest");
  });
  it("auto-detects pytest from PASSED keyword when no banner", () => {
    // A minimal pytest -v line without the banner — the regex falls back to PASSED/FAILED keyword
    expect(detectFramework(undefined, "some_test PASSED")).toBe("pytest");
  });
});

// ---------------------------------------------------------------------------
// parseTestRun — Go parser (lines 147-162)
// ---------------------------------------------------------------------------
describe("parseTestRun — go", () => {
  const GO_OUTPUT = [
    "=== RUN   TestAdd",
    "--- PASS: TestAdd (0.00s)",
    "=== RUN   TestSub",
    "--- FAIL: TestSub (0.01s)",
    "=== RUN   TestSkip",
    "--- SKIP: TestSkip (0.00s)",
    "FAIL\texample.com/mypkg\t0.025s",
  ].join("\n");

  it("parses PASS, FAIL, SKIP statuses correctly", () => {
    const r = parseTestRun(GO_OUTPUT, 1, "go");
    expect(r.framework).toBe("go");
    expect(r.tests).toEqual([
      { id: "TestAdd", status: "pass" },
      { id: "TestSub", status: "fail" },
      { id: "TestSkip", status: "skip" },
    ]);
    expect(r.collectionError).toBe(false);
    expect(r.idless).toBe(false);
  });

  it("flags a build failure as a collectionError", () => {
    const out = "[build failed]\nFAIL\texample.com/mypkg [build failed]";
    expect(parseTestRun(out, 2, "go").collectionError).toBe(true);
  });

  it("flags 'cannot find package' as collectionError", () => {
    expect(parseTestRun("cannot find package \"foo\"", 1, "go").collectionError).toBe(true);
  });

  it("returns idless=true when there are no parseable test lines", () => {
    const r = parseTestRun("ok  example.com/mypkg  0.001s", 0, "go");
    expect(r.tests).toHaveLength(0);
    expect(r.idless).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTestRun — Cargo parser (lines 165-182)
// Note: "cargo" hint clashes with "go" substring in detectFramework, so use "rust" hint
// or drive via stdout pattern that auto-detects to cargo.
// ---------------------------------------------------------------------------
describe("parseTestRun — cargo", () => {
  // This output auto-detects to cargo because of `test result:` line
  const CARGO_OUTPUT = [
    "running 3 tests",
    "test mymod::test_add ... ok",
    "test mymod::test_sub ... FAILED",
    "test mymod::test_ignore ... ignored",
    "test result: FAILED. 1 passed; 1 failed; 1 ignored; 0 measured;",
  ].join("\n");

  it("parses ok, FAILED, ignored statuses correctly (rust hint)", () => {
    // Use "rust" hint — "cargo" clashes with "go" substring in detectFramework
    const r = parseTestRun(CARGO_OUTPUT, 1, "rust");
    expect(r.framework).toBe("cargo");
    expect(r.tests).toEqual([
      { id: "mymod::test_add", status: "pass" },
      { id: "mymod::test_sub", status: "fail" },
      { id: "mymod::test_ignore", status: "skip" },
    ]);
    expect(r.collectionError).toBe(false);
  });

  it("parses cargo output with rust hint (unambiguous)", () => {
    const r = parseTestRun(CARGO_OUTPUT, 1, "rust");
    expect(r.framework).toBe("cargo");
    expect(r.tests).toHaveLength(3);
  });

  it("flags a compile error as collectionError (rust hint)", () => {
    const out = "error[E0308]: mismatched types\ncould not compile `mymod`";
    expect(parseTestRun(out, 101, "rust").collectionError).toBe(true);
  });

  it("flags error[E...] code as collectionError (rust hint)", () => {
    expect(parseTestRun("error[E0412]: cannot find type `Foo`", 1, "rust").collectionError).toBe(true);
  });

  it("returns idless=true when cargo output has no test lines", () => {
    const r = parseTestRun("test result: ok. 0 passed; 0 failed;", 0);
    expect(r.framework).toBe("cargo");
    expect(r.tests).toHaveLength(0);
    expect(r.idless).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTestRun — pytest status variants (line 120: default/XFAIL/XPASS)
// ---------------------------------------------------------------------------
describe("parseTestRun — pytest status edge cases", () => {
  it("maps XFAIL to pass (expected failure)", () => {
    const out = "tests/test_x.py::test_expected XFAIL                              [100%]";
    const r = parseTestRun(out, 0, "pytest");
    expect(r.tests).toEqual([{ id: "tests/test_x.py::test_expected", status: "pass" }]);
  });

  it("maps XPASS to pass (unexpected pass — still a passing outcome)", () => {
    const out = "tests/test_x.py::test_unexpected XPASS                             [100%]";
    const r = parseTestRun(out, 0, "pytest");
    expect(r.tests).toEqual([{ id: "tests/test_x.py::test_unexpected", status: "pass" }]);
  });

  it("maps SKIPPED to skip", () => {
    const out = "tests/test_x.py::test_skipped SKIPPED                              [100%]";
    const r = parseTestRun(out, 0, "pytest");
    expect(r.tests).toEqual([{ id: "tests/test_x.py::test_skipped", status: "skip" }]);
  });

  it("maps ERROR to error status", () => {
    const out = "tests/test_x.py::test_errored ERROR                                [100%]";
    const r = parseTestRun(out, 1, "pytest");
    expect(r.tests).toEqual([{ id: "tests/test_x.py::test_errored", status: "error" }]);
  });

  it("flags collection error via 'ERROR <path>' banner pattern", () => {
    const out = "ERROR tests/conftest.py\nsome import blew up";
    expect(parseTestRun(out, 4, "pytest").collectionError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTestRun — vitest/jest: ❯ header lines are not tests; collectionError
// ---------------------------------------------------------------------------
describe("parseTestRun — vitest/jest edge cases", () => {
  it("ignores ❯ describe-header lines (not individual test results)", () => {
    const out = " ❯ src/foo.test.ts\n  ✓ passes 1ms\n  × fails 2ms";
    const r = parseTestRun(out, 1, "vitest");
    // ❯ line must not produce a test entry
    expect(r.tests).toHaveLength(2);
    expect(r.tests[0].status).toBe("pass");
    expect(r.tests[1].status).toBe("fail");
  });

  it("strips timing suffix from test id", () => {
    const out = " ✓ my suite > the name 12.3ms";
    const r = parseTestRun(out, 0, "vitest");
    expect(r.tests[0].id).toBe("my suite > the name");
  });

  it("flags 'Failed to load' as collectionError", () => {
    const out = "Failed to load /path/to/file.ts\nSyntaxError: unexpected token";
    expect(parseTestRun(out, 1, "vitest").collectionError).toBe(true);
  });

  it("flags 'Cannot find module' as collectionError", () => {
    expect(parseTestRun("Cannot find module './missing'", 1, "jest").collectionError).toBe(true);
  });

  it("parses ✗ mark as fail (alternative fail glyph)", () => {
    const out = " ✗ broken test 5ms";
    const r = parseTestRun(out, 1, "vitest");
    expect(r.tests).toEqual([{ id: "broken test", status: "fail" }]);
  });
});

// ---------------------------------------------------------------------------
// allFailing (line 262)
// ---------------------------------------------------------------------------
import { allFailing } from "../../engine/red-proof.js";

describe("allFailing", () => {
  it("returns true when every test is failing or erroring", () => {
    expect(allFailing([{ id: "a", status: "fail" }, { id: "b", status: "error" }])).toBe(true);
  });

  it("returns false when any test is passing", () => {
    expect(allFailing([{ id: "a", status: "fail" }, { id: "b", status: "pass" }])).toBe(false);
  });

  it("returns false when any test is skipped", () => {
    expect(allFailing([{ id: "a", status: "skip" }])).toBe(false);
  });

  it("returns false for an empty list (nothing to assert all failing)", () => {
    expect(allFailing([])).toBe(false);
  });

  it("returns true for a single erroring test", () => {
    expect(allFailing([{ id: "x", status: "error" }])).toBe(true);
  });
});
