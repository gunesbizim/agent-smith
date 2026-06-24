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

  // Keep the process alive until interrupted.
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      started.server.close();
      resolve();
    });
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref(); // NOSONAR — fixed opener, local URL
  } catch {
    /* best-effort; the URL is printed regardless */
  }
}
