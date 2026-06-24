import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { runEngine, type TddEngineDeps, type TddEngineInput } from "../../engine/tdd-engine.js";
import type { AgentCallFn } from "../../engine/agent-call.js";
import { readEvents } from "../../engine/event-store.js";
import { artifactPath, currentPointerPath } from "../../engine/run-dir.js";
import { extractJson } from "../../engine/parse.js";

let root: string;
const IDS = ["tests/test_x.py::t_unit_1", "tests/test_x.py::t_feat_1"];

const BASE_INPUT: TddEngineInput = {
  ticketId: "PROJ-42",
  task: "add CSV export",
  branch: "proj-42",
  approvalGate: "none",
  testCommand: "pytest -q",
  testHint: "pytest",
  engineVersion: "test",
};

// A scripted model: returns the JSON each phase expects, and flips `implemented` during CODE so the
// scripted test runner goes red→green like a real TDD cycle.
function makeHarness() {
  const state = { implemented: false, codeCalls: 0 };
  const callAgent: AgentCallFn = async (p) => {
    let text = "{}";
    if (p.phase === "understand") {
      text = JSON.stringify({ scenarios: "## Manual + automation scenarios", testPlan: { unit: [{ id: IDS[0] }], feature: [{ id: IDS[1] }] } });
    } else if (p.phase === "red") {
      text = JSON.stringify({ filesWritten: ["tests/test_x.py"] });
    } else if (p.phase === "plan") {
      text = JSON.stringify({ subtasks: [{ key: "T1", summary: "implement export", targetTests: IDS }] });
    } else if (p.phase === "code") {
      state.codeCalls += 1;
      state.implemented = true;
      text = JSON.stringify({ filesChanged: ["export.py"] });
    } else if (p.phase === "review") {
      text = JSON.stringify({ verdict: "approve", findings: [] });
    }
    return { callId: `c${p.phase}`, text, status: "ok", durationMs: 1 };
  };
  const runTests = () => {
    const stdout = IDS.map((id) => `${id} ${state.implemented ? "PASSED" : "FAILED"} [100%]`).join("\n");
    return { exitCode: state.implemented ? 0 : 1, stdout, durationMs: 1 };
  };
  const deps: TddEngineDeps = { root: "", callAgent, runTests, runGate: () => ({ degraded: false, output: "ok" }) };
  return { deps, state };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-engine-"));
});
afterEach(() => fs.removeSync(root));

