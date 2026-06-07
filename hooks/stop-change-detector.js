#!/usr/bin/env node
/**
 * Stop hook — detects uncommitted changes and documentation gaps at session end.
 *
 * The hook output is written to ~/.claude/stop-hook-output.json for the next
 * SessionStart hook to pick up and inject as context.
 *
 * Configure in .claude/settings.json:
 *   "Stop": [{ "hooks": [{ "type": "command", "command": "node hooks/stop-change-detector.js" }] }]
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function cwd() {
  return process.cwd();
}

function cmd(command) {
  try {
    return execSync(command, { encoding: "utf-8", timeout: 5000, cwd: cwd() }).trim();
  } catch {
    return null;
  }
}

// ---- Detect state ----

const report = {
  timestamp: new Date().toISOString(),
  projectRoot: cwd(),
  hasUncommittedChanges: false,
  changedBackendFiles: [] as string[],
  changedFrontendFiles: [] as string[],
  changedDocsFiles: [] as string[],
  suggestions: [] as string[],
};

// Check for uncommitted changes
const branch = cmd("git branch --show-current 2>/dev/null");
if (branch) {
  const diffFiles = cmd("git diff --name-only HEAD 2>/dev/null");
  const stagedFiles = cmd("git diff --staged --name-only 2>/dev/null");
  const untracked = cmd("git ls-files --others --exclude-standard 2>/dev/null");

  const allChanged = [...(diffFiles?.split("\n") ?? []), ...(stagedFiles?.split("\n") ?? []), ...(untracked?.split("\n") ?? [])].filter(Boolean);

  if (allChanged.length > 0) {
    report.hasUncommittedChanges = true;

    for (const file of allChanged) {
      if (file.startsWith("backend/") || file.includes("apps/") && (file.endsWith(".py") || file.endsWith(".go"))) {
        report.changedBackendFiles.push(file);
      }
      if (file.startsWith("frontend/") || (file.includes("apps/") && (file.endsWith(".tsx") || file.endsWith(".ts") || file.endsWith(".vue")))) {
        report.changedFrontendFiles.push(file);
      }
      if (file.startsWith("docs/") || file.endsWith(".md")) {
        report.changedDocsFiles.push(file);
      }
    }

    // Generate suggestions
    if (report.changedBackendFiles.length > 0 || report.changedFrontendFiles.length > 0) {
      report.suggestions.push("commit: uncommitted code changes — run /git to commit with conventional format");

      if (!report.changedDocsFiles.length && fs.existsSync(path.join(cwd(), ".claude", "commands", "documentation.md"))) {
        report.suggestions.push("docs: endpoints or views changed without doc updates — run /documentation latest");
      }
    }

    if (report.changedDocsFiles.length > 0 && report.changedBackendFiles.length === 0 && report.changedFrontendFiles.length === 0) {
      report.suggestions.push("commit: documentation-only changes ready to commit");
    }
  }
}

// Write state for SessionStart hook to pick up
const stateDir = path.join(os.homedir(), ".claude", "agent-smith");
try {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "last-session-state.json"),
    JSON.stringify(report, null, 2),
  );
} catch {}

// Output minimal — stop hooks don't need to inject context, just persist state
const output = {
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: report.suggestions.length > 0
      ? `\nAgent Smith: ${report.suggestions.join(" | ")}\n`
      : "",
  },
};

console.log(JSON.stringify(output));
