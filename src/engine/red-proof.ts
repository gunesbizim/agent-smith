// Shared test-output parser + red-proof model.
//
// This module is the single source of truth for turning a test runner's output into per-test
// statuses, used by BOTH the RED phase (which proves new tests fail) and the deterministic TDD-gate
// hook (which proves they later pass). They MUST agree on test-id extraction, so the logic lives in
// one place and is heavily unit-tested.
//
// The central correctness rule (see plan "RED false negatives"): a non-zero suite exit is NOT proof
// a test asserted-and-failed. A suite that fails to *collect* (import error, syntax error) also
// exits non-zero but proves nothing. So a valid red-proof requires each new test to be collected and
// report FAIL/ERROR — never merely a non-zero exit code.

export type TestStatus = "pass" | "fail" | "error" | "skip";

export interface TestResult {
  id: string;
  status: TestStatus;
}

export type TestFramework = "pytest" | "vitest" | "jest" | "go" | "cargo" | "generic";

export interface ParsedTestRun {
  framework: TestFramework;
  tests: TestResult[];
  /** Suite failed to load/collect (import/syntax error). A red-proof built from this is invalid. */
  collectionError: boolean;
  exitCode: number;
  /** True when no per-test ids could be extracted — the gate must degrade to "ask a human". */
  idless: boolean;
}

export interface RedProof {
  command: string;
  framework: TestFramework;
  exitCode: number;
  treeFingerprint?: string;
  /** The new tests this run proved RED. Each must be fail/error for the proof to be valid. */
  newTests: TestResult[];
  capturedAt: string;
  valid: boolean;
  reason?: string;
}

export interface RedGreenDiff {
  /** New tests still failing/erroring in the fresh run (the gate denies if non-empty). */
  stillFailing: string[];
  /** New tests now passing. */
  nowGreen: string[];
  /** New tests absent from the fresh run output (suspicious — treat as not-yet-green). */
  missing: string[];
}

const FAILED = new Set<TestStatus>(["fail", "error"]);

const HINT_RULES: Array<{ test: (h: string) => boolean; result: TestFramework }> = [
  { test: (h) => h.includes("pytest"), result: "pytest" },
  { test: (h) => h.includes("vitest"), result: "vitest" },
  { test: (h) => h.includes("jest"), result: "jest" },
  { test: (h) => h.includes("go"), result: "go" },
  { test: (h) => h.includes("cargo") || h.includes("rust"), result: "cargo" },
];

const OUTPUT_RULES: Array<{ test: (stdout: string) => boolean; result: TestFramework }> = [
  // ={5,} bounded to ={5,100}: pytest banners are always <80 chars, so >100 = is impossible in
  // practice; bounding prevents SonarCloud from flagging the unbounded quantifier as S8786.
  { test: (o) => /={5,100}[ \t]+(?:test session starts|FAILURES|ERRORS|short test summary)/i.test(o) || /\bPASSED\b|\bFAILED\b/.test(o), result: "pytest" },
  // ^\s*[✓×✗❯]\s rewritten: replace \s* with [ \t]* (no newlines after ^m anchor) to avoid
  // adjacent-whitespace ambiguity. \bRUN\b.*\bv\d rewritten with [^\n]* (no cross-line backtracking).
  { test: (o) => /^[ \t]*[✓×✗❯][ \t]/m.test(o) || /\bRUN\b[^\n]*\bv\d/i.test(o), result: "vitest" },
  { test: (o) => /^(?:PASS|FAIL) /m.test(o) && /\.(?:test|spec)\.[tj]sx?/.test(o), result: "jest" },
  { test: (o) => /^(ok|FAIL)\s+\S+/m.test(o) && /---\s*(PASS|FAIL):/.test(o), result: "go" },
  { test: (o) => /test result:\s+(ok|FAILED)\./.test(o), result: "cargo" },
];

/** Pick a framework from an explicit hint (e.g. TEST_FRAMEWORK_PACKAGE) then from output shape. */
export function detectFramework(hint: string | undefined, stdout: string): TestFramework {
  const h = (hint ?? "").toLowerCase();
  for (const rule of HINT_RULES) {
    if (rule.test(h)) return rule.result;
  }
  for (const rule of OUTPUT_RULES) {
    if (rule.test(stdout)) return rule.result;
  }
  return "generic";
}

