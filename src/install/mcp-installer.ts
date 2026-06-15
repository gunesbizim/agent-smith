// MCP installer — downloads and configures MCP servers
import { execSync, execFileSync } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import ora from "ora";
import { MCP_REGISTRY, getMCPServer } from "./registry.js";
import type { MCPConfigEntry, TemplateVariables, MCPConfigBundle, PlatformInstall, MCPServerDefinition, DetectedProject } from "../shared/types.js";

// Decide whether an MCP server is relevant to the detected stack.
// Browser-automation servers require a frontend; everything else is stack-agnostic.
function isServerApplicable(
  server: MCPServerDefinition,
  project: DetectedProject | null,
  hasFrontend: boolean,
): boolean {
  if (project && server.category === "browser" && !hasFrontend) return false;
  return true;
}

function resolveInstall(cmd: PlatformInstall): string {
  if (typeof cmd === "string") return cmd;
  return cmd[process.platform as "darwin" | "linux" | "win32"] ?? "";
}

interface InstallOptions {
  servers?: string[];
  scope?: "project" | "user" | "all";
}

export async function installMCPs(opts: InstallOptions = {}): Promise<void> {
  const servers = opts.servers ?? MCP_REGISTRY.map((s) => s.name);
  const scope = opts.scope ?? "all";

  const toInstall = MCP_REGISTRY.filter(
    (s) => servers.includes(s.name) && (scope === "all" || s.scope === scope || s.scope === "both"),
  );

  for (const server of toInstall) {
    const spinner = ora(`Installing ${server.name}...`).start();

    // Check if already installed
    try {
      execSync(server.checkCommand, { stdio: "ignore" });
      spinner.succeed(`${server.name} already installed`);
      continue;
    } catch {
      // Not installed — proceed
    }

    const resolved = resolveInstall(server.installCommand);

    if (server.installType === "manual" || !resolved) {
      spinner.warn(`${server.name} requires manual installation: ${resolved || "see docs"}`);
      continue;
    }

    try {
      execSync(resolved, { stdio: "pipe" });
      spinner.succeed(`${server.name} installed`);
    } catch (err) {
      spinner.fail(`${server.name} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
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
