import { describe, expect, it } from "vitest";
import path from "node:path";
import { agentSmithDir, artifactPath, artifactsDir, currentPointerPath, eventsPath, makeRunId, runDir, runJsonPath, runsDir } from "../../engine/run-dir.js";

describe("run-dir helpers", () => {
  it("composes run paths under .agent-smith/runs", () => {
    const root = "/proj";
    expect(runsDir(root)).toBe(path.join("/proj", ".agent-smith", "runs"));
    expect(runDir(root, "r1")).toBe(path.join("/proj", ".agent-smith", "runs", "r1"));
    expect(eventsPath(root, "r1")).toBe(path.join(runDir(root, "r1"), "events.jsonl"));
    expect(currentPointerPath(root)).toBe(path.join(runsDir(root), "current"));
    expect(artifactPath(root, "r1", "red-proof.json")).toBe(path.join(runDir(root, "r1"), "red-proof.json"));
  });

  it("builds a deterministic, filesystem-safe run id from seed + time + rand", () => {
    const id = makeRunId("PROJ-1: add export!", new Date("2026-06-24T08:00:00.000Z"), () => "ab12cd");
    expect(id).toBe("proj-1-add-export-20260624T080000Z-ab12cd");
  });

  it("falls back to 'run' when the seed has no usable characters", () => {
    expect(makeRunId("!!!", new Date("2026-06-24T08:00:00.000Z"), () => "zz")).toBe("run-20260624T080000Z-zz");
  });

  // -------------------------------------------------------------------------
  // Lines 24-28: agentSmithDir, runJsonPath, artifactsDir
  // -------------------------------------------------------------------------
  it("agentSmithDir returns <root>/.agent-smith", () => {
    expect(agentSmithDir("/myproject")).toBe(path.join("/myproject", ".agent-smith"));
  });

  it("runJsonPath returns <runDir>/run.json", () => {
    const root = "/proj";
    expect(runJsonPath(root, "r2")).toBe(path.join(runDir(root, "r2"), "run.json"));
  });

  it("artifactsDir returns <runDir>/artifacts", () => {
    const root = "/proj";
    expect(artifactsDir(root, "r3")).toBe(path.join(runDir(root, "r3"), "artifacts"));
  });

  it("makeRunId truncates a long seed to 24 characters in the slug", () => {
    const long = "this-is-a-very-long-ticket-description-that-exceeds-limit";
    const id = makeRunId(long, new Date("2026-06-24T08:00:00.000Z"), () => "xx");
    const slug = id.split("-20260624T")[0];
    expect(slug.length).toBeLessThanOrEqual(24);
  });

  it("makeRunId uses a random suffix when no rand injected (non-empty, alphanumeric)", () => {
    const id = makeRunId("task", new Date("2026-06-24T08:00:00.000Z"));
    // Format: <slug>-<ts>-<6 alphanumeric chars>
    expect(id).toMatch(/^task-20260624T080000Z-[a-z0-9]{6}$/);
  });
});
