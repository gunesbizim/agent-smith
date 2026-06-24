import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { appendEvent, readEvents } from "../../engine/event-store.js";
import { projectRunState } from "../../engine/run-state.js";

let root: string;
const RUN = "proj-run";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-runstate-"));
});

afterEach(() => {
  fs.removeSync(root);
});

function seed(): void {
  appendEvent(root, RUN, {
    type: "run_started",
    ticketId: "PROJ-42",
    task: "add CSV export",
    branch: "proj-42",
    approvalGate: "plan",
    phases: ["understand", "red", "plan", "code", "review", "pr"],
    origin: "engine",
    engineVersion: "0.9.1",
  });
  appendEvent(root, RUN, { type: "phase_started", phase: "understand" });
  appendEvent(root, RUN, { type: "phase_finished", phase: "understand", success: true, summary: "scenarios written" });
  appendEvent(root, RUN, { type: "plan_generated", phase: "plan", subtaskCount: 3, artifactPath: "subtasks.json" });
}

describe("projectRunState", () => {
  it("rebuilds run metadata and phase progress from the log", () => {
    seed();
    const s = projectRunState(readEvents(root, RUN));

    expect(s.runId).toBe(RUN);
    expect(s.ticketId).toBe("PROJ-42");
    expect(s.task).toBe("add CSV export");
    expect(s.approvalGate).toBe("plan");
    expect(s.phasesCompleted).toEqual(["understand"]);
    expect(s.totalSubtasks).toBe(3);
    expect(s.status).toBe("running");
    expect(s.lastSeq).toBe(3);
  });

  it("tracks completed vs failed subtasks and accumulates call telemetry", () => {
    seed();
    appendEvent(root, RUN, {
      type: "agent_call_finished",
      callId: "c1",
      phase: "code",
      model: "sonnet",
      status: "ok",
      durationMs: 1200,
      tokens: { input: 100, output: 50, total: 150 },
      costUsd: 0.02,
      attempt: 1,
    });
    appendEvent(root, RUN, { type: "subtask_finished", subtaskKey: "T1", status: "done" });
    appendEvent(root, RUN, { type: "subtask_finished", subtaskKey: "T2", status: "failed" });
    appendEvent(root, RUN, {
      type: "agent_call_finished",
      callId: "c2",
      phase: "code",
      model: "sonnet",
      status: "ok",
      durationMs: 800,
      tokens: { total: 90 },
      costUsd: 0.01,
      attempt: 1,
    });

    const s = projectRunState(readEvents(root, RUN));
    expect([...s.completedSubtasks]).toEqual(["T1"]);
    expect([...s.failedSubtasks]).toEqual(["T2"]);
    expect(s.agentCalls).toBe(2);
    expect(s.totalTokens).toBe(240);
    expect(s.totalCostUsd).toBeCloseTo(0.03, 5);
  });

  it("clears a failed subtask once it later completes (retry)", () => {
    seed();
    appendEvent(root, RUN, { type: "subtask_finished", subtaskKey: "T1", status: "failed" });
    appendEvent(root, RUN, { type: "subtask_finished", subtaskKey: "T1", status: "done" });

    const s = projectRunState(readEvents(root, RUN));
    expect([...s.completedSubtasks]).toEqual(["T1"]);
    expect(s.failedSubtasks.has("T1")).toBe(false);
  });

  it("reflects terminal status from run_finished", () => {
    seed();
    appendEvent(root, RUN, { type: "run_finished", status: "paused", lastPhase: "plan", reason: "approval gate" });

    const s = projectRunState(readEvents(root, RUN));
    expect(s.status).toBe("paused");
    expect(s.currentPhase).toBeNull();
  });

  it("is replay-safe: projecting twice yields identical state", () => {
    seed();
    const a = projectRunState(readEvents(root, RUN));
    const b = projectRunState(readEvents(root, RUN));
    expect({ ...a, completedSubtasks: [...a.completedSubtasks], failedSubtasks: [...a.failedSubtasks] }).toEqual({
      ...b,
      completedSubtasks: [...b.completedSubtasks],
      failedSubtasks: [...b.failedSubtasks],
    });
  });
});
