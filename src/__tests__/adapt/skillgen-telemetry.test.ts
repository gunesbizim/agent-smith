import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { collectSkillGenUsage, parseTranscriptTools, writeSkillGenRun } from "../../adapt/skillgen-telemetry.js";
import { readEvents } from "../../engine/event-store.js";
import { normalizeRun } from "../../dashboard/normalize.js";

let home: string;
let proj: string;
const SID = "sess-1234abcd";

function jline(model: string, toolNames: string[]): string {
  return JSON.stringify({
    type: "assistant",
    message: { model, content: toolNames.map((n) => ({ type: "tool_use", name: n, input: {} })) },
  });
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "as-home-"));
  proj = fs.mkdtempSync(path.join(os.tmpdir(), "as-proj-"));
  const pdir = path.join(home, ".claude", "projects", "-some-encoded-proj");
  fs.ensureDirSync(path.join(pdir, SID, "subagents"));
  fs.writeFileSync(path.join(pdir, `${SID}.jsonl`), [jline("claude-opus-4-8", ["Read", "Task", "Task"])].join("\n"));
  fs.writeFileSync(
    path.join(pdir, SID, "subagents", "agent-aaa.jsonl"),
    [jline("claude-sonnet-5", ["Read", "Read", "mcp__git-memory__search_git_history", "mcp__gitnexus__impact"])].join("\n"),
  );
});
afterEach(() => {
  fs.removeSync(home);
  fs.removeSync(proj);
});

describe("parseTranscriptTools", () => {
  it("tallies tool_use calls and captures the model", () => {
    const f = path.join(home, ".claude", "projects", "-some-encoded-proj", `${SID}.jsonl`);
    const { model, tools } = parseTranscriptTools(f);
    expect(model).toBe("claude-opus-4-8");
    expect(tools).toEqual({ Read: 1, Task: 2 });
  });
});

describe("collectSkillGenUsage", () => {
  it("aggregates orchestrator + subagent tool usage including MCP tools", () => {
    const usage = collectSkillGenUsage(SID, home)!;
    expect(usage.sessionId).toBe(SID);
    const orchestrator = usage.calls.find((c) => c.label === "orchestrator")!;
    expect(orchestrator.tools).toEqual({ Read: 1, Task: 2 });
    const sub = usage.calls.find((c) => c.label === "agent-aaa")!;
    expect(sub.tools["mcp__git-memory__search_git_history"]).toBe(1);
    expect(sub.tools["mcp__gitnexus__impact"]).toBe(1);
  });

  it("returns null when no transcript exists for the session", () => {
    expect(collectSkillGenUsage("nope", home)).toBeNull();
  });
});

describe("writeSkillGenRun", () => {
  it("writes a dashboard-readable run whose calls carry tool/MCP usage", () => {
    const usage = collectSkillGenUsage(SID, home)!;
    const runId = writeSkillGenRun(proj, usage);
    const dto = normalizeRun(runId, readEvents(proj, runId));

    expect(dto.task).toBe("LLM skill generation");
    expect(dto.status).toBe("done");
    const gen = dto.phases.find((p) => p.name === "generate")!;
    const subCall = gen.calls.find((c) => c.subtaskKey === "agent-aaa")!;
    expect(subCall.tools?.["mcp__git-memory__search_git_history"]).toBe(1);
  });
});
