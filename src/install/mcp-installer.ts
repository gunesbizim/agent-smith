// MCP installer — downloads and configures MCP servers
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { MCP_REGISTRY, getMCPServer } from "./registry.js";
import type { MCPConfigEntry, TemplateVariables, MCPConfigBundle, PlatformInstall, MCPServerDefinition, DetectedProject } from "../shared/types.js";

/** True when the detected project uses Vuetify on the frontend. */
function usesVuetify(project: DetectedProject): boolean {
  return (project.frontend?.uiLibrary ?? "").toLowerCase().includes("vuetify");
}

/** True when the detected project has a Laravel backend. */
function usesLaravel(project: DetectedProject): boolean {
  return project.backend?.framework === "laravel";
}

// Decide whether an MCP server is relevant to the detected stack.
// Stack-specific servers are gated so we never configure a server that has no
// bearing on the project (e.g. the Vuetify docs server for a non-Vuetify app).
// When project is null the caller skipped detection — include everything for
// backward compatibility.
function isServerApplicable(
  server: MCPServerDefinition,
  project: DetectedProject | null,
  hasFrontend: boolean,
): boolean {
  if (!project) return true;
  // Browser-automation servers require a frontend.
  if (server.category === "browser" && !hasFrontend) return false;
  // Vuetify component-docs server is only useful on a Vuetify frontend.
  if (server.name === "vuetify" && !usesVuetify(project)) return false;
  // Laravel Boost server is only useful on a Laravel backend.
  if (server.name === "laravel-boost" && !usesLaravel(project)) return false;
  return true;
}

function resolveInstall(cmd: PlatformInstall): string {
  if (typeof cmd === "string") return cmd;
  return cmd[process.platform as "darwin" | "linux" | "win32"] ?? "";
}

/** The platform-resolved install command for a server (""=nothing to run here). */
export function resolveInstallCommand(server: MCPServerDefinition): string {
  return resolveInstall(server.installCommand);
}

export interface InstallOptions {
  servers?: string[];
  scope?: "project" | "user" | "all";
  /**
   * Detected project — when provided, stack-specific servers (browser, vuetify,
   * laravel-boost) are filtered out for projects they don't apply to, so we never
   * try to install a server the project has no use for. Omit (or null) to install
   * everything, preserving backward-compatible behaviour.
   */
  project?: DetectedProject | null;
}

/** Injectable hooks so the install loop is unit-testable without spawning real processes. */
export interface InstallDeps {
  run?: (command: string) => Promise<void>;
  check?: (command: string) => Promise<boolean>;
  /** Render the cli-progress bar (default true). Tests pass false. */
  showProgress?: boolean;
}

/** Outcome of an install run, bucketed by what happened to each server. */
export interface InstallSummary {
  installed: string[];
  prewarmed: string[];
  alreadyPresent: string[];
  onDemand: string[];
  manual: string[];
  failed: { name: string; error: string }[];
}

/**
 * The set of servers an install run will act on, after scope + stack gating.
 * Exported so the consent prompt and the installer agree on the exact list.
 */
export function selectServersToInstall(opts: InstallOptions = {}): MCPServerDefinition[] {
  const servers = opts.servers ?? MCP_REGISTRY.map((s) => s.name);
  const scope = opts.scope ?? "all";
  const project = opts.project ?? null;
  const hasFrontend = project ? project.frontend !== null : true;
  return MCP_REGISTRY.filter(
    (s) =>
      servers.includes(s.name) &&
      (scope === "all" || s.scope === scope || s.scope === "both") &&
      isServerApplicable(s, project, hasFrontend),
  );
}

/**
 * Run a shell command asynchronously, resolving on exit code 0 and rejecting
 * otherwise. Unlike execSync this does NOT block Node's event loop, which is
 * what lets the ora spinner keep animating (and the elapsed-time ticker fire)
 * while a slow `npm`/`npx`/`pipx` install runs — otherwise the spinner freezes
 * mid-frame and the CLI looks hung.
 */
function runCommandAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ["ignore", "ignore", "pipe"] });
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

