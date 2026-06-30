import { describe, it, expect } from "vitest";
import { buildCallEvent, slugSession, summarize, parseMcpServer, buildToolCallEvent } from "../../../hooks/post-tool-agent-telemetry.js";

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

describe("parseMcpServer", () => {
  it("extracts server name from mcp__<server>__<tool> names", () => {
    expect(parseMcpServer("mcp__gitnexus__impact")).toBe("gitnexus");
    expect(parseMcpServer("mcp__sentrux__check")).toBe("sentrux");
    expect(parseMcpServer("mcp__plugin_mempalace_mempalace__mempalace_search")).toBe("plugin_mempalace_mempalace");
  });

  it("returns null for non-MCP tool names", () => {
    expect(parseMcpServer("Bash")).toBeNull();
    expect(parseMcpServer("Read")).toBeNull();
    expect(parseMcpServer("Agent")).toBeNull();
    expect(parseMcpServer("")).toBeNull();
  });
});

describe("buildToolCallEvent", () => {
  it("builds a tool_call event for a plain Bash call", () => {
    const payload = {
      tool_use_id: "t1",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_response: { status: "ok" },
    };
    const e = buildToolCallEvent(payload, "interactive-s", "2026-06-28T00:00:00Z");
    expect(e.type).toBe("tool_call");
    expect(e.tool).toBe("Bash");
    expect(e.isMcp).toBe(false);
    expect(e.mcpServer).toBeNull();
    expect(e.status).toBe("ok");
  });

  it("builds a tool_call event for an MCP call and sets isMcp + mcpServer", () => {
    const payload = {
      tool_use_id: "t2",
      tool_name: "mcp__sentrux__check",
      tool_input: {},
      tool_response: { status: "completed" },
    };
    const e = buildToolCallEvent(payload, "interactive-s", "2026-06-28T00:00:00Z");
    expect(e.type).toBe("tool_call");
    expect(e.tool).toBe("mcp__sentrux__check");
    expect(e.isMcp).toBe(true);
    expect(e.mcpServer).toBe("sentrux");
    expect(e.status).toBe("ok");
  });

  it("maps error status from tool_response", () => {
    const payload = {
      tool_use_id: "t3",
      tool_name: "Read",
      tool_input: {},
      tool_response: { status: "error" },
    };
    const e = buildToolCallEvent(payload, "r", "t");
    expect(e.status).toBe("error");
  });

  it("carries durationMs from tool_response when present", () => {
    const payload = {
      tool_use_id: "t4",
      tool_name: "Bash",
      tool_input: {},
      tool_response: { status: "ok", totalDurationMs: 123 },
    };
    const e = buildToolCallEvent(payload, "r", "2026-06-28T00:00:00Z");
    expect(e.durationMs).toBe(123);
  });
});
