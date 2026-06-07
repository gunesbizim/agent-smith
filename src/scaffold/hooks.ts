// Hook scaffolder — writes hook configuration to .claude/settings.json
import path from "node:path";
import fs from "fs-extra";

export interface HookConfig {
  SessionStart?: Array<{
    hooks: Array<{
      type: "command";
      command: string;
      statusMessage?: string;
    }>;
  }>;
  PreToolUse?: Array<{
    matcher: string;
    hooks: Array<{
      type: "command";
      command: string;
      timeout?: number;
      statusMessage?: string;
    }>;
  }>;
  Stop?: Array<{
    hooks: Array<{
      type: "command";
      command: string;
      statusMessage?: string;
    }>;
  }>;
}

export function buildHookConfig(projectRoot: string, hooksDir: string): HookConfig {
  const doctorHook = path.join(hooksDir, "session-start-doctor.js");
  const gitGuardHook = path.join(hooksDir, "pre-tool-git-guard.js");
  const changeDetectorHook = path.join(hooksDir, "stop-change-detector.js");

  return {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${doctorHook}"`,
            statusMessage: "Agent Smith — checking project health...",
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `node "${gitGuardHook}"`,
            timeout: 8000,
            statusMessage: "Agent Smith — enforcing git conventions...",
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${changeDetectorHook}"`,
            statusMessage: "Agent Smith — checking for uncommitted changes...",
          },
        ],
      },
    ],
  };
}

export async function scaffoldHooks(
  projectRoot: string,
  dryRun: boolean = false,
): Promise<void> {
  const hooksDir = path.join(projectRoot, "hooks");

  if (!dryRun) {
    // Copy hook scripts from package to project
    const pkgHooksDir = path.join(
      new URL("..", import.meta.url).pathname,
      "..",
      "hooks",
    );

    // Try to copy from npm package location
    try {
      if (fs.existsSync(pkgHooksDir)) {
        fs.ensureDirSync(hooksDir);
        fs.copySync(pkgHooksDir, hooksDir, { overwrite: true });
      }
    } catch {
      // Fallback: hooks are already in the project or will be created manually
    }
  }

  // Merge hook config into .claude/settings.json
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  if (!dryRun && fs.existsSync(settingsPath)) {
    const hookConfig = buildHookConfig(projectRoot, hooksDir);

    const settings = (await fs.readJson(settingsPath)) as Record<string, unknown>;
    settings.hooks = {
      ...(settings.hooks as Record<string, unknown> ?? {}),
      ...hookConfig,
    };

    await fs.writeJson(settingsPath, settings, { spaces: 2 });
  } else if (dryRun) {
    console.log(`  Would scaffold hooks to: ${hooksDir}`);
    console.log(`  Would merge hook config into: ${settingsPath}`);
  }
}
