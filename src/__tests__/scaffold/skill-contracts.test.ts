// A4 — capability contracts: parse the optional frontmatter contract and lint it for
// well-formedness + prompt/constraint consistency. The prompt stays the executable artifact.
import { describe, it, expect } from "vitest";
import { parseContract, validateContract, KNOWN_CONSTRAINTS } from "../../scaffold/skill-contracts.js";

const withContract = (constraints: string, body: string) =>
  `---\nname: test-backend\ncontractVersion: 1\ninputs: [diff]\noutputs: [report]\nconstraints: [${constraints}]\n---\n${body}\n`;

describe("skill contracts (A4)", () => {
  it("returns null when there is no contract (contracts are optional)", () => {
    expect(parseContract("---\nname: x\n---\nbody")).toBeNull();
    expect(validateContract("---\nname: x\n---\nbody")).toEqual([]);
  });

  it("parses inputs/outputs/constraints/contractVersion", () => {
    const c = parseContract(withContract("must_add_tests", "write tests for new logic"));
    expect(c?.contractVersion).toBe(1);
    expect(c?.inputs).toEqual(["diff"]);
    expect(c?.constraints).toEqual(["must_add_tests"]);
  });

  it("LINT FAILS when a declared constraint is never referenced in the body", () => {
    const issues = validateContract(withContract("must_add_tests", "this body never mentions the t-word"));
    expect(issues.some((i) => /must_add_tests/.test(i) && /never references/.test(i))).toBe(true);
  });

  it("passes when the body honors the declared constraint", () => {
    expect(validateContract(withContract("must_add_tests", "You MUST add tests for new logic."))).toEqual([]);
  });

  it("flags an unknown constraint not in the vocabulary", () => {
    expect(validateContract(withContract("teleport_to_mars", "body")).some((i) => /unknown constraint/.test(i))).toBe(true);
  });

  it("flags a malformed contractVersion (< 1)", () => {
    const bad = "---\nname: x\ncontractVersion: 0\nconstraints: []\n---\nbody";
    expect(validateContract(bad).some((i) => /contractVersion/.test(i))).toBe(true);
  });

  it("every known constraint has at least one keyword", () => {
    for (const kws of Object.values(KNOWN_CONSTRAINTS)) expect(kws.length).toBeGreaterThan(0);
  });
});
