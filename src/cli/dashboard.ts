// `agent-smith dashboard` — start the local agent-call tracking UI.
import { spawn } from "node:child_process";
import chalk from "chalk";
import { LocalFsEventSource } from "../dashboard/event-source.js";
import { startDashboard } from "../dashboard/server.js";

interface DashboardOptions {
  port?: string;
  run?: string;
  dir?: string;
  open?: boolean;
}

export async function dashboardCommand(opts: DashboardOptions): Promise<void> {
  const root = opts.dir ?? process.cwd();
  const source = new LocalFsEventSource(root, opts.run ?? null);
  const port = Number.parseInt(opts.port ?? "4575", 10) || 4575;

  const started = await startDashboard(source, port);
  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Agent Call Dashboard"));
  console.log(chalk.white(`  ▸ ${started.url}`));
  console.log(chalk.gray(`  watching ${root}/.agent-smith/runs/  ·  Ctrl-C to stop\n`));

  if (opts.open !== false) openBrowser(started.url);

  // Keep the process alive until interrupted. The SSE endpoint holds long-lived keep-alive sockets
  // open, so `server.close()` alone never resolves — it waits for connections that never end. We
  // must force the sockets shut and exit explicitly, otherwise the first Ctrl-C appears to do
  // nothing (and, because a SIGINT listener is attached, the default "kill on Ctrl-C" is suppressed).
  await new Promise<void>(() => {
    let closing = false;
    const shutdown = (): void => {
      if (closing) process.exit(0); // a second Ctrl-C: bail immediately
      closing = true;
      console.log(chalk.gray("\n  dashboard stopped"));
      started.server.closeAllConnections?.(); // Node ≥18.2 — drop the held-open SSE sockets
      started.server.close(() => process.exit(0));
      // Safety net in case close() still hangs on a stray socket.
      setTimeout(() => process.exit(0), 500).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

function openBrowser(url: string): void {
  let cmd: string;
  if (process.platform === "darwin") {
    cmd = "open";
  } else if (process.platform === "win32") {
    cmd = "start";
  } else {
    cmd = "xdg-open";
  }
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref(); // NOSONAR — fixed opener, local URL
  } catch {
    /* best-effort; the URL is printed regardless */
  }
}
