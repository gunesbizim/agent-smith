import { afterEach, beforeEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { appendEvent, listRunIds, readEvents } from "../../engine/event-store.js";
import { eventsPath } from "../../engine/run-dir.js";

let root: string;
const RUN = "demo-run";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "as-eventstore-"));
});

afterEach(() => {
  fs.removeSync(root);
});

describe("event-store", () => {
  it("assigns monotonic, 0-based seq and stamps the envelope", () => {
    const a = appendEvent(root, RUN, { type: "phase_started", phase: "understand" });
    const b = appendEvent(root, RUN, { type: "phase_started", phase: "red" });

    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(a.v).toBe(1);
    expect(a.runId).toBe(RUN);
    expect(typeof a.id).toBe("string");
    expect(a.id).not.toBe(b.id);
    expect(() => new Date(a.ts).toISOString()).not.toThrow();
  });

  it("reads back all events in order", () => {
    appendEvent(root, RUN, { type: "phase_started", phase: "understand" });
    appendEvent(root, RUN, { type: "phase_finished", phase: "understand", success: true, summary: "ok" });

    const events = readEvents(root, RUN);
    expect(events.map((e) => e.type)).toEqual(["phase_started", "phase_finished"]);
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("continues seq numbering across a fresh read (resume)", () => {
    appendEvent(root, RUN, { type: "phase_started", phase: "understand" });
    appendEvent(root, RUN, { type: "phase_started", phase: "red" });
    // Simulate a process restart: nothing held in memory, append again.
    const c = appendEvent(root, RUN, { type: "phase_started", phase: "plan" });
    expect(c.seq).toBe(2);
  });

  it("tolerates a torn final line on read and when computing next seq", () => {
    appendEvent(root, RUN, { type: "phase_started", phase: "understand" });
    // Simulate a crash mid-append: a partial, unparseable trailing line.
    fs.appendFileSync(eventsPath(root, RUN), '{"v":1,"seq":1,"type":"phase_st');

    const events = readEvents(root, RUN);
    expect(events).toHaveLength(1); // torn line skipped

    const next = appendEvent(root, RUN, { type: "phase_started", phase: "red" });
    expect(next.seq).toBe(1); // max valid seq (0) + 1 — torn line ignored
  });

  it("lists run directories but not the current pointer file", () => {
    appendEvent(root, "run-a", { type: "phase_started", phase: "understand" });
    appendEvent(root, "run-b", { type: "phase_started", phase: "understand" });
    fs.writeFileSync(path.join(root, ".agent-smith", "runs", "current"), "run-a");

    const ids = listRunIds(root).sort();
    expect(ids).toEqual(["run-a", "run-b"]);
  });

  it("returns [] for an unknown run", () => {
    expect(readEvents(root, "nope")).toEqual([]);
  });
});
