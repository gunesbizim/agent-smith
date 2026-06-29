#!/usr/bin/env node
/**
 * SessionStart hook — runs agent-smith health check at the start of every session.
 * Injects diagnostic info as additional context for the LLM.
 *
 * Configure in .claude/settings.json:
 *   "SessionStart": [{ "hooks": [{ "type": "command", "command": "node hooks/session-start-doctor.js" }] }]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function cwd() {
  // The hook runs from the project root (Claude Code sets CWD to project root)
  return process.cwd();
}

function cmd(command) {
  try {
    return execSync(command, { encoding: "utf-8", timeout: 5000, cwd: cwd() }).trim();
  } catch {
    return null;
  }
}

// ---- Gather diagnostics ----

const report = {
  hookEventName: "SessionStart",
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeVersion: process.version,
  projectRoot: cwd(),
  checks: [],
};

// Git state
const branch = cmd("git branch --show-current 2>/dev/null");
const hasChanges = cmd("git diff --stat 2>/dev/null");
report.git = {
  branch: branch || "not a git repo",
  isRepo: !!branch,
  hasUncommittedChanges: !!hasChanges,
  latestCommit: cmd("git log --oneline -1 2>/dev/null") || "none",
};

// Project setup
const hasClaudeDir = fs.existsSync(path.join(cwd(), ".claude"));
const hasSkills = fs.existsSync(path.join(cwd(), ".claude", "skills"));
const hasCommands = fs.existsSync(path.join(cwd(), ".claude", "commands"));
const hasSettings = fs.existsSync(path.join(cwd(), ".claude", "settings.json"));
const hasArchDocs = fs.existsSync(path.join(cwd(), "docs", "architecture"));

report.setup = {
  hasClaudeDir,
  hasSkills,
  hasCommands,
  hasSettings,
  hasArchDocs,
  initialized: hasSkills && hasCommands,
};

// MCP health check
const mcpStatus = [];
const mcpServers = ["gitnexus", "git-memory", "sentrux"];
for (const server of mcpServers) {
  mcpStatus.push({
    server,
    installed: !!cmd(process.platform === "win32" ? `where ${server}` : `command -v ${server}`),
  });
}
report.mcp = mcpStatus;

// GitNexus index freshness
const gitnexusContext = cmd("gitnexus context 2>/dev/null");
report.gitnexus = {
  available: !!gitnexusContext,
  stale: gitnexusContext ? gitnexusContext.includes("stale") : false,
};

// Generate context for the LLM
let additionalContext = "";

if (report.setup.initialized) {
  additionalContext += `\n✓ Agent Smith skills are set up (${report.projectRoot}/.claude/)\n`;
} else {
  additionalContext += `\n⚠ Agent Smith not initialized — run \`npx agent-smith init\` to set up skills and MCPs.\n`;
}

// smith-mode — surface the execution-discipline skill every session so it is read by all
// agent-smith commands and skills. On tasks spanning multiple files/sources/sessions, the
// model should follow the staged loop instead of one-shotting.
const hasSmithMode = fs.existsSync(path.join(cwd(), ".claude", "skills", "smith-mode", "SKILL.md"));
if (hasSmithMode) {
  additionalContext += `\n▸ smith-mode is active. For any task spanning multiple files, sources, or sessions — and for every /as-* command and worker skill — follow .claude/skills/smith-mode/SKILL.md: write a numbered stage map first, delegate independent stages to subagents where available, verify each stage with a check that can actually fail (a test, a fetched source, a diff against spec — not "looks right"), and run a skeptical self-review before delivery. Skip it only for trivial single-pass tasks.\n`;
}

const missingMCPs = mcpStatus.filter((m) => !m.installed);
if (missingMCPs.length > 0) {
  additionalContext += `\n⚠ Missing MCPs: ${missingMCPs.map((m) => m.server).join(", ")}. Run \`npx agent-smith configure\`.\n`;
}

if (report.git.isRepo && report.git.hasUncommittedChanges) {
  additionalContext += `\n⚠ Uncommitted changes on branch "${report.git.branch}". Consider running /git when done.\n`;
  additionalContext += `Files changed:\n${hasChanges}\n`;
}

if (report.gitnexus.stale) {
  additionalContext += `\n⚠ GitNexus index is stale. Run \`npx gitnexus analyze\` to refresh.\n`;
}

// Sentrux baseline — save architectural quality gate at session start
const sentruxInstalled = mcpStatus.find((m) => m.server === "sentrux")?.installed;
if (sentruxInstalled) {
  const gateResult = cmd("sentrux gate --save .");
  if (gateResult !== null) {
    additionalContext += `\nsentrux baseline saved — architectural quality gate active; run \`sentrux gate .\` before commit.\n`;
  }
}

// Output must be JSON with hookSpecificOutput
const output = {
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: additionalContext.trim(),
  },
};

console.log(JSON.stringify(output));
