// The data-source seam for the dashboard.
//
// The server depends only on this interface, so the local filesystem reader can later be swapped for
// a RemoteApiEventSource (Azure) without touching the server or the front end — that is the entire
// "future API/Azure" deploy seam the user asked for.
import { listRunIds, readEvents } from "../engine/event-store.js";
import { normalizeRun } from "./normalize.js";
import type { DashboardSnapshot, RunDTO } from "./types.js";

export interface EventSource {
  /** Full current state of all runs, newest first. */
  snapshot(): Promise<DashboardSnapshot>;
  dispose?(): Promise<void>;
}

/** Reads engine + interactive run logs from `<root>/.agent-smith/runs/`. */
export class LocalFsEventSource implements EventSource {
  constructor(
    private readonly root: string,
    private readonly runFilter: string | null = null,
    private readonly nowMs: () => number = Date.now,
  ) {}

  async snapshot(): Promise<DashboardSnapshot> {
    const ids = listRunIds(this.root).filter((id) => !this.runFilter || id === this.runFilter);
    const runs: RunDTO[] = ids.map((id) => normalizeRun(id, readEvents(this.root, id), this.nowMs()));
    runs.sort((a, b) => Date.parse(b.startedAt ?? "0") - Date.parse(a.startedAt ?? "0"));
    return { runs, generatedAt: new Date(this.nowMs()).toISOString() };
  }
}