/** Async, non-blocking equivalent of "does this command succeed?" (exit 0). */
function commandSucceeds(command: string): Promise<boolean> {
  return runCommandAsync(command).then(
    () => true,
    () => false,
  );
}

/** What happened to a single server. `kind` (except "failed") maps to an InstallSummary array. */
type InstallOutcome =
  | { kind: "installed" | "prewarmed" | "alreadyPresent" | "onDemand" | "manual"; status: string }
  | { kind: "failed"; status: string; error: string };

/** Resolve, check, and run the install for one server. Pure of progress-bar concerns
 *  beyond the injected `onTick` callback, which keeps the bar redrawing during a slow run. */
async function installOneServer(
  server: MCPServerDefinition,
  run: (command: string) => Promise<void>,
  check: (command: string) => Promise<boolean>,
  onTick: (status: string) => void,
): Promise<InstallOutcome> {
  const resolved = resolveInstall(server.installCommand);

  if (await check(server.checkCommand)) {
    return { kind: "alreadyPresent", status: `${server.name} — already installed` };
  }
  if (server.installType === "npx" && !resolved) {
    return { kind: "onDemand", status: `${server.name} — fetched on first use (npx)` };
  }
  if (server.installType === "manual" || !resolved) {
    return { kind: "manual", status: `${server.name} — manual install required` };
  }

  const verb = server.installType === "prewarm" ? "pre-warming" : "installing";
  const startedAt = Date.now();
  const ticker = setInterval(() => {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    onTick(`${server.name} — ${verb} (${seconds}s): ${resolved}`);
  }, 1000);
  onTick(`${server.name} — ${verb}: ${resolved}`);
  try {
    await run(resolved);
    const kind = server.installType === "prewarm" ? "prewarmed" : "installed";
    return { kind, status: `${server.name} — done` };
  } catch (err) {
    return { kind: "failed", status: `${server.name} — FAILED`, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearInterval(ticker);
  }
}

/** Record an outcome into the right summary bucket. */
function recordOutcome(summary: InstallSummary, name: string, outcome: InstallOutcome): void {
  if (outcome.kind === "failed") summary.failed.push({ name, error: outcome.error });
  else summary[outcome.kind].push(name);
}

/** One-line footer summarising what happened across all servers. */
function logInstallSummary(summary: InstallSummary): void {
  const parts: string[] = [];
  if (summary.installed.length) parts.push(`installed ${summary.installed.length}`);
  if (summary.prewarmed.length) parts.push(`pre-warmed ${summary.prewarmed.length}`);
  if (summary.alreadyPresent.length) parts.push(`already present ${summary.alreadyPresent.length}`);
  if (summary.onDemand.length) parts.push(`on-demand ${summary.onDemand.length}`);
  if (summary.manual.length) parts.push(`manual: ${summary.manual.join(", ")}`);
  if (summary.failed.length) parts.push(chalk.yellow(`failed: ${summary.failed.map((f) => f.name).join(", ")}`));
  console.log(chalk.gray(`  MCP install — ${parts.join(" · ")}`));
}

export async function installMCPs(opts: InstallOptions = {}, deps: InstallDeps = {}): Promise<InstallSummary> {
  const run = deps.run ?? runCommandAsync;
  const check = deps.check ?? commandSucceeds;
  const showProgress = deps.showProgress ?? true;

  const toInstall = selectServersToInstall(opts);
  const summary: InstallSummary = {
    installed: [], prewarmed: [], alreadyPresent: [], onDemand: [], manual: [], failed: [],
  };
  if (toInstall.length === 0) return summary;

  // A real progress bar that stays visible for the whole install and names the server +
  // the actual command running. The per-server ticker keeps it redrawing during slow runs.
  const bar = showProgress
    ? new cliProgress.SingleBar(
        { format: "  Installing MCPs |{bar}| {value}/{total} · {status}", hideCursor: true, clearOnComplete: false, stopOnComplete: true },
        cliProgress.Presets.shades_classic,
      )
    : null;
  bar?.start(toInstall.length, 0, { status: "starting…" });

  let index = 0;
  for (const server of toInstall) {
    bar?.update(index, { status: `${server.name} — checking` });
    const outcome = await installOneServer(server, run, check, (status) => bar?.update(index, { status }));
    recordOutcome(summary, server.name, outcome);
    index += 1;
    bar?.update(index, { status: outcome.status });
  }

  bar?.stop();
  if (showProgress) logInstallSummary(summary);
  return summary;
}

export async function configureMCPs(
  projectRoot: string,
  vars: TemplateVariables,
  platform: string = "claude-code",
  dryRun: boolean = false,
  project: DetectedProject | null = null,
): Promise<MCPConfigBundle> {
  const bundle: MCPConfigBundle = {
    projectSettings: {},
    projectMcp: {},
    userMcp: {},
  };

  // Stack-aware selection: only configure MCPs that make sense for the detected stack.
  // Browser-automation servers are useless without a frontend (e.g. a CLI tool / library),
  // so they are skipped unless a frontend was detected. When project is null (caller did
  // not run detection) we fall back to including everything for backward compatibility.
  const hasFrontend = project ? project.frontend !== null : true;

  for (const server of MCP_REGISTRY) {
    if (!isServerApplicable(server, project, hasFrontend)) continue;
    addServerToBundle(bundle, server, vars, dryRun);
  }

  // Also put browser tools in .mcp.json scope — only when a frontend exists.
  if (bundle.projectSettings.playwright) {
    bundle.projectMcp.playwright = bundle.projectSettings.playwright;
  }
  if (bundle.projectSettings["chrome-devtools"]) {
    bundle.projectMcp["chrome-devtools"] = bundle.projectSettings["chrome-devtools"];
  }

  if (!dryRun) {
    writeClaudeSettings(projectRoot, bundle);
    writeProjectMcp(projectRoot, bundle);
  }

  return bundle;
}

/** Add a single registry server to the bundle under its file-based scope(s). */
function addServerToBundle(
  bundle: MCPConfigBundle,
  server: MCPServerDefinition,
  vars: TemplateVariables,
  dryRun: boolean,
): void {
  // Skip servers whose required env vars are unset/empty — otherwise we'd write
  // a broken entry (e.g. `mcp-obsidian ""` with no vault path, or a credential-less
  // sonarqube/jira). Surface the skip so it isn't silent.
  if (!hasRequiredEnv(server.requiredEnvVars)) {
    if (!dryRun) {
      console.warn(
        `  ⚠ Skipping ${server.name} — set ${server.requiredEnvVars.join(", ")} then re-run to configure it.`,
      );
    }
    return;
  }

  // "local" scope is not file-based — it lives in ~/.claude.json, registered
  // separately via registerLocalMCPs(). Skip it here.
  if (server.scope === "local") return;

  const entry = { type: "stdio" as const, ...resolveConfigEnv(server.configTemplate, vars) };
  if (server.scope === "project" || server.scope === "both") {
    bundle.projectSettings[server.name] = entry;
  }
  if (server.scope === "user" || server.scope === "both") {
    bundle.userMcp[server.name] = entry;
  }
}

/** Merge bundle.projectSettings into .claude/settings.json. */
function writeClaudeSettings(projectRoot: string, bundle: MCPConfigBundle): void {
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  fs.ensureDirSync(path.dirname(settingsPath));

  let existingSettings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    existingSettings = fs.readJsonSync(settingsPath);
  }

  existingSettings.mcpServers = {
    ...(existingSettings.mcpServers as Record<string, unknown> ?? {}),
    ...bundle.projectSettings,
  };

  fs.writeJsonSync(settingsPath, existingSettings, { spaces: 2 });
}

