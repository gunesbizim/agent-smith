import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { appendEvent } from "../../engine/event-store.js";
import { LocalFsEventSource } from "../../dashboard/event-source.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-eventsrc-"));
});
afterEach(() => fs.removeSync(root));

function seedRun(runId: string, origin: "engine" | "interactive"): void {
  appendEvent(root, runId, {
    type: "run_started",
    ticketId: origin === "engine" ? "PROJ-1" : null,
    task: "t",
    branch: "b",
    approvalGate: "none",
    phases: [],
    origin,
    engineVersion: "x",
  });
  appendEvent(root, runId, {
    type: "agent_call_finished",
    callId: "c1",
    phase: origin === "engine" ? "plan" : "interactive",
    model: "opus",
    status: "ok",
    durationMs: 100,
    tokens: { total: 42 },
    attempt: 1,
  });
}

describe("LocalFsEventSource", () => {
  it("normalizes every run dir into a RunDTO snapshot", async () => {
    seedRun("engine-1", "engine");
    seedRun("interactive-abc", "interactive");

    const snap = await new LocalFsEventSource(root).snapshot();
    expect(snap.runs).toHaveLength(2);
    const ids = snap.runs.map((r) => r.runId).sort();
    expect(ids).toEqual(["engine-1", "interactive-abc"]);
    const engine = snap.runs.find((r) => r.runId === "engine-1")!;
    expect(engine.origin).toBe("engine");
    expect(engine.totals.tokens).toBe(42);
    expect(engine.totals.callCount).toBe(1);
    expect(typeof snap.generatedAt).toBe("string");
  });

  it("honors a run filter", async () => {
    seedRun("engine-1", "engine");
    seedRun("engine-2", "engine");
    const snap = await new LocalFsEventSource(root, "engine-2").snapshot();
    expect(snap.runs.map((r) => r.runId)).toEqual(["engine-2"]);
  });

  it("returns an empty snapshot when there are no runs", async () => {
    const snap = await new LocalFsEventSource(root).snapshot();
    expect(snap.runs).toEqual([]);
  });
});
