// A6 — AST-aware patching belongs to the serena/GitNexus layer, NOT the agent-smith scaffolder
// (which barely edits user code). The only A6 work in THIS repo is a checked invariant: the
// generator must instruct generated skills to prefer serena's symbolic-edit tools over blunt
// full-file rewrites for code changes. This test makes that invariant fail loudly if it regresses.
import { describe, it, expect } from "vitest";
import { loadSkillGeneratorPrompt } from "../../adapt/llm-skills.js";

describe("serena symbolic-edit invariant (A6)", () => {
  const prompt = loadSkillGeneratorPrompt();

  it("the generator mandates serena symbolic-edit tools", () => {
    expect(prompt).toContain("replace_symbol_body");
    expect(prompt).toContain("insert_after_symbol");
    expect(prompt).toMatch(/symbolic edit/i);
  });

  it("the generator prefers symbolic edits over blind full-file rewrites for code", () => {
    expect(prompt).toMatch(/PREFER symbolic edits/);
    expect(prompt).toMatch(/full-file rewrites|entire source file/i);
  });

  it("does not advertise phantom serena tools", () => {
    expect(prompt).toContain("There is NO find_implementations");
  });
});
