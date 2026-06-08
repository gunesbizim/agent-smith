// Write MCP configuration files for the target platform
import path from "node:path";
import fs from "fs-extra";
import { homeDir } from "../shared/platform-utils.js";

export async function scaffoldConfigs(
  targetDir: string,
  platform: string = "claude-code",
  dryRun: boolean = false,
): Promise<void> {
  if (dryRun) {
    console.log(`  Would write MCP configs for platform: ${platform}`);
    return;
  }

  // .claude/settings.json and .mcp.json are already written by configureMCPs in mcp-installer.ts
  // This function handles additional platform-specific config scaffolding

  if (platform === "cursor") {
    const cursorMcpDir = path.join(targetDir, ".cursor");
    fs.ensureDirSync(cursorMcpDir);

    // Cursor uses .cursor/mcp.json instead of .claude/settings.json
    // Copy from .claude/settings.json if it exists
    const claudeSettings = path.join(targetDir, ".claude", "settings.json");
    const cursorMcp = path.join(cursorMcpDir, "mcp.json");
    if (fs.existsSync(claudeSettings) && !fs.existsSync(cursorMcp)) {
      fs.copySync(claudeSettings, cursorMcp);
    }
  }

  if (platform === "continue") {
    // Continue.dev config lives at ~/.continue/config.json
    // Merge MCP servers into their format
    const continueDir = path.join(homeDir(), ".continue");
    fs.ensureDirSync(continueDir);
  }
}