/** Merge bundle.projectMcp into the repo's .mcp.json. */
function writeProjectMcp(projectRoot: string, bundle: MCPConfigBundle): void {
  const mcpPath = path.join(projectRoot, ".mcp.json");
  let existingMcp: Record<string, unknown> = {};
  if (fs.existsSync(mcpPath)) {
    existingMcp = fs.readJsonSync(mcpPath);
  }
  existingMcp.mcpServers = {
    ...(existingMcp.mcpServers as Record<string, unknown> ?? {}),
    ...bundle.projectMcp,
  };
  fs.writeJsonSync(mcpPath, existingMcp, { spaces: 2 });
}

function resolveConfigEnv(
  config: MCPConfigEntry,
  vars: TemplateVariables,
): MCPConfigEntry {
  const resolved: MCPConfigEntry = {
    command: config.command,
    args: config.args.map((a) => resolveEnvVars(a, vars)),
    env: {},
  };
  for (const [key, value] of Object.entries(config.env)) {
    resolved.env[key] = resolveEnvVars(value, vars);
  }
  if (config.type) {
    (resolved as unknown as Record<string, unknown>).type = config.type;
  }
  return resolved;
}

function resolveEnvVars(template: string, vars: TemplateVariables): string {
  return template.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name: string, defaultValue: string) => {
    return process.env[name] ?? defaultValue ?? "";
  });
}

