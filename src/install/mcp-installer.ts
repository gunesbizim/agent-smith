// MCP installer — downloads and configures MCP servers
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import ora from "ora";
import { MCP_REGISTRY, getMCPServer } from "./registry.js";
import type { MCPConfigEntry, TemplateVariables, MCPConfigBundle, PlatformInstall } from "../shared/types.js";

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
): Promise<MCPConfigBundle> {
  const bundle: MCPConfigBundle = {
    projectSettings: {},
    projectMcp: {},
    userMcp: {},
  };

  for (const server of MCP_REGISTRY) {
    const config = resolveConfigEnv(server.configTemplate, vars);

    if (server.scope === "project" || server.scope === "both") {
      bundle.projectSettings[server.name] = { type: "stdio", ...config };
    }
    if (server.scope === "user" || server.scope === "both") {
      bundle.userMcp[server.name] = { type: "stdio", ...config };
    }
  }

  // Also put browser tools in .mcp.json scope
  bundle.projectMcp.playwright = bundle.projectSettings.playwright;
  bundle.projectMcp["chrome-devtools"] = bundle.projectSettings["chrome-devtools"];

  if (!dryRun) {
    // Write project settings
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
    existingSettings.permissions = {
      ...(existingSettings.permissions as Record<string, unknown> ?? {}),
      allow: [
        ...((existingSettings.permissions as Record<string, unknown>)?.allow as string[] ?? []),
        "mcp__ouroboros__ouroboros_pm_interview",
      ],
    };

    fs.writeJsonSync(settingsPath, existingSettings, { spaces: 2 });

    // Write project .mcp.json
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

  return bundle;
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
