import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../../pipeline/orchestrator.js";
import type { PipelineContext, PipelineDeps } from "../../pipeline/orchestrator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    ticketId: "PROJ-42",
    ticketTitle: "Test Feature",
    ticketDescription: "A test feature for pipeline testing",
    acceptanceCriteria: ["AC1", "AC2"],
    branch: "feat/PROJ-42-test",
    approvalGate: "none",
    phasesCompleted: [],
    phaseResults: new Map(),
    ...overrides,
  };
}

/** All-green gh checks JSON */
const GREEN_CHECKS_JSON = JSON.stringify([
  { name: "build", bucket: "pass" },
  { name: "unit-tests", bucket: "pass" },
]);

/** One failing check */
const FAILED_CHECKS_JSON = JSON.stringify([
  { name: "build", bucket: "pass" },
  { name: "e2e-tests", bucket: "fail" },
]);

/** All pending */
const PENDING_CHECKS_JSON = JSON.stringify([
  { name: "build", bucket: "pending" },
  { name: "unit-tests", bucket: "pending" },
]);

function makeDeps(
  runImpl: (cmd: string) => string = () => GREEN_CHECKS_JSON,
  sleepImpl: (ms: number) => Promise<void> = () => Promise.resolve(),
  maxCiPolls = 5,
): PipelineDeps {
  return {
    run: vi.fn(runImpl),
    sleep: vi.fn(sleepImpl),
    maxCiPolls,
  };
}

// ---------------------------------------------------------------------------
// Branch phase tests
// ---------------------------------------------------------------------------

describe("branch phase", () => {
  it("on ctx.branch=main: git fetch origin occurs BEFORE git switch -c", async () => {
    const ctx = makeContext({ branch: "main", ticketId: "PROJ-99" });
    const calls: string[] = [];
    const deps: PipelineDeps = {
      run: vi.fn((cmd: string) => {
        calls.push(cmd);
        // gh pr create returns a URL; other commands return empty
        if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/1";
        if (cmd.includes("gh pr checks")) return GREEN_CHECKS_JSON;
        return "";
      }),
      sleep: vi.fn(() => Promise.resolve()),
      maxCiPolls: 2,
    };

    await runPipeline(ctx, deps);

    const fetchIdx = calls.findIndex((c) => c.includes("git fetch origin"));
    const switchIdx = calls.findIndex((c) => c.includes("git switch -c"));

    expect(fetchIdx).toBeGreaterThanOrEqual(0);
    expect(switchIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeLessThan(switchIdx);
  });
});

// ---------------------------------------------------------------------------
// PR phase tests
// ---------------------------------------------------------------------------

describe("pr phase", () => {
  it("run is called with a string containing 'gh pr create'", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    const calls: string[] = [];
    const deps: PipelineDeps = {
      run: vi.fn((cmd: string) => {
        calls.push(cmd);
        if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/2";
        if (cmd.includes("gh pr checks")) return GREEN_CHECKS_JSON;
        return "";
      }),
      sleep: vi.fn(() => Promise.resolve()),
      maxCiPolls: 2,
    };

    await runPipeline(ctx, deps);

    const prCall = calls.find((c) => c.includes("gh pr create"));
    expect(prCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CI phase tests
// ---------------------------------------------------------------------------

describe("ci phase — all-green mock", () => {
  it("returns success:true and summary mentions green", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    const deps = makeDeps((cmd) => {
      if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/3";
      if (cmd.includes("gh pr checks")) return GREEN_CHECKS_JSON;
      return "";
    });

    const result = await runPipeline(ctx, deps);

    const ciResult = result.phaseResults.get("ci");
    expect(ciResult).toBeDefined();
    expect(ciResult!.success).toBe(true);
    expect(ciResult!.summary.toLowerCase()).toMatch(/green/);
  });
});

describe("ci phase — failing check", () => {
  it("returns success:false AND errors includes the failed check name", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    const deps = makeDeps((cmd) => {
      if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/4";
      if (cmd.includes("gh pr checks")) return FAILED_CHECKS_JSON;
      return "";
    });

    const result = await runPipeline(ctx, deps);

    const ciResult = result.phaseResults.get("ci");
    expect(ciResult).toBeDefined();
    expect(ciResult!.success).toBe(false);
    expect(ciResult!.errors).toContain("e2e-tests");
  });
});

describe("ci phase — poll re-try loop", () => {
  it("pending then green: eventual success=true and run called ≥2 times for pr checks", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    let checkCallCount = 0;
    const deps: PipelineDeps = {
      run: vi.fn((cmd: string) => {
        if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/5";
        if (cmd.includes("gh pr checks")) {
          checkCallCount++;
          if (checkCallCount === 1) return PENDING_CHECKS_JSON;
          return GREEN_CHECKS_JSON;
        }
        return "";
      }),
      sleep: vi.fn(() => Promise.resolve()),
      maxCiPolls: 5,
    };

    const result = await runPipeline(ctx, deps);

    const ciResult = result.phaseResults.get("ci");
    expect(ciResult).toBeDefined();
    expect(ciResult!.success).toBe(true);
    expect(checkCallCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline integration test
// ---------------------------------------------------------------------------

describe("full runPipeline with all-green mock", () => {
  it("phasesCompleted includes 'branch', 'pr', 'ci' in order", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    const deps = makeDeps((cmd) => {
      if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/6";
      if (cmd.includes("gh pr checks")) return GREEN_CHECKS_JSON;
      return "";
    });

    const result = await runPipeline(ctx, deps);

    expect(result.phasesCompleted).toContain("branch");
    expect(result.phasesCompleted).toContain("pr");
    expect(result.phasesCompleted).toContain("ci");

    const branchIdx = result.phasesCompleted.indexOf("branch");
    const prIdx = result.phasesCompleted.indexOf("pr");
    const ciIdx = result.phasesCompleted.indexOf("ci");

    expect(branchIdx).toBeLessThan(prIdx);
    expect(prIdx).toBeLessThan(ciIdx);
  });

  it("all 8 phases complete when everything is green", async () => {
    const ctx = makeContext({ branch: "feat/PROJ-42-test" });
    const deps = makeDeps((cmd) => {
      if (cmd.includes("gh pr create")) return "https://github.com/owner/repo/pull/7";
      if (cmd.includes("gh pr checks")) return GREEN_CHECKS_JSON;
      return "";
    });

    const result = await runPipeline(ctx, deps);

    expect(result.phasesCompleted).toHaveLength(8);
    expect(result.phasesCompleted).toEqual([
      "branch",
      "plan",
      "implement",
      "test",
      "review",
      "docs",
      "pr",
      "ci",
    ]);
  });
});
