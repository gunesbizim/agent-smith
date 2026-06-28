import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../../engine/events.js";
import { normalizeRun } from "../../dashboard/normalize.js";
import type { ToolCallEvent } from "../../engine/events.js";

let seq = 0;
function ev(runId: string, body: Partial<EngineEvent> & { type: EngineEvent["type"]; ts?: string }): EngineEvent {
  return { v: 1, seq: seq++, id: `e${seq}`, ts: body.ts ?? "2026-06-24T00:00:00Z", runId, ...body } as EngineEvent;
}

describe("normalizeRun", () => {
  it("builds a run → phases → calls tree for an engine run", () => {
    const r = "demo";
    const events: EngineEvent[] = [
      ev(r, { type: "run_started", ticketId: "PROJ-1", task: "x", branch: "b", approvalGate: "none", phases: [], origin: "engine", engineVersion: "t", ts: "2026-06-24T00:00:00Z" }),
      ev(r, { type: "phase_started", phase: "plan" }),
      ev(r, { type: "agent_call_started", callId: "c1", phase: "plan", model: "opus", attempt: 1, promptSummary: "plan it" }),
      ev(r, { type: "agent_call_finished", callId: "c1", phase: "plan", model: "opus", status: "ok", durationMs: 1200, tokens: { total: 300 }, costUsd: 0.05, attempt: 1 }),
      ev(r, { type: "phase_started", phase: "code" }),
      ev(r, { type: "agent_call_finished", callId: "c2", phase: "code", model: "sonnet", status: "ok", durationMs: 800, tokens: { total: 200 }, attempt: 1 }),
      ev(r, { type: "run_finished", status: "completed", ts: "2026-06-24T00:05:00Z" }),
    ];
    const dto = normalizeRun(r, events);

    expect(dto.origin).toBe("engine");
    expect(dto.ticketId).toBe("PROJ-1");
    expect(dto.status).toBe("done");
    expect(dto.phases.map((p) => p.name)).toEqual(["plan", "code"]);
    expect(dto.totals).toMatchObject({ tokens: 500, callCount: 2 });
    expect(dto.totals.costUsd).toBeCloseTo(0.05, 5);
    expect(dto.totals.wallClockMs).toBe(5 * 60_000);

    const plan = dto.phases.find((p) => p.name === "plan")!;
    expect(plan.status).toBe("done");
    expect(plan.calls[0]).toMatchObject({ model: "opus", status: "done", tokens: 300 });
  });

  it("carries per-call tool usage (incl. MCP) onto the DTO", () => {
    const r = "tooled";
    const events: EngineEvent[] = [
      ev(r, { type: "phase_started", phase: "generate" }),
      ev(r, { type: "agent_call_finished", callId: "c1", phase: "generate", model: "sonnet", status: "ok", durationMs: 5, attempt: 1, tools: { Read: 9, "mcp__serena__find_symbol": 3 } }),
    ];
    const dto = normalizeRun(r, events);
    expect(dto.phases[0].calls[0].tools).toEqual({ Read: 9, "mcp__serena__find_symbol": 3 });
  });

  it("marks a run failed when a call failed and no run_finished", () => {
    const r = "f";
    const events: EngineEvent[] = [
      ev(r, { type: "phase_started", phase: "code" }),
      ev(r, { type: "agent_call_finished", callId: "c1", phase: "code", model: "sonnet", status: "error", durationMs: 10, attempt: 1 }),
    ];
    const dto = normalizeRun(r, events);
    expect(dto.status).toBe("failed");
    expect(dto.phases[0].calls[0].status).toBe("failed");
  });

  it("handles interactive runs (finished-only calls, synthesized phase)", () => {
    const r = "interactive-abc";
    const events: EngineEvent[] = [
      ev(r, { type: "run_started", ticketId: null, task: "interactive session", branch: "", approvalGate: "none", phases: ["interactive"], origin: "interactive", engineVersion: "hook" }),
      ev(r, { type: "agent_call_finished", callId: "u1", phase: "interactive", model: "opus", status: "ok", durationMs: 5000, tokens: { total: 1000 }, attempt: 1, origin: "interactive", promptSummary: "explore" }),
    ];
    const dto = normalizeRun(r, events);
    expect(dto.origin).toBe("interactive");
    expect(dto.phases.map((p) => p.name)).toEqual(["interactive"]);
    expect(dto.phases[0].calls[0]).toMatchObject({ status: "done", tokens: 1000, origin: "interactive" });
  });

  it("aggregates tool_call events into toolCalls totals and MCP breakdown", () => {
    const r = "interactive-tool";
    const toolEvents: EngineEvent[] = [
      ev(r, {
        type: "run_started",
        ticketId: null,
        task: "interactive session",
        branch: "",
        approvalGate: "none",
        phases: ["interactive"],
        origin: "interactive",
        engineVersion: "hook",
      } as Omit<EngineEvent, "v" | "seq" | "id" | "ts" | "runId">),
      ev(r, { type: "tool_call", tool: "Bash", isMcp: false, mcpServer: null, status: "ok", durationMs: 10 } as unknown as EngineEvent),
      ev(r, { type: "tool_call", tool: "Read", isMcp: false, mcpServer: null, status: "ok", durationMs: 5 } as unknown as EngineEvent),
      ev(r, { type: "tool_call", tool: "mcp__serena__find_symbol", isMcp: true, mcpServer: "serena", status: "ok", durationMs: 20 } as unknown as EngineEvent),
      ev(r, { type: "tool_call", tool: "mcp__serena__get_symbols_overview", isMcp: true, mcpServer: "serena", status: "ok", durationMs: 15 } as unknown as EngineEvent),
      ev(r, { type: "tool_call", tool: "mcp__sentrux__check", isMcp: true, mcpServer: "sentrux", status: "error", durationMs: 8 } as unknown as EngineEvent),
      ev(r, {
        type: "agent_call_finished",
        callId: "u1",
        phase: "interactive",
        model: "sonnet",
        status: "ok",
        durationMs: 5000,
        tokens: { total: 500 },
        attempt: 1,
        origin: "interactive",
      }),
    ];
    const dto = normalizeRun(r, toolEvents);

    // Total tool calls = 5 (excluding the agent_call_finished)
    expect(dto.toolCalls.total).toBe(5);
    // MCP calls = 3
    expect(dto.toolCalls.mcpCount).toBe(3);
    // Per-tool breakdown
    expect(dto.toolCalls.byTool["Bash"]).toBe(1);
    expect(dto.toolCalls.byTool["Read"]).toBe(1);
    expect(dto.toolCalls.byTool["mcp__serena__find_symbol"]).toBe(1);
    // Per-server breakdown
    expect(dto.toolCalls.byServer["serena"]).toBe(2);
    expect(dto.toolCalls.byServer["sentrux"]).toBe(1);
    // Existing agent call aggregation still works
    expect(dto.totals.callCount).toBe(1);
  });

  it("has zero toolCalls when no tool_call events present", () => {
    const r = "demo-no-tools";
    const events: EngineEvent[] = [
      ev(r, { type: "phase_started", phase: "plan" }),
      ev(r, {
        type: "agent_call_finished",
        callId: "c1",
        phase: "plan",
        model: "opus",
        status: "ok",
        durationMs: 1200,
        tokens: { total: 300 },
        attempt: 1,
      }),
    ];
    const dto = normalizeRun(r, events);
    expect(dto.toolCalls.total).toBe(0);
    expect(dto.toolCalls.mcpCount).toBe(0);
    expect(dto.toolCalls.byTool).toEqual({});
    expect(dto.toolCalls.byServer).toEqual({});
  });
});
