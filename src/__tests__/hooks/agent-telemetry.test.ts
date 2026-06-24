import { describe, it, expect } from "vitest";
import { buildCallEvent, slugSession, summarize } from "../../../hooks/post-tool-agent-telemetry.js";

describe("slugSession", () => {
  it("sanitizes, bounds, and defaults", () => {
    expect(slugSession("abc-123")).toBe("abc-123");
    expect(slugSession("a/b c!")).toBe("abc");
    expect(slugSession("")).toBe("unknown");
  });
});

describe("summarize", () => {
  it("collapses whitespace and truncates to 120 chars", () => {
    expect(summarize("  a\n  b ")).toBe("a b");
    expect(summarize("x".repeat(200))).toHaveLength(120);
  });
});

describe("buildCallEvent", () => {
  it("extracts model/tokens/duration from tool_response", () => {
    const payload = {
      tool_use_id: "u1",
      tool_input: { prompt: "do x", subagent_type: "Explore" },
      tool_response: { resolvedModel: "opus", totalTokens: 1234, totalDurationMs: 5000, status: "completed" },
    };
    const e = buildCallEvent(payload, "interactive-s", "2026-06-23T00:00:00Z");
    expect(e.type).toBe("agent_call_finished");
    expect(e.model).toBe("opus");
    expect(e.tokens).toEqual({ total: 1234 });
    expect(e.durationMs).toBe(5000);
    expect(e.status).toBe("ok");
    expect(e.origin).toBe("interactive");
    expect(e.promptSummary).toBe("do x");
    expect(e.callId).toBe("u1");
  });

  it("falls back to usage token breakdown and synthesizes a callId", () => {
    const e = buildCallEvent({ tool_input: { description: "d" }, tool_response: { usage: { input_tokens: 10, output_tokens: 5 } } }, "r", "t");
    expect(e.tokens).toEqual({ input: 10, output: 5, total: 15 });
    expect(e.model).toBe("unknown");
    expect(typeof e.callId).toBe("string");
    expect(e.callId.length).toBeGreaterThan(0);
  });

  it("maps an error response to error status", () => {
    expect(buildCallEvent({ tool_response: { status: "error" } }, "r", "t").status).toBe("error");
  });
});
