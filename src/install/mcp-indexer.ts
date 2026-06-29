// MCP indexer — at init/configure, build each configured server's initial index of the project
// (e.g. `gitnexus analyze`, `git-memory index`) so its tools work immediately in the first session
// instead of reporting an empty/stale index. Best-effort: a missing binary or a failing scan is
// skipped, never fatal. `gitnexus analyze` is also what writes AGENTS.md, which the init flow
// removes afterwards (see agents-md-cleanup.ts).
import { spawn } from "node:child_process";
import ora from "ora";
import chalk from "chalk";
import { selectServersToInstall, commandSucceeds } from "./mcp-installer.js";
import { detectionEnv } from "../shared/exec-env.js";
import type { DetectedProject, MCPServerDefinition, PlatformInstall } from "../shared/types.js";

/** Resolve a per-platform command to a string for the current platform (""=nothing to run). */
function resolvePlatformCommand(cmd: PlatformInstall): string {
  if (typeof cmd === "string") return cmd;
  return cmd[process.platform as "darwin" | "linux" | "win32"] ?? "";
}

/** Run a command in `cwd`, resolving on exit 0 and rejecting otherwise. Non-blocking (spawn).
 *  Exported for unit testing. */
export function runInDir(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, cwd, stdio: ["ignore", "ignore", "pipe"], env: detectionEnv() });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `command exited with code ${code}`));
    });
  });
}

/** Injectable hooks so indexing is unit-testable without spawning real processes. */
export interface IndexDeps {
  run?: (command: string, cwd: string) => Promise<void>;
  check?: (command: string) => Promise<boolean>;
  /** Render spinners (default true). Tests pass false. */
  showProgress?: boolean;
}

export interface IndexOptions {
  /** Detected project — gates stack-specific servers, same as the installer. */
  project?: DetectedProject | null;
}

export interface IndexSummary {
  indexed: string[];
  skipped: { name: string; reason: string }[];
  failed: { name: string; error: string }[];
}

/** Registry servers applicable to this project that declare an indexCommand. */
function serversToIndex(project: DetectedProject | null): (MCPServerDefinition & { indexCommand: PlatformInstall })[] {
  return selectServersToInstall({ project }).filter(
    (s): s is MCPServerDefinition & { indexCommand: PlatformInstall } => s.indexCommand !== undefined,
  );
}

/**
 * Run the initial index/scan for every applicable, installed MCP server that declares an
 * indexCommand, inside `targetDir`. Best-effort and idempotent — servers whose binary is absent are
 * skipped; a failing scan is recorded but never throws.
 */
export async function runMcpIndexing(
  targetDir: string,
  opts: IndexOptions = {},
  deps: IndexDeps = {},
): Promise<IndexSummary> {
  const run = deps.run ?? runInDir;
  const check = deps.check ?? commandSucceeds;
  const showProgress = deps.showProgress ?? true;
  const summary: IndexSummary = { indexed: [], skipped: [], failed: [] };

  for (const server of serversToIndex(opts.project ?? null)) {
    const command = resolvePlatformCommand(server.indexCommand);
    if (!command) {
      summary.skipped.push({ name: server.name, reason: "no index command for this platform" });
      continue;
    }
    // Only index when the binary is present — covers --no-install and not-yet-installed tools.
    if (!(await check(server.checkCommand))) {
      summary.skipped.push({ name: server.name, reason: "binary not installed" });
      continue;
    }
    const spinner = showProgress ? ora(`Indexing ${server.name} (${command})...`).start() : null;
    try {
      await run(command, targetDir);
      summary.indexed.push(server.name);
      spinner?.succeed(`${server.name} indexed`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      summary.failed.push({ name: server.name, error });
      spinner?.warn(`${server.name} indexing skipped (${error})`);
    }
  }

  if (showProgress && (summary.indexed.length || summary.failed.length || summary.skipped.length)) {
    const parts: string[] = [];
    if (summary.indexed.length) parts.push(`indexed ${summary.indexed.join(", ")}`);
    if (summary.skipped.length) parts.push(`skipped ${summary.skipped.map((s) => s.name).join(", ")}`);
    if (summary.failed.length) parts.push(chalk.yellow(`failed ${summary.failed.map((f) => f.name).join(", ")}`));
    console.log(chalk.gray(`  MCP indexing — ${parts.join(" · ")}`));
  }
  return summary;
}