export function parseTestRun(stdout: string, exitCode: number, hint?: string): ParsedTestRun {
  const framework = detectFramework(hint, stdout);
  const parser = PARSERS[framework];
  const { tests, collectionError } = parser(stdout);
  return {
    framework,
    tests,
    collectionError,
    exitCode,
    idless: tests.length === 0,
  };
}

type FrameworkParser = (stdout: string) => { tests: TestResult[]; collectionError: boolean };

const PARSERS: Record<TestFramework, FrameworkParser> = {
  pytest: parsePytest,
  vitest: parseVitestJest,
  jest: parseVitestJest,
  go: parseGo,
  cargo: parseCargo,
  generic: parseGeneric,
};

// pytest -v: lines like `tests/test_x.py::test_name PASSED [ 50%]`. Collection failures show as an
// "ERRORS" banner or "errors during collection".
function parsePytest(stdout: string): { tests: TestResult[]; collectionError: boolean } {
  const tests: TestResult[] = [];
  const re = /^([^:\s]+::[^\s]+)\s+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    tests.push({ id: m[1], status: pytestStatus(m[2]) });
  }
  // Use string includes for the multi-word literal; bound the = quantifiers to prevent
  // unbounded-quantifier NFA paths that SonarCloud S8786 flags.
  const collectionError =
    stdout.toLowerCase().includes("errors during collection") ||
    /^ERROR[ \t]+\S/m.test(stdout) ||
    /={3,100}[ \t]+ERRORS[ \t]+={3,100}/i.test(stdout);
  return { tests, collectionError };
}

function pytestStatus(s: string): TestStatus {
  switch (s) {
    case "PASSED":
    case "XFAIL":
    case "XPASS":
      return "pass";
    case "FAILED":
      return "fail";
    case "ERROR":
      return "error";
    default:
      return "skip";
  }
}

// vitest / jest verbose: `✓ suite > name` (pass), `× name` or `✗ name` (fail). Collection/transform
// errors surface as "Failed to load" / "transform error" / "Cannot find module".
// Strip a trailing timing annotation like " 3ms" or " 1.2ms" from a test-id line.
// Use [ \t]+ instead of \s+ so whitespace matching is disjoint from digit/letter matching;
// avoid leading \s+ that creates O(n²) retry on lines with many spaces.
const TIMING_SUFFIX = /[ \t]+\d[\d.]*[ \t]*m?s[ \t]*$/;

function parseVitestJest(stdout: string): { tests: TestResult[]; collectionError: boolean } {
  const tests: TestResult[] = [];
  // ^\s* rewritten to ^[ \t]* — in multiline mode \s can cross line boundaries creating super-linear
  // paths; [ \t]* restricts to horizontal whitespace which is all that precedes these markers.
  const re = /^[ \t]*([✓×✗❯])[ \t]+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    const mark = m[1];
    const id = m[2].replace(TIMING_SUFFIX, "").trim();
    if (mark === "❯") continue; // a file/describe header, not a test
    tests.push({ id, status: mark === "✓" ? "pass" : "fail" });
  }
  const collectionError = /Failed to load|transform error|Cannot find module|SyntaxError:/i.test(stdout);
  return { tests, collectionError };
}

// `go test -v`: `--- PASS: TestName (0.00s)` / `--- FAIL: TestName`. Build failure ⇒ collectionError.
function parseGo(stdout: string): { tests: TestResult[]; collectionError: boolean } {
  const tests: TestResult[] = [];
  const re = /^[ \t]*--- (PASS|FAIL|SKIP):[ \t]+(\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    let status: TestStatus;
    if (m[1] === "PASS") {
      status = "pass";
    } else if (m[1] === "SKIP") {
      status = "skip";
    } else {
      status = "fail";
    }
    tests.push({ id: m[2], status });
  }
  const collectionError = /\[build failed\]|cannot find package|undefined:/i.test(stdout);
  return { tests, collectionError };
}

