import { describe, it, expect } from "vitest";
import { runPipeline } from "../../pipeline/orchestrator.js";
import type { PipelineContext } from "../../shared/types.js";

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

describe("Pipeline Orchestrator", () => {
  it("runs to completion with no approval gates", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);

    expect(result.phasesCompleted).toHaveLength(6);
    expect(result.phasesCompleted).toEqual(["plan", "implement", "test", "review", "docs", "pr"]);
  });

  it("marks all phases as successful", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);

    for (const phase of result.phasesCompleted) {
      const phaseResult = result.phaseResults.get(phase);
      expect(phaseResult).toBeDefined();
      expect(phaseResult!.success).toBe(true);
    }
  });

  it("phase results have correct shape", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);

    for (const [phase, pr] of result.phaseResults) {
      expect(pr.phase).toBe(phase);
      expect(Array.isArray(pr.filesChanged)).toBe(true);
      expect(Array.isArray(pr.errors)).toBe(true);
      expect(Array.isArray(pr.warnings)).toBe(true);
      expect(typeof pr.summary).toBe("string");
      expect(pr.summary.length).toBeGreaterThan(0);
    }
  });

  it("resumes from a specific phase", async () => {
    const ctx = makeContext({
      approvalGate: "none",
      phasesCompleted: ["plan", "implement"],
    });
    // Mock phase results for already-completed phases
    ctx.phaseResults.set("plan", { phase: "plan", success: true, summary: "done", filesChanged: [], errors: [], warnings: [] });
    ctx.phaseResults.set("implement", { phase: "implement", success: true, summary: "done", filesChanged: [], errors: [], warnings: [] });

    const result = await runPipeline(ctx);
    expect(result.phasesCompleted).toEqual(["plan", "implement", "test", "review", "docs", "pr"]);
  });

  it("pipeline context is preserved across phases", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);

    expect(result.ticketId).toBe("PROJ-42");
    expect(result.branch).toBe("feat/PROJ-42-test");
    expect(result.acceptanceCriteria).toEqual(["AC1", "AC2"]);
  });

  it("returns context unchanged besides phasesCompleted and phaseResults", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);

    // Non-phase fields should be preserved
    expect(result.ticketId).toBe(ctx.ticketId);
    expect(result.ticketTitle).toBe(ctx.ticketTitle);
    expect(result.branch).toBe(ctx.branch);
    expect(result.approvalGate).toBe(ctx.approvalGate);
  });

  it("handles empty ticket id", async () => {
    const ctx = makeContext({ ticketId: null, approvalGate: "none" });
    const result = await runPipeline(ctx);
    expect(result.phasesCompleted).toHaveLength(6);
  });

  it("plan phase summary references ticket when available", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);
    const planResult = result.phaseResults.get("plan")!;
    expect(planResult.summary).toContain("PROJ-42");
  });

  it("PR phase summary mentions PR creation", async () => {
    const ctx = makeContext({ approvalGate: "none" });
    const result = await runPipeline(ctx);
    const prResult = result.phaseResults.get("pr")!;
    expect(prResult.summary.toLowerCase()).toContain("pr");
  });
});