describe("runEngine (TDD conductor)", () => {
  it("runs UNDERSTAND→RED→PLAN→CODE→REVIEW→PR to completion and writes artifacts", async () => {
    const { deps } = makeHarness();
    const res = await runEngine(BASE_INPUT, { ...deps, root });

    expect(res.state.status).toBe("completed");
    expect(res.state.phasesCompleted).toEqual(["understand", "red", "plan", "code", "review", "pr"]);

    // Artifacts exist
    for (const f of ["scenarios.md", "test-plan.json", "red-proof.json", "subtasks.json", "todo.md"]) {
      expect(fs.existsSync(artifactPath(root, res.runId, f)), f).toBe(true);
    }
    const proof = extractJson<{ valid: boolean }>(fs.readFileSync(artifactPath(root, res.runId, "red-proof.json"), "utf-8"));
    expect(proof?.valid).toBe(true);

    // Event log records the lifecycle
    const types = readEvents(root, res.runId).map((e) => e.type);
    expect(types).toContain("run_started");
    expect(types).toContain("plan_generated");
    expect(types).toContain("subtask_finished");
    expect(types.at(-1)).toBe("run_finished");
  });

  it("fails at RED when new tests do not actually fail (false-negative guard)", async () => {
    const { deps, state } = makeHarness();
    state.implemented = true; // tests pass immediately → RED proof invalid
    const res = await runEngine(BASE_INPUT, { ...deps, root });
    expect(res.state.status).toBe("failed");
    expect(res.state.phasesCompleted).toEqual(["understand"]);
  });

  it("pauses before CODE under the 'plan' approval gate", async () => {
    const { deps } = makeHarness();
    const res = await runEngine({ ...BASE_INPUT, approvalGate: "plan" }, { ...deps, root, confirm: async () => false });
    expect(res.state.status).toBe("paused");
    expect(res.state.phasesCompleted).toEqual(["understand", "red", "plan"]);
  });

  it("resumes a paused run from where it stopped", async () => {
    const { deps } = makeHarness();
    const paused = await runEngine({ ...BASE_INPUT, approvalGate: "plan" }, { ...deps, root, confirm: async () => false });
    expect(paused.state.status).toBe("paused");

    // Resume the same run, now approving.
    const { deps: deps2 } = makeHarness();
    const done = await runEngine({ ...BASE_INPUT, approvalGate: "plan" }, { ...deps2, root, runId: paused.runId, confirm: async () => true });
    expect(done.runId).toBe(paused.runId);
    expect(done.state.status).toBe("completed");
    // run_started emitted exactly once across both passes
    expect(readEvents(root, done.runId).filter((e) => e.type === "run_started")).toHaveLength(1);
  });

  it("blocks at REVIEW when the architecture gate reports degradation", async () => {
    const { deps } = makeHarness();
    const res = await runEngine(BASE_INPUT, { ...deps, root, runGate: () => ({ degraded: true, output: "regressed" }) });
    expect(res.state.status).toBe("failed");
    expect(res.state.phasesCompleted).toEqual(["understand", "red", "plan", "code"]);
  });

  it("skips the RED gate when no test command is configured (fail-open)", async () => {
    const { deps } = makeHarness();
    const res = await runEngine({ ...BASE_INPUT, testCommand: "none" }, { ...deps, root });
    expect(res.state.status).toBe("completed");
  });

  it("clears the `current` pointer after a completed run, keeps it while paused", async () => {
    const { deps } = makeHarness();
    const done = await runEngine(BASE_INPUT, { ...deps, root });
    expect(done.state.status).toBe("completed");
    expect(fs.existsSync(currentPointerPath(root))).toBe(false);

    const { deps: deps2 } = makeHarness();
    const paused = await runEngine({ ...BASE_INPUT, approvalGate: "plan" }, { ...deps2, root, confirm: async () => false });
    expect(paused.state.status).toBe("paused");
    expect(fs.existsSync(currentPointerPath(root))).toBe(true);
  });

  it("fails CODE when the suite exits 0 but the new tests are not actually passing", async () => {
    // Final suite exits 0, but the new test ids never appear in the output (skipped/renamed) → CODE
    // must reject it rather than stamping a green-proof on unverified tests.
    const state = { implemented: false };
    const callAgent: import("../../engine/agent-call.js").AgentCallFn = async (p) => {
      let text = "{}";
      if (p.phase === "understand") text = JSON.stringify({ scenarios: "s", testPlan: { unit: [{ id: IDS[0] }], feature: [{ id: IDS[1] }] } });
      else if (p.phase === "plan") text = JSON.stringify({ subtasks: [{ key: "T1", summary: "impl", targetTests: IDS }] });
      else if (p.phase === "code") { state.implemented = true; text = JSON.stringify({ filesChanged: ["x.py"] }); }
      return { callId: p.phase, text, status: "ok", durationMs: 1 };
    };
    const runTests = () =>
      state.implemented
        ? { exitCode: 0, stdout: "everything passed", durationMs: 1 } // exit 0 but no per-test ids
        : { exitCode: 1, stdout: IDS.map((id) => `${id} FAILED [100%]`).join("\n"), durationMs: 1 };

    const res = await runEngine({ ...BASE_INPUT, maxFixAttempts: 1 }, { root, callAgent, runTests, runGate: () => ({ degraded: false, output: "ok" }) });
    expect(res.state.status).toBe("failed");
    expect(res.state.phasesCompleted).toEqual(["understand", "red", "plan"]);
    expect(fs.existsSync(artifactPath(root, res.runId, "green-proof.json"))).toBe(false);
  });
});
