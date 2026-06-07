#!/usr/bin/env node
/**
 * PreToolUse hook — intercepts git operations and enforces project conventions.
 *
 * Guards:
 * - Before git commit: validates conventional commit format
 * - Before git push: reminds about pre-push gates
 * - Before destructive operations: warns and pauses
 *
 * Configure in .claude/settings.json:
 *   "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node hooks/pre-tool-git-guard.js" }] }]
 *
 * The hook reads tool_input from stdin (Claude Code passes full tool call context).
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function cwd() {
  return process.cwd();
}

// Read tool input from stdin
let toolInput = "";
try {
  toolInput = fs.readFileSync(0, "utf-8").trim();
} catch {
  // No stdin — skip
}

// Parse the tool call from stdin
let toolCall = {};
try {
  if (toolInput) {
    toolCall = JSON.parse(toolInput);
  }
} catch {
  // Not valid JSON — skip
}

const command = toolCall.tool_input?.command || toolCall.command || "";

// Only intercept git commands
if (!command.includes("git ")) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse" } }));
  process.exit(0);
}

let additionalContext = "";

// ---- Pre-commit: validate format ----
if (command.includes("git commit")) {
  const hasSpec = fs.existsSync(path.join(cwd(), "commitlint.config.js"));
  const hasArch = fs.existsSync(path.join(cwd(), "docs", "architecture"));

  if (hasSpec || hasArch) {
    additionalContext += `\n⚠ Before committing:\n`;
    additionalContext += `- Use conventional commits: type(scope): description\n`;
    additionalContext += `- Types: feat | fix | docs | test | chore | refactor | style | perf | ci\n`;
    additionalContext += `- Subject ≤ 72 characters\n`;

    // Check pre-push gates if backend/frontend dirs exist
    const hasBackend = fs.existsSync(path.join(cwd(), "backend")) || fs.existsSync(path.join(cwd(), "apps"));
    const hasFrontend = fs.existsSync(path.join(cwd(), "frontend")) || fs.existsSync(path.join(cwd(), "apps"));
    const prePushFile = path.join(cwd(), "docs", "architecture", "backend-architecture.md");

    if ((hasBackend || hasFrontend) && fs.existsSync(prePushFile)) {
      const archContent = fs.readFileSync(prePushFile, "utf-8");
      const gateMatch = archContent.match(/## Pre-push CI Gates[\s\S]*?```bash\s*\n([\s\S]*?)```/);
      if (gateMatch) {
        additionalContext += `\nPre-push gates (run before pushing):\n\`\`\`bash\n${gateMatch[1].trim()}\n\`\`\`\n`;
        additionalContext += `Run these gates before pushing. If they fail, fix before pushing.`;
      }
    }
  }
}

// ---- Pre-push: reminder ----
if (command.includes("git push")) {
  additionalContext += `\n⚠ Pushing to remote. Confirm:\n`;
  additionalContext += `- All pre-push gates pass (lint, type-check, tests)\n`;
  additionalContext += `- Documentation is updated (/documentation latest)\n`;
  additionalContext += `- PR is ready for review (/pr-review)\n`;
}

// ---- Pre-rebase/reset: warn ----
if (command.includes("git rebase") || (command.includes("git reset") && command.includes("--hard"))) {
  additionalContext += `\n⚠ DESTRUCTIVE GIT OPERATION: \`${command.split("\n")[0]}\`\n`;
  additionalContext += `This rewrites history. Confirm with the user before proceeding.\n`;
}

const output = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: additionalContext.trim() || undefined,
  },
};

console.log(JSON.stringify(output));
