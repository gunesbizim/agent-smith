// MCP installer — downloads and configures MCP servers
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import chalk from "chalk";
import cliProgress from "cli-progress";
import { MCP_REGISTRY, getMCPServer } from "./registry.js";
import { detectionEnv } from "../shared/exec-env.js";
import { homeDir } from "../shared/platform-utils.js";
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
export function runCommandAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Augmented PATH so checks/installs find tools in ~/.local/bin, /opt/homebrew/bin, etc.
    const child = spawn(command, { shell: true, stdio: ["ignore", "ignore", "pipe"], env: detectionEnv() });
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

/** Build the PATH-presence probe for a command, per platform.
 *
 *  A bare single-token command (e.g. "serena", "gitnexus") is a PRESENCE check — testing it by
 *  *running* the tool is fragile (it may launch a server, hang, or exit non-zero with no args).
 *  Such tokens are reduced to a "is it on PATH?" probe. The probe runs through a shell
 *  (`runCommandAsync` uses `shell: true`), so it MUST match that shell: POSIX `/bin/sh` has
 *  `command -v`, but the Windows shell is **cmd.exe**, which has no `command -v` builtin — it uses
 *  `where`. Using `command -v` on Windows made every presence check fail, so the installer never
 *  recognized already-installed servers. Commands that already carry arguments (e.g.
 *  "sentrux --version") are returned verbatim. Exported for unit testing. */
export function presenceProbe(command: string, platform: NodeJS.Platform = process.platform): string {
  const tok = command.trim();
  if (!/^[\w@./+-]+$/.test(tok)) return tok; // has flags/args → run as given
  return platform === "win32" ? `where ${tok}` : `command -v ${tok}`;
}

/** Async, non-blocking equivalent of "does this command succeed?" (exit 0). */
export function commandSucceeds(command: string): Promise<boolean> {
  return runCommandAsync(presenceProbe(command)).then(
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
    projectMcp: {},
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

  if (!dryRun) {
    writeProjectMcp(projectRoot, bundle);
    // The file may carry credentials (e.g. SONARQUBE_TOKEN, JIRA_API_TOKEN) and
    // private paths (Obsidian vault) resolved from the environment, so it must
    // never be committed. Add it to .gitignore immediately after creation.
    ensureGitignore(projectRoot, [".mcp.json"], MCP_GITIGNORE_COMMENT);
    stripSettingsMcpServers(projectRoot);
    warnStaleUserMcpDuplicates(Object.keys(bundle.projectMcp));
  }

  return bundle;
}

/** Add a single registry server to the bundle — all applicable scopes go into projectMcp. */
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

  // All scopes (project, both, user, local) are consolidated into projectMcp (.mcp.json).
  // configureMCPs adds .mcp.json to .gitignore right after writing it (see ensureGitignore
  // call there), so private values (vault paths, credentials) stay local and uncommitted.
  // mcpServers is never written to .claude/settings.json.
  const entry = { type: "stdio" as const, ...resolveConfigEnv(server.configTemplate, vars) };
  bundle.projectMcp[server.name] = entry;
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

/**
 * Migration cleanup: remove the `mcpServers` key from `.claude/settings.json`
 * if it exists. All MCP servers are now consolidated into `.mcp.json`. Other
 * keys (`permissions`, `hooks`, etc.) are preserved untouched.
 *
 * Safe to call idempotently — no-ops when the file or key do not exist.
 */
export function stripSettingsMcpServers(projectRoot: string): void {
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;
  let settings: Record<string, unknown>;
  try {
    settings = fs.readJsonSync(settingsPath);
  } catch {
    return;
  }
  if (!Object.hasOwn(settings, "mcpServers")) return;
  delete settings.mcpServers;
  fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
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

/** Header comment written above the `.mcp.json` entry in the target repo's .gitignore. */
export const MCP_GITIGNORE_COMMENT =
  "agent-smith MCP config — may contain credentials/private paths, never commit";

/**
 * Idempotently append entries to the target repo's .gitignore, under a header
 * comment describing why. Used to keep generated artifacts and the
 * credential-bearing `.mcp.json` out of version control. Returns the entries
 * that were newly added.
 */
export function ensureGitignore(
  projectRoot: string,
  entries: string[],
  comment = "agent-smith — generated artifacts, never commit",
): string[] {
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
  const block = `${prefix}\n# ${comment}\n${toAdd.join("\n")}\n`;
  fs.appendFileSync(gitignorePath, block);
  return toAdd;
}

/**
 * Warn (without mutating anything) when a server we just wrote to the project
 * `.mcp.json` is ALSO registered in a global Claude config (`~/.claude/.mcp.json`
 * or the legacy `~/.claude.json`). Such a server launches twice — once globally,
 * once per-project — which is the double-launch this consolidation set out to
 * remove. We deliberately do NOT auto-edit the user's home configs (they may keep
 * those servers globally on purpose); we surface the conflict and the manual fix.
 */
export function warnStaleUserMcpDuplicates(writtenServerNames: string[], home: string = homeDir()): void {
  if (writtenServerNames.length === 0) return;
  const globalConfigs = [
    path.join(home, ".claude", ".mcp.json"),
    path.join(home, ".claude.json"),
  ];
  const written = new Set(writtenServerNames);
  const dupes = new Set<string>();
  for (const cfgPath of globalConfigs) {
    if (!fs.existsSync(cfgPath)) continue;
    let cfg: Record<string, unknown>;
    try {
      cfg = fs.readJsonSync(cfgPath);
    } catch {
      continue;
    }
    const servers = (cfg.mcpServers ?? {}) as Record<string, unknown>;
    for (const name of Object.keys(servers)) {
      if (written.has(name)) dupes.add(name);
    }
  }
  if (dupes.size === 0) return;
  console.warn(
    chalk.yellow(
      `  ⚠ ${[...dupes].join(", ")} ${dupes.size === 1 ? "is" : "are"} also registered globally ` +
        `(~/.claude/.mcp.json or ~/.claude.json) and will launch twice in this project.`,
    ),
  );
  console.warn(
    chalk.gray(
      "    Remove the duplicate(s) from the global config to avoid double-launches.",
    ),
  );
}

/** Directory where the playwright MCP writes screenshots/traces (gitignored). */
export const PLAYWRIGHT_OUTPUT_DIR = ".playwright-mcp";