/** True when every required env var is set to a non-empty value (none required → true). */
export function hasRequiredEnv(requiredEnvVars: string[]): boolean {
  return requiredEnvVars.every((name) => (process.env[name] ?? "").trim().length > 0);
}

/**
 * Register "local" scope MCP servers into Claude Code's per-project private config
 * (~/.claude.json) via `claude mcp add --scope local`. These are per-repo and never
 * committed, so a single agent-smith install serves many repos, each with its own
 * config (e.g. a distinct Obsidian vault path). Only runs on the claude-code platform.
 *
 * Servers with unmet required env vars are skipped (prompt for them before calling).
 */
export function registerLocalMCPs(
  vars: TemplateVariables,
  platform: string = "claude-code",
): { registered: string[]; skipped: string[] } {
  const registered: string[] = [];
  const skipped: string[] = [];

  if (platform !== "claude-code") {
    // Other platforms have no equivalent of Claude Code local scope.
    return { registered, skipped: MCP_REGISTRY.filter((s) => s.scope === "local").map((s) => s.name) };
  }

  for (const server of MCP_REGISTRY) {
    if (server.scope !== "local") continue;

    if (!hasRequiredEnv(server.requiredEnvVars)) {
      skipped.push(server.name);
      continue;
    }

    const config = resolveConfigEnv(server.configTemplate, vars);
    // execFileSync passes args as an array (no shell), so no quoting/injection
    // concerns. Env vars are forwarded with --env so local servers that need
    // credentials register correctly.
    const envFlags = Object.entries(config.env).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
    const addArgs = [
      "mcp", "add", "--scope", "local", "--transport", "stdio", server.name,
      ...envFlags, "--", config.command, ...config.args,
    ];

    try {
      // Resolving the `claude` CLI via PATH is intentional — it's the user's
      // installed Claude Code binary. Args are passed as an array (no shell).
      // The S4036 hotspot is excluded for this file in sonar-project.properties.
      execFileSync("claude", addArgs, { stdio: "pipe" });
      registered.push(server.name);
    } catch {
      skipped.push(server.name);
    }
  }

  return { registered, skipped };
}

/**
 * Idempotently append entries to the target repo's .gitignore. Used to ensure
 * Playwright screenshot output (.playwright-mcp/) is never committed. Returns the
 * entries that were newly added.
 */
export function ensureGitignore(projectRoot: string, entries: string[]): string[] {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  // Read directly and treat a missing file as empty — avoids an exists()/read()
  // time-of-check/time-of-use race.
  let existing = "";
  try {
    existing = fs.readFileSync(gitignorePath, "utf-8");
  } catch {
    // No .gitignore yet — appendFileSync below creates it.
  }
  const present = new Set(
    existing.split("\n").map((line) => line.trim().replace(/\/$/, "")),
  );

  const toAdd = entries.filter((e) => !present.has(e.trim().replace(/\/$/, "")));
  if (toAdd.length === 0) return [];

  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const block = `${prefix}\n# Playwright MCP screenshots/traces — generated artifacts, never commit\n${toAdd.join("\n")}\n`;
  fs.appendFileSync(gitignorePath, block);
  return toAdd;
}

/** Directory where the playwright MCP writes screenshots/traces (gitignored). */
export const PLAYWRIGHT_OUTPUT_DIR = ".playwright-mcp";
