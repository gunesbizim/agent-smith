/**
 * Unit tests for src/cli/init-steps/analyze-step.ts
 *
 * All I/O dependencies are mocked with vi.mock(). Tests assert orchestration:
 * correct functions called, arguments threaded correctly, dry-run path skips
 * gh install, error/skip branches handled.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DepCheckResult } from "../../install/dependency-checker.js";

// ── Mocks (must be hoisted above imports) ──────────────────────────────────

vi.mock("../../analyze/analyze-project.js", () => ({
  analyzeProject: vi.fn(),
}));

vi.mock("../../analyze/architecture-sniffer.js", () => ({
  probeSentrux: vi.fn(),
}));

vi.mock("../../adapt/project-interview.js", () => ({
  runInterview: vi.fn(),
  applyInterviewAnswers: vi.fn(),
}));

vi.mock("../../install/dependency-checker.js", () => ({
  checkDependencies: vi.fn(),
}));

vi.mock("../../install/gh-installer.js", () => ({
  ensureGhCli: vi.fn(),
}));

vi.mock("ora", () => {
  const spinner = {
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  };
  return { default: vi.fn(() => spinner) };
});

// ── Imports (after vi.mock hoisting) ──────────────────────────────────────

import { runDependencyChecks, runAnalysis } from "../../cli/init-steps/analyze-step.js";
import { analyzeProject } from "../../analyze/analyze-project.js";
import { probeSentrux } from "../../analyze/architecture-sniffer.js";
import { runInterview, applyInterviewAnswers } from "../../adapt/project-interview.js";
import { checkDependencies } from "../../install/dependency-checker.js";
import { ensureGhCli } from "../../install/gh-installer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

const mockAnalyzeProject = vi.mocked(analyzeProject);
const mockProbeSentrux = vi.mocked(probeSentrux);
const mockRunInterview = vi.mocked(runInterview);
const mockApplyInterviewAnswers = vi.mocked(applyInterviewAnswers);
const mockCheckDependencies = vi.mocked(checkDependencies);
const mockEnsureGhCli = vi.mocked(ensureGhCli);

// ── Default fixture data ───────────────────────────────────────────────────

const MOCK_PROJECT = {
  rootPath: "/tmp/test-project",
  projectType: "cli-tool" as const,
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

const MOCK_STACK_PROFILE = { language: "TypeScript" as const, framework: "Express" };

const MOCK_LEDGER = {
  values: {} as Record<string, { source: "confirmed"; value: string; confirmedAt: string }>,
  lastUpdated: new Date().toISOString(),
};

function makeAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    project: MOCK_PROJECT,
    patterns: [],
    packageUsage: {} as never, // PackageUsage is fully mocked; ts cast for fixture
    stackProfile: MOCK_STACK_PROFILE,
    templateVars: { ...DEFAULT_TEMPLATE_VARS },
    ledger: MOCK_LEDGER,
    llmRefined: false,
    llmReason: undefined,
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof analyzeProject>>;
}

const DEP_OK: DepCheckResult = {
  ok: true,
  nodeVersion: "22.0.0",
  npmVersion: "10.0.0",
  gitVersion: "2.40.0",
  missing: [],
  pythonVersion: null,
  pipxAvailable: false,
  ghAvailable: true,
  checks: { node: true, npm: true, git: true },
};

const DEP_MISSING: DepCheckResult = {
  ok: false,
  missing: [{ name: "node", installHint: "install node" }],
  nodeVersion: "",
  npmVersion: "",
  gitVersion: "",
  pythonVersion: null,
  pipxAvailable: false,
  ghAvailable: false,
  checks: { node: false },
};

const SENTRUX_OK = {
  available: true as const,
  cycles: 0,
  maxCC: 15,
  couplingGrade: "A",
  qualitySignal: 95,
  bottleneck: null,
};

const INTERVIEW_ANSWERS = {
  branchNaming: "",
  commitFormat: "",
  ticketPrefix: "",
  prChecklist: [] as string[],
  testingRequirements: [] as string[],
  architectureRules: [] as string[],
  securityRequirements: [] as string[],
  codeStyle: [] as string[],
  customNotes: "",
  allowCycles: "no",
  maxCC: "25",
};

// ── runDependencyChecks tests ──────────────────────────────────────────────

describe("runDependencyChecks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when all deps present", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_OK);
    mockEnsureGhCli.mockResolvedValue({ available: true, alreadyPresent: true, installed: false, skipped: false });
    const result = await runDependencyChecks({ dryRun: false });
    expect(result).toBe(true);
  });

  it("returns false and does NOT call ensureGhCli when deps missing", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_MISSING);
    const result = await runDependencyChecks({ dryRun: false });
    expect(result).toBe(false);
    expect(mockEnsureGhCli).not.toHaveBeenCalled();
  });

  it("skips ensureGhCli in dry-run mode", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_OK);
    await runDependencyChecks({ dryRun: true });
    expect(mockEnsureGhCli).not.toHaveBeenCalled();
  });

  it("calls ensureGhCli in non-dry-run mode", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_OK);
    mockEnsureGhCli.mockResolvedValue({ available: true, alreadyPresent: true, installed: false, skipped: false });
    await runDependencyChecks({ dryRun: false });
    expect(mockEnsureGhCli).toHaveBeenCalledOnce();
  });

  it("handles gh just-installed path", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_OK);
    mockEnsureGhCli.mockResolvedValue({ available: true, alreadyPresent: false, installed: true, skipped: false });
    const result = await runDependencyChecks({ dryRun: false });
    expect(result).toBe(true);
  });

  it("handles gh not-installed/warn path", async () => {
    mockCheckDependencies.mockResolvedValue(DEP_OK);
    mockEnsureGhCli.mockResolvedValue({
      available: false,
      alreadyPresent: false,
      installed: false,
      skipped: true,
      reason: "install gh manually",
    });
    const result = await runDependencyChecks({ dryRun: false });
    expect(result).toBe(true); // non-fatal: gh warn doesn't block init
  });
});

// ── runAnalysis tests ──────────────────────────────────────────────────────

describe("runAnalysis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls analyzeProject with useLlm=false when dryRun=true", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);
    mockRunInterview.mockResolvedValue(INTERVIEW_ANSWERS);

    await runAnalysis({ cwd: "/tmp/test", dryRun: true, llm: true, auto: false });

    expect(mockAnalyzeProject).toHaveBeenCalledWith("/tmp/test", { useLlm: false });
  });

  it("calls analyzeProject with useLlm=true when not dry-run and llm not false", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false, llm: true, auto: true });

    expect(mockAnalyzeProject).toHaveBeenCalledWith("/tmp/test", { useLlm: true });
  });

  it("returns templateVars, project, stackProfile from analysis", async () => {
    const analysis = makeAnalysis();
    mockAnalyzeProject.mockResolvedValue(analysis);
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.project).toBe(analysis.project);
    expect(result.stackProfile).toBe(analysis.stackProfile);
    expect(result.templateVars).toMatchObject(analysis.templateVars);
  });

  it("sets SENTRUX_MAX_CYCLES=0 when sentrux available with 0 cycles", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, cycles: 0 });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.templateVars.SENTRUX_MAX_CYCLES).toBe("0");
  });

  it("sets SENTRUX_MAX_CYCLES to cycle count in ratchet mode", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, cycles: 5 });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.templateVars.SENTRUX_MAX_CYCLES).toBe("5");
  });

  it("sets SENTRUX_MAX_CYCLES=unknown when sentrux not available", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({
      available: false, cycles: null, maxCC: null, couplingGrade: null, qualitySignal: null, bottleneck: null,
    });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.templateVars.SENTRUX_MAX_CYCLES).toBe("unknown");
  });

  it("sets SENTRUX_MAX_CC from probe when available", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, maxCC: 42 });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.templateVars.SENTRUX_MAX_CC).toBe("42");
  });

  it("sets SENTRUX_MAX_COUPLING from probe when available", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, couplingGrade: "B" });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(result.templateVars.SENTRUX_MAX_COUPLING).toBe("B");
  });

  it("does NOT set SENTRUX_MAX_CC when probe returns null maxCC", async () => {
    const baseVars = { ...DEFAULT_TEMPLATE_VARS };
    // Keep a known value to check it isn't overwritten
    baseVars.SENTRUX_MAX_CC = "original";
    mockAnalyzeProject.mockResolvedValue(makeAnalysis({ templateVars: baseVars }));
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, maxCC: null });

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    // null maxCC → the if-branch doesn't fire, value stays at whatever analysis returned
    expect(result.templateVars.SENTRUX_MAX_CC).toBe("original");
  });

  it("skips interview in dry-run mode", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    await runAnalysis({ cwd: "/tmp/test", dryRun: true, auto: false });

    expect(mockRunInterview).not.toHaveBeenCalled();
  });

  it("skips interview when auto=true", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true });

    expect(mockRunInterview).not.toHaveBeenCalled();
  });

  it("skips interview when noInterview=true", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false, noInterview: true });

    expect(mockRunInterview).not.toHaveBeenCalled();
  });

  it("skips interview when interview=false", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false, interview: false });

    expect(mockRunInterview).not.toHaveBeenCalled();
  });

  it("runs interview when not auto, not noInterview, not dryRun", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);
    mockRunInterview.mockResolvedValue({ ...INTERVIEW_ANSWERS });
    mockApplyInterviewAnswers.mockImplementation((vars) => ({ ...vars, SENTRUX_MAX_CC: "99" }));

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false });

    expect(mockRunInterview).toHaveBeenCalledOnce();
    expect(mockApplyInterviewAnswers).toHaveBeenCalledOnce();
    expect(result.templateVars.SENTRUX_MAX_CC).toBe("99");
  });

  it("handles interview returning a falsy/empty value (does not call applyInterviewAnswers)", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);
    // Return a value that is falsy when evaluated in the `if (interviewAnswers)` check
    // The source checks `if (interviewAnswers)` so returning null-like triggers the else
    mockRunInterview.mockResolvedValue(undefined as never);

    const result = await runAnalysis({ cwd: "/tmp/test", dryRun: false });

    expect(mockApplyInterviewAnswers).not.toHaveBeenCalled();
    expect(result.templateVars).toBeDefined(); // still returns template vars
  });

  it("swallows interview errors and continues", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);
    mockRunInterview.mockRejectedValue(new Error("tty unavailable"));

    // Should NOT throw
    await expect(runAnalysis({ cwd: "/tmp/test", dryRun: false })).resolves.toBeDefined();
    expect(mockApplyInterviewAnswers).not.toHaveBeenCalled();
  });

  it("warns when LLM refinement was requested but skipped", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis({ llmRefined: false, llmReason: "no claude available" }));
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    // Should complete without error
    await expect(
      runAnalysis({ cwd: "/tmp/test", dryRun: false, llm: true, auto: true }),
    ).resolves.toBeDefined();
  });

  it("passes sentrux probe info to runInterview when available", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({ ...SENTRUX_OK, cycles: 2, maxCC: 20 });
    mockRunInterview.mockResolvedValue(INTERVIEW_ANSWERS);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false });

    expect(mockRunInterview).toHaveBeenCalledWith(
      "/tmp/test",
      expect.anything(), // project
      { cycles: 2, maxCC: 20 },
    );
  });

  it("passes undefined sentrux to runInterview when not available", async () => {
    mockAnalyzeProject.mockResolvedValue(makeAnalysis());
    mockProbeSentrux.mockResolvedValue({
      available: false, cycles: null, maxCC: null, couplingGrade: null, qualitySignal: null, bottleneck: null,
    });
    mockRunInterview.mockResolvedValue(INTERVIEW_ANSWERS);

    await runAnalysis({ cwd: "/tmp/test", dryRun: false });

    expect(mockRunInterview).toHaveBeenCalledWith(
      "/tmp/test",
      expect.anything(),
      undefined,
    );
  });

  it("handles confirmed ledger entries in suffix", async () => {
    const ledgerWithConfirmed = {
      values: {
        PROJECT_NAME: { source: "confirmed" as const, value: "my-app", confirmedAt: "2026-01-01" },
      },
      lastUpdated: new Date().toISOString(),
    };
    mockAnalyzeProject.mockResolvedValue(
      makeAnalysis({ ledger: ledgerWithConfirmed }),
    );
    mockProbeSentrux.mockResolvedValue(SENTRUX_OK);

    // Should complete without error even with confirmed entries
    await expect(
      runAnalysis({ cwd: "/tmp/test", dryRun: false, auto: true }),
    ).resolves.toBeDefined();
  });
});
