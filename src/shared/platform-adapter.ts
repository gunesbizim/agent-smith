// Platform adapter interface + implementations
import path from "node:path";
import fs from "fs-extra";
import { homeDir } from "./platform-utils.js";
import type { PlatformAdapter, MCPConfigBundle, SkillFile } from "./types.js";

// ---- Claude Code Adapter ----
export class ClaudeCodeAdapter implements PlatformAdapter {
  name = "claude-code";
  displayName = "Claude Code";
  mcpConfigPath = ".mcp.json";
  mcpConfigFormat = "claude-mcp" as const;
  skillsBasePath = ".claude/skills";
  commandsBasePath = ".claude/commands";
  architectureBasePath = "docs/architecture";

  async installMCPs(configs: MCPConfigBundle): Promise<void> {
    const projectRoot = process.cwd();

    // All MCP servers — every scope — are consolidated into the project's
    // .mcp.json. `mcpServers` is intentionally NOT written to
    // .claude/settings.json (Claude Code reads it from .mcp.json, and a
    // duplicate block in settings.json caused double-launches).
    const mcpPath = path.join(projectRoot, this.mcpConfigPath);
    let mcpConfig: Record<string, unknown> = {};
    if (fs.existsSync(mcpPath)) {
      mcpConfig = (await fs.readJson(mcpPath)) as Record<string, unknown>;
    }
    mcpConfig.mcpServers = {
      ...(mcpConfig.mcpServers as Record<string, unknown> ?? {}),
      ...configs.projectMcp,
    };
    await fs.writeJson(mcpPath, mcpConfig, { spaces: 2 });
  }

  async scaffoldSkills(skills: SkillFile[]): Promise<void> {
    const projectRoot = process.cwd();
    for (const skill of skills) {
      const destPath = path.join(projectRoot, skill.relativePath);
      fs.ensureDirSync(path.dirname(destPath));
      await fs.writeFile(destPath, skill.content, "utf-8");
    }
  }
}

// ---- Cursor Adapter ----
export class CursorAdapter implements PlatformAdapter {
  name = "cursor";
  displayName = "Cursor IDE";
  mcpConfigPath = ".cursor/mcp.json";
  mcpConfigFormat = "cursor-mcp" as const;
  skillsBasePath = ".cursor/rules";
  commandsBasePath = ".cursor/commands";
  architectureBasePath = "docs/architecture";

  async installMCPs(configs: MCPConfigBundle): Promise<void> {
    const projectRoot = process.cwd();
    const cursorDir = path.join(projectRoot, ".cursor");
    fs.ensureDirSync(cursorDir);

    const mcpPath = path.join(cursorDir, "mcp.json");
    await fs.writeJson(mcpPath, { mcpServers: configs.projectMcp }, { spaces: 2 });
  }

  async scaffoldSkills(skills: SkillFile[]): Promise<void> {
    const projectRoot = process.cwd();
    for (const skill of skills) {
      // Cursor uses .cursor/rules/ for AI rules (similar to skills)
      const rulePath = skill.relativePath
        .replace(/^\.claude\/skills\//, ".cursor/rules/")
        .replace(/^\.claude\/commands\//, ".cursor/commands/");
      const destPath = path.join(projectRoot, rulePath);
      fs.ensureDirSync(path.dirname(destPath));
      await fs.writeFile(destPath, skill.content, "utf-8");
    }
  }
}

// ---- Continue.dev Adapter ----
export class ContinueAdapter implements PlatformAdapter {
  name = "continue";
  displayName = "Continue.dev (VS Code / JetBrains)";
  mcpConfigPath = path.join(homeDir(), ".continue", "config.json");
  mcpConfigFormat = "continue-config" as const;
  skillsBasePath = path.join(homeDir(), ".continue", "skills");
  commandsBasePath = path.join(homeDir(), ".continue", "commands");
  architectureBasePath = "docs/architecture";

  async installMCPs(configs: MCPConfigBundle): Promise<void> {
    const continueDir = path.join(homeDir(), ".continue");
    fs.ensureDirSync(continueDir);

    const configPath = path.join(continueDir, "config.json");
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        config = (await fs.readJson(configPath)) as Record<string, unknown>;
      } catch {
        // Gracefully handle malformed config — Continue will regenerate it
      }
    }

    config.mcpServers = {
      ...(config.mcpServers as Record<string, unknown> ?? {}),
      ...configs.projectMcp,
    };

    await fs.writeJson(configPath, config, { spaces: 2 });
  }

  async scaffoldSkills(skills: SkillFile[]): Promise<void> {
    for (const skill of skills) {
      const continuePath = skill.relativePath
        .replace(/^\.claude\//, "");
      const destPath = path.join(homeDir(), ".continue", continuePath);
      fs.ensureDirSync(path.dirname(destPath));
      await fs.writeFile(destPath, skill.content, "utf-8");
    }
  }
}

// ---- Adapter Registry ----
export const PLATFORM_ADAPTERS: Record<string, PlatformAdapter> = {
  "claude-code": new ClaudeCodeAdapter(),
  "claude-cli": new ClaudeCodeAdapter(), // same config format
  cursor: new CursorAdapter(),
  continue: new ContinueAdapter(),
};

export function getPlatformAdapter(name: string): PlatformAdapter | undefined {
  return PLATFORM_ADAPTERS[name];
}
