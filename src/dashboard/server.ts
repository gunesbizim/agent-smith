// Zero-dependency dashboard server (node:http only). Serves one self-contained HTML page and streams
// run snapshots over Server-Sent Events by polling the EventSource. Binds to 127.0.0.1 — never the
// network — so local run data (which may include prompt text) is not exposed.
import http from "node:http";
import { readDashboardHtml } from "./asset.js";
import type { EventSource } from "./event-source.js";

export interface DashboardServerOptions {
  htmlProvider?: () => string;
  pollMs?: number;
  heartbeatMs?: number;
}

export function createDashboardServer(source: EventSource, opts: DashboardServerOptions = {}): http.Server {
  const html = opts.htmlProvider ?? readDashboardHtml;
  const pollMs = opts.pollMs ?? 1000;

  return http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "text/plain" });
      res.end("method not allowed");
      return;
    }
    const url = req.url ?? "/";
    if (url === "/" || url.startsWith("/index")) return serveHtml(res, html);
    if (url.startsWith("/api/runs")) return serveRuns(res, source);
    if (url.startsWith("/api/events")) return serveSse(req, res, source, pollMs);
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
}

function serveHtml(res: http.ServerResponse, html: () => string): void {
  try {
    const body = html();
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("dashboard asset unavailable");
  }
}

function serveRuns(res: http.ServerResponse, source: EventSource): void {
  source
    .snapshot()
    .then((snap) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(snap));
    })
    .catch(() => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"snapshot failed"}');
    });
}

function serveSse(req: http.IncomingMessage, res: http.ServerResponse, source: EventSource, pollMs: number): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  let seq = 0;
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\nid: ${seq++}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const push = async (kind: "snapshot" | "update"): Promise<void> => {
    try {
      send(kind, await source.snapshot());
    } catch {
      /* transient read error — keep the stream open, retry next tick */
    }
  };

  void push("snapshot");
  const poll = setInterval(() => void push("update"), pollMs);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), Math.max(pollMs, 15_000));

  req.on("close", () => {
    clearInterval(poll);
    clearInterval(heartbeat);
  });
}

export interface StartedDashboard {
  server: http.Server;
  port: number;
  url: string;
}

/** Listen on `port`, falling back to an ephemeral port if it is taken. Always binds to 127.0.0.1. */
export function startDashboard(source: EventSource, port: number, opts: DashboardServerOptions = {}): Promise<StartedDashboard> {
  const server = createDashboardServer(source, opts);
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      if (err.code === "EADDRINUSE") {
        server.listen(0, "127.0.0.1");
        return;
      }
      reject(err);
    };
    server.on("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : port;
      resolve({ server, port: actual, url: `http://127.0.0.1:${actual}` });
    });
  });
}
