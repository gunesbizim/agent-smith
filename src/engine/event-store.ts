// Append-only event store backing the runtime engine.
//
// `events.jsonl` is the source of truth for a run. Writes are single-line appends (POSIX-atomic for
// small lines) and reads tolerate a torn final line (crash mid-write) so resume never throws.
import { randomUUID } from "node:crypto";
import fs from "fs-extra";
import { EVENT_SCHEMA_VERSION, type EngineEvent, type EngineEventInput } from "./events.js";
import { eventsPath, runDir, runsDir } from "./run-dir.js";

/** Append one event, stamping the envelope (v, seq, id, ts, runId). Returns the stored event. */
export function appendEvent(root: string, runId: string, input: EngineEventInput): EngineEvent {
  fs.ensureDirSync(runDir(root, runId));
  const file = eventsPath(root, runId);
  const event = {
    v: EVENT_SCHEMA_VERSION,
    seq: nextSeq(file),
    id: randomUUID(),
    ts: new Date().toISOString(),
    runId,
    ...input,
  } as EngineEvent;
  fs.appendFileSync(file, JSON.stringify(event) + "\n");
  return event;
}

/** Read all well-formed events for a run, in order. Skips blank/torn lines. */
export function readEvents(root: string, runId: string): EngineEvent[] {
  const file = eventsPath(root, runId);
  if (!fs.existsSync(file)) return [];
  return parseLines(fs.readFileSync(file, "utf-8"));
}

/** Directory names under runs/ (each is a run id, plus possibly `current` which is a file). */
export function listRunIds(root: string): string[] {
  const dir = runsDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function parseLines(raw: string): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as EngineEvent);
    } catch {
      /* tolerate a torn final line (process killed mid-append) */
    }
  }
  return out;
}

// Next sequence number = (max existing seq) + 1. Re-reads the file so a resumed process continues
// numbering correctly without holding an in-memory counter across restarts.
function nextSeq(file: string): number {
  if (!fs.existsSync(file)) return 0;
  let max = -1;
  for (const e of parseLines(fs.readFileSync(file, "utf-8"))) {
    if (typeof e.seq === "number" && e.seq > max) max = e.seq;
  }
  return max + 1;
}
