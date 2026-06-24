import { describe, expect, it } from "vitest";
import path from "node:path";
import { artifactPath, currentPointerPath, eventsPath, makeRunId, runDir, runsDir } from "../../engine/run-dir.js";

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
});