// `cargo test`: `test path::name ... ok|FAILED`. Compile error ⇒ collectionError.
function parseCargo(stdout: string): { tests: TestResult[]; collectionError: boolean } {
  const tests: TestResult[] = [];
  const re = /^test\s+(\S+)\s+\.\.\.\s+(ok|FAILED|ignored)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stdout)) !== null) {
    let status: TestStatus;
    if (m[2] === "ok") {
      status = "pass";
    } else if (m[2] === "ignored") {
      status = "skip";
    } else {
      status = "fail";
    }
    tests.push({ id: m[1], status });
  }
  const collectionError = /error\[E\d+\]|could not compile/i.test(stdout);
  return { tests, collectionError };
}

// No recognizable per-test format. Yield no ids; callers degrade to suite-level + ask-a-human.
function parseGeneric(): { tests: TestResult[]; collectionError: boolean } {
  return { tests: [], collectionError: false };
}

/**
 * Build a red-proof from a RED-phase test run. `newTestIds` are the tests the engine just authored.
 * The proof is valid only if there was no collection error and every new test was collected AND is
 * failing/erroring. A new test that PASSED (over-loose assertion / feature already exists) invalidates
 * the proof — that is the anti-false-negative guard.
 */
export function buildRedProof(args: {
  command: string;
  stdout: string;
  exitCode: number;
  newTestIds: string[];
  hint?: string;
  treeFingerprint?: string;
  capturedAt: string;
}): RedProof {
  const parsed = parseTestRun(args.stdout, args.exitCode, args.hint);
  const byId = new Map(parsed.tests.map((t) => [t.id, t]));
  const newTests: TestResult[] = args.newTestIds.map((id) => byId.get(id) ?? { id, status: "error" as TestStatus });
  // Tests the engine authored but that never appeared in the run output. Silently coercing these to
  // "error" (and thus counting them as failing) would let a suite that never RAN the new tests still
  // "prove RED" — the exact false negative this module exists to prevent. So a missing id is fatal.
  const missing = args.newTestIds.filter((id) => !byId.has(id));

  let valid = true;
  let reason: string | undefined;
  if (parsed.collectionError) {
    valid = false;
    reason = "suite failed to collect — a collection error is not proof a test asserted and failed";
  } else if (parsed.idless && args.newTestIds.length > 0) {
    valid = false;
    reason = "could not extract per-test results; red proof is unverifiable for this runner";
  } else if (missing.length > 0) {
    valid = false;
    reason = `new test(s) not observed in run output (id mismatch or not executed): ${missing.join(", ")}`;
  } else {
    const passing = newTests.filter((t) => t.status === "pass").map((t) => t.id);
    if (passing.length > 0) {
      valid = false;
      reason = `new test(s) passed instead of failing: ${passing.join(", ")}`;
    }
  }

  return {
    command: args.command,
    framework: parsed.framework,
    exitCode: args.exitCode,
    treeFingerprint: args.treeFingerprint,
    newTests,
    capturedAt: args.capturedAt,
    valid,
    reason,
  };
}

/** Compare a stored red-proof's tests against a fresh run. The gate denies while stillFailing/missing. */
export function diffAgainstFresh(redProof: RedProof, freshStdout: string, freshExit: number): RedGreenDiff {
  const fresh = parseTestRun(freshStdout, freshExit, redProof.framework);
  const byId = new Map(fresh.tests.map((t) => [t.id, t]));
  const stillFailing: string[] = [];
  const nowGreen: string[] = [];
  const missing: string[] = [];
  for (const t of redProof.newTests) {
    const f = byId.get(t.id);
    // A skipped test asserts nothing — it must NOT count as green (else `it.skip` satisfies the gate).
    if (!f) missing.push(t.id);
    else if (f.status === "pass") nowGreen.push(t.id);
    else stillFailing.push(t.id);
  }
  return { stillFailing, nowGreen, missing };
}

export function allFailing(tests: TestResult[]): boolean {
  return tests.length > 0 && tests.every((t) => FAILED.has(t.status));
}
