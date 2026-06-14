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
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Read the hook input (JSON on stdin). Stop hooks receive `stop_hook_active`,
// which is true once a stop-hook cycle is already underway. Injecting
// additionalContext again on every stop re-prompts the model and creates an
// infinite stop-loop, so when it's set we return success immediately and let
// the turn end. The suggestions still surface on the first (stop_hook_active
// false) fire.
let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf-8");
  if (raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // No/invalid stdin — proceed as a normal first fire.
}

if (hookInput.stop_hook_active) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: "" },
    }),
  );
  process.exit(0);
}

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
  changedBackendFiles: [],
  changedFrontendFiles: [],
  changedDocsFiles: [],
  suggestions: [],
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
      if ((file.startsWith("backend/") || file.includes("apps/")) && (file.endsWith(".py") || file.endsWith(".go"))) {
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

// Sentrux architectural quality gate — compare against saved baseline
const sentruxInstalled = !!(cmd(process.platform === "win32" ? "where sentrux" : "command -v sentrux"));
if (sentruxInstalled) {
  let gateOutput = null;
  let gateExitCode = 0;
  try {
    gateOutput = execSync("sentrux gate .", { encoding: "utf-8", timeout: 15000, cwd: cwd() }).trim(); // NOSONAR
  } catch (err) {
    gateExitCode = err.status ?? 1;
    gateOutput = err.stdout ? err.stdout.trim() : null;
  }
  if (gateExitCode !== 0) {
    report.suggestions.push("sentrux: architectural quality regressed this session — run `sentrux gate .` for details");
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
