import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import http from "node:http";
import { createDashboardServer } from "../../dashboard/server.js";
import type { EventSource } from "../../dashboard/event-source.js";
import type { DashboardSnapshot } from "../../dashboard/types.js";

const SNAP: DashboardSnapshot = {
  generatedAt: "2026-06-24T00:00:00Z",
  runs: [
    {
      runId: "demo",
      origin: "engine",
      ticketId: "PROJ-1",
      task: null,
      startedAt: "2026-06-24T00:00:00Z",
      finishedAt: null,
      status: "running",
      phases: [],
      totals: { tokens: 42, costUsd: 0, wallClockMs: 0, callCount: 1 },
    },
  ],
};

function fakeSource(snap: DashboardSnapshot = SNAP): EventSource {
  return { snapshot: async () => snap };
}

let server: http.Server | null = null;
async function listen(s: http.Server): Promise<string> {
  server = s;
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(() => {
  server?.close();
  server = null;
});

describe("dashboard server", () => {
  it("serves the HTML page", async () => {
    const base = await listen(createDashboardServer(fakeSource(), { htmlProvider: () => "<!doctype html><title>X</title>OK" }));
    const res = await fetch(base + "/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("OK");
  });

  it("serves /api/runs as JSON", async () => {
    const base = await listen(createDashboardServer(fakeSource(), { htmlProvider: () => "x" }));
    const res = await fetch(base + "/api/runs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as DashboardSnapshot;
    expect(body.runs[0].runId).toBe("demo");
  });

  it("streams an initial snapshot frame over SSE", async () => {
    const base = await listen(createDashboardServer(fakeSource(), { htmlProvider: () => "x", pollMs: 50 }));
    const res = await fetch(base + "/api/events");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: snapshot");
    expect(text).toContain('"runId":"demo"');
    await reader.cancel();
  });

  it("404s unknown routes and 405s non-GET", async () => {
    const base = await listen(createDashboardServer(fakeSource(), { htmlProvider: () => "x" }));
    expect((await fetch(base + "/nope")).status).toBe(404);
    expect((await fetch(base + "/api/runs", { method: "POST" })).status).toBe(405);
  });
});
