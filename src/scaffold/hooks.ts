// Hook scaffolder — writes hook configuration to .claude/settings.json
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..");
}

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
  PostToolUse?: Array<{
    matcher: string;
    hooks: Array<{
      type: "command";
      command: string;
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
  PreCompact?: Array<{
    hooks: Array<{
      type: "command";
      command: string;
      statusMessage?: string;
    }>;
  }>;
  UserPromptSubmit?: Array<{
    hooks: Array<{
      type: "command";
      command: string;
      statusMessage?: string;
    }>;
  }>;
}

export function buildHookConfig(projectRoot: string, hooksDir: string): HookConfig {
  const doctorHook = path.join(hooksDir, "session-start-doctor.js");
  const permissionGuardHook = path.join(hooksDir, "pre-tool-permission-guard.js");
  const gitGuardHook = path.join(hooksDir, "pre-tool-git-guard.js");
  const sentruxGateHook = path.join(hooksDir, "pre-tool-sentrux-gate.js");
  const tddGateHook = path.join(hooksDir, "pre-tool-tdd-gate.js");
  const agentTelemetryHook = path.join(hooksDir, "post-tool-agent-telemetry.js");
  const changeDetectorHook = path.join(hooksDir, "stop-change-detector.js");
  const precompactHandoffHook = path.join(hooksDir, "pre-compact-handoff.js");
  const handoffNudgeHook = path.join(hooksDir, "user-prompt-handoff-nudge.js");

  return {
    UserPromptSubmit: [
      {
        hooks: [
          {
            // At ~60% context, inject a one-time suggestion to run /as-handoff. Fail-open; suggest only.
            type: "command",
            command: `node "${handoffNudgeHook}"`,
            statusMessage: "Agent Smith — checking context pressure...",
          },
        ],
      },
    ],
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
            command: `node "${permissionGuardHook}"`,
            timeout: 5000,
            statusMessage: "Agent Smith — enforcing permission policy...",
          },
          {
            type: "command",
            command: `node "${gitGuardHook}"`,
            timeout: 8000,
            statusMessage: "Agent Smith — enforcing git conventions...",
          },
          {
            // Runs BEFORE the sentrux gate: a red suite is the cheaper, harder failure to catch.
            // Fails open when no engine run is active, so manual (non-engine) commits are unaffected.
            type: "command",
            command: `node "${tddGateHook}"`,
            timeout: 8000,
            statusMessage: "Agent Smith — enforcing TDD gate (tests green)...",
          },
          {
            type: "command",
            command: `node "${sentruxGateHook}"`,
            timeout: 15000,
            statusMessage: "Agent Smith — enforcing Sentrux architecture baseline...",
          },
        ],
      },
      // Caveman: suspend before MemPalace or claude-memory writes
      // This ensures stored memories are in full English prose — readable in future sessions
      {
        matcher: "mcp__plugin_mempalace_mempalace__|mcp__serena__write_memory|mempalace_add_drawer|mempalace_diary_write|mempalace_kg_add|claude-memory",
        hooks: [
          {
            type: "command",
            command: `echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"Caveman mode: SUSPENDED for this memory operation. Write in full English prose — complete sentences, no abbreviations, no fragments. This ensures memory content is retrievable in future sessions."}}'`,
            statusMessage: "Suspending caveman for memory write...",
          },
        ],
      },
    ],
    PostToolUse: [
      {
        // Capture every tool call — Bash/Read/Edit/Write/Glob/Grep, Agent (subagent dispatches),
        // and all MCP tools (mcp__*) — so the dashboard has full tool visibility for interactive
        // sessions. The hook branches internally: Agent → agent_call_finished (richer model/token
        // data); all others → tool_call (lightweight isMcp/mcpServer/status record).
        matcher: ".*",
        hooks: [
          {
            type: "command",
            command: `node "${agentTelemetryHook}"`,
            statusMessage: "Agent Smith — recording tool-call telemetry...",
          },
        ],
      },
      {
        matcher: "mcp__plugin_mempalace_mempalace__|mcp__serena__write_memory|mempalace_add_drawer|mempalace_diary_write|mempalace_kg_add|claude-memory",
        hooks: [
          {
            type: "command",
            command: `echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"Caveman mode: RESUMED. Return to compressed communication style. Note: if caveman was OFF before this write, ignore this resume — stay in normal mode."}}'`,
            statusMessage: "Resuming caveman...",
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
    PreCompact: [
      {
        hooks: [
          {
            // Deterministic safety net: snapshot a handoff before compaction (the moment context is
            // most at risk). Fail-open — never blocks compaction. The `/as-handoff` skill is the
            // richer, on-demand path.
            type: "command",
            command: `node "${precompactHandoffHook}"`,
            statusMessage: "Agent Smith — snapshotting handoff before compaction...",
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
    const pkgHooksDir = path.join(getPackageRoot(), "hooks");

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
