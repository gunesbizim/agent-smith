import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { makeAgentCaller } from "../../engine/agent-call.js";
import { readEvents } from "../../engine/event-store.js";
import type { ClaudeRunResult } from "../../analyze/claude-runner.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-agentcall-"));
});
afterEach(() => fs.removeSync(root));

describe("makeAgentCaller", () => {
  it("emits a started+finished event pair, threads the model, and returns usage", async () => {
    let seenPrompt = "";
    let seenOpts: Record<string, unknown> = {};
    const runner = (prompt: string, opts: Record<string, unknown>): ClaudeRunResult => {
      seenPrompt = prompt;
      seenOpts = opts;
      return { text: "done", status: "ok", durationMs: 7, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.01 } };
    };
    const call = makeAgentCaller(root, "r1", runner as never);

    const out = await call({ phase: "plan", model: "opus", prompt: "build the plan", subtaskKey: "T1" });

    expect(out.status).toBe("ok");
    expect(out.text).toBe("done");
    expect(out.tokens).toEqual({ input: 10, output: 5, total: 15 });
    expect(out.costUsd).toBe(0.01);
    expect(seenPrompt).toBe("build the plan");
    expect(seenOpts.model).toBe("opus");
    expect(seenOpts.outputFormat).toBe("json");

    const events = readEvents(root, "r1");
    expect(events.map((e) => e.type)).toEqual(["agent_call_started", "agent_call_finished"]);
    const finished = events[1] as { model: string; subtaskKey?: string; origin?: string; tokens?: { total?: number } };
    expect(finished.model).toBe("opus");
    expect(finished.subtaskKey).toBe("T1");
    expect(finished.origin).toBe("engine");
    expect(finished.tokens?.total).toBe(15);
  });

  it("records error status and omits tokens when the runner fails", async () => {
    const runner = (): ClaudeRunResult => ({ text: null, status: "error", durationMs: 3 });
    const call = makeAgentCaller(root, "r2", runner as never);
    const out = await call({ phase: "code", model: "sonnet", prompt: "x" });
    expect(out.status).toBe("error");
    expect(out.tokens).toBeUndefined();
    const finished = readEvents(root, "r2")[1] as { tokens?: unknown };
    expect(finished.tokens).toBeUndefined();
  });
});
