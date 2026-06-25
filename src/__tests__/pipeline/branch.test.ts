import { describe, it, expect } from "vitest";
import { decideBranch } from "../../pipeline/branch.js";
import type { DecideBranchInput, BranchDecision } from "../../pipeline/branch.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<DecideBranchInput> = {}): DecideBranchInput {
  return {
    currentBranch: "main",
    ...overrides,
  };
}

function assertCreateInvariant(decision: BranchDecision): void {
  expect(decision.steps[0]).toBe("git fetch origin");
  const hasSwitchStep = decision.steps.some((s) =>
    /^git switch -c .+ origin\//.test(s),
  );
  expect(hasSwitchStep).toBe(true);
}

// ---------------------------------------------------------------------------
// test suite
// ---------------------------------------------------------------------------

describe("decideBranch", () => {
  // -------------------------------------------------------------------------
  // on default branch → create
  // -------------------------------------------------------------------------

  it("on 'main' + proposedName 'feat/x' → action create, baseRef 'origin/main', correct steps", () => {
    const decision = decideBranch(
      makeInput({ currentBranch: "main", proposedName: "feat/x" }),
    );

    expect(decision.action).toBe("create");
    expect(decision.baseRef).toBe("origin/main");
    expect(decision.steps[0]).toBe("git fetch origin");
    expect(decision.steps).toContain("git switch -c feat/x origin/main");
  });

  it("on 'master' with defaultBranches ['main','master'] → action create", () => {
    const decision = decideBranch(
      makeInput({
        currentBranch: "master",
        defaultBranches: ["main", "master"],
        proposedName: "feat/something",
      }),
    );

    expect(decision.action).toBe("create");
  });

  it("on 'main' + no proposedName → action create, branchName '', reason mentions name required, no throw", () => {
    let decision: BranchDecision | undefined;
    expect(() => {
      decision = decideBranch(makeInput({ currentBranch: "main" }));
    }).not.toThrow();

    expect(decision!.action).toBe("create");
    expect(decision!.branchName).toBe("");
    expect(decision!.reason.toLowerCase()).toMatch(/name|required/);
  });

  it("defaultBase 'develop' on 'main' → baseRef 'origin/develop'", () => {
    const decision = decideBranch(
      makeInput({
        currentBranch: "main",
        defaultBase: "develop",
        proposedName: "feat/y",
      }),
    );

    expect(decision.action).toBe("create");
    expect(decision.baseRef).toBe("origin/develop");
    expect(decision.steps).toContain("git switch -c feat/y origin/develop");
  });

  // -------------------------------------------------------------------------
  // on feature branch → reuse
  // -------------------------------------------------------------------------

  it("on 'feat/ABC-1-foo' + continueHint 'ABC-1' → action reuse, branchName unchanged, baseRef ''", () => {
    const decision = decideBranch(
      makeInput({ currentBranch: "feat/ABC-1-foo", continueHint: "ABC-1" }),
    );

    expect(decision.action).toBe("reuse");
    expect(decision.branchName).toBe("feat/ABC-1-foo");
    expect(decision.baseRef).toBe("");
    expect(decision.steps).toEqual(["git fetch origin"]);
  });

  it("on 'feat/ABC-1-foo' + no hint → action reuse (feature branch = continuing)", () => {
    const decision = decideBranch(
      makeInput({ currentBranch: "feat/ABC-1-foo" }),
    );

    expect(decision.action).toBe("reuse");
    expect(decision.branchName).toBe("feat/ABC-1-foo");
    expect(decision.baseRef).toBe("");
  });

  // -------------------------------------------------------------------------
  // on feature branch + mismatched hint → create
  // -------------------------------------------------------------------------

  it("on 'feat/ABC-1-foo' + continueHint 'XYZ-9' + proposedName 'feat/XYZ-9' → action create, forks from origin/main", () => {
    const decision = decideBranch(
      makeInput({
        currentBranch: "feat/ABC-1-foo",
        continueHint: "XYZ-9",
        proposedName: "feat/XYZ-9",
      }),
    );

    expect(decision.action).toBe("create");
    expect(decision.branchName).toBe("feat/XYZ-9");
    expect(decision.baseRef).toBe("origin/main");
    assertCreateInvariant(decision);
  });

  it("on feature branch + mismatched hint without proposedName → derives branchName from hint", () => {
    const decision = decideBranch(
      makeInput({
        currentBranch: "feat/ABC-1-foo",
        continueHint: "XYZ-9",
      }),
    );

    expect(decision.action).toBe("create");
    // derived from hint: non-alnum runs replaced by "-"
    expect(decision.branchName).toMatch(/XYZ.9/i);
    assertCreateInvariant(decision);
  });

  // -------------------------------------------------------------------------
  // fetch-before-create invariant (loop over multiple create cases)
  // -------------------------------------------------------------------------

  it("fetch-before-create invariant holds across multiple create scenarios", () => {
    const createCases: DecideBranchInput[] = [
      { currentBranch: "main", proposedName: "feat/a" },
      { currentBranch: "master", defaultBranches: ["main", "master"], proposedName: "feat/b" },
      {
        currentBranch: "feat/ABC-1-foo",
        continueHint: "XYZ-9",
        proposedName: "feat/XYZ-9",
      },
      {
        currentBranch: "main",
        defaultBase: "develop",
        proposedName: "feat/c",
      },
    ];

    for (const input of createCases) {
      const decision = decideBranch(input);
      expect(decision.action).toBe("create");
      assertCreateInvariant(decision);
    }
  });

  // -------------------------------------------------------------------------
  // reason & steps are non-empty strings / arrays
  // -------------------------------------------------------------------------

  it("always returns a non-empty reason string", () => {
    const cases: DecideBranchInput[] = [
      { currentBranch: "main", proposedName: "feat/x" },
      { currentBranch: "feat/ABC-1-foo", continueHint: "ABC-1" },
      { currentBranch: "feat/ABC-1-foo", continueHint: "XYZ-9", proposedName: "feat/XYZ-9" },
    ];

    for (const input of cases) {
      const decision = decideBranch(input);
      expect(typeof decision.reason).toBe("string");
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });

  it("always returns a non-empty steps array", () => {
    const decision = decideBranch(makeInput({ currentBranch: "feat/ABC-1-foo" }));
    expect(Array.isArray(decision.steps)).toBe(true);
    expect(decision.steps.length).toBeGreaterThan(0);
  });
});
