import { describe, it, expect } from "vitest";
// Plain ESM hook at repo root; import its pure helpers (main() only runs when invoked directly).
import { decideTddGate, isGatedCommand } from "../../../hooks/pre-tool-tdd-gate.js";

describe("isGatedCommand", () => {
  it("matches the record/publish operations", () => {
    expect(isGatedCommand("git commit -m 'x'")).toBe(true);
    expect(isGatedCommand("git push origin main")).toBe(true);
    expect(isGatedCommand("gh pr create --fill")).toBe(true);
  });
  it("ignores everything else", () => {
    expect(isGatedCommand("git status")).toBe(false);
    expect(isGatedCommand("npm test")).toBe(false);
  });
});

describe("decideTddGate", () => {
  const redProof = { newTests: [{ id: "a", status: "fail" }, { id: "b", status: "fail" }] };

  it("allows when there is no active TDD run (backward compat)", () => {
    expect(decideTddGate({ redProof: null }).decision).toBe("allow");
  });

  it("allows when the red proof has no new tests", () => {
    expect(decideTddGate({ redProof: { newTests: [] } }).decision).toBe("allow");
  });

  it("denies when tests were authored but never verified green", () => {
    const r = decideTddGate({ redProof, greenProof: null, fingerprint: "fp" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toMatch(/never verified green/);
  });

  it("denies when the tree changed since the tests passed", () => {
    const r = decideTddGate({ redProof, greenProof: { fingerprint: "old", passing: ["a", "b"] }, fingerprint: "new" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toMatch(/working tree changed/);
  });

  it("denies when some new test is still red", () => {
    const r = decideTddGate({ redProof, greenProof: { fingerprint: "fp", passing: ["a"] }, fingerprint: "fp" });
    expect(r.decision).toBe("deny");
    expect(r.reason).toMatch(/not green yet: b/);
  });

  it("allows when every new test is green on the current tree", () => {
    const r = decideTddGate({ redProof, greenProof: { fingerprint: "fp", passing: ["a", "b"] }, fingerprint: "fp" });
    expect(r.decision).toBe("allow");
    expect(r.reason).toMatch(/cycle closed/);
  });
});
