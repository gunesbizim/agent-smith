// doctor command — health check for the agent-smith installation
import chalk from "chalk";

import fs from "fs-extra";
import path from "node:path";
import { checkDependencies } from "../install/dependency-checker.js";
import { commandExists } from "../shared/platform-utils.js";
import type { HealthCheck } from "../shared/types.js";

export async function doctorCommand(): Promise<void> {
  const cwd = process.cwd();
  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Health Check\n"));

  const checks: HealthCheck[] = [];

  // System dependencies
  const deps = await checkDependencies();
  checks.push({
    name: "node",
    status: deps.checks.node ? "pass" : "fail",
    message: deps.checks.node ? `Node ${deps.nodeVersion}` : "Node not found",
  });
  checks.push({
    name: "npm",
    status: deps.checks.npm ? "pass" : "fail",
    message: deps.checks.npm ? `npm ${deps.npmVersion}` : "npm not found",
  });
  checks.push({
    name: "git",
    status: deps.checks.git ? "pass" : "fail",
    message: deps.checks.git ? `git ${deps.gitVersion}` : "git not found",
  });
  checks.push({
    name: "python",
    status: deps.checks.python ? "pass" : "warn",
    message: deps.checks.python ? "Python found" : "Python not found (needed for serena, mempalace)",
  });
  checks.push({
    name: "gh-cli",
    status: deps.checks["gh-cli"] ? "pass" : "warn",
    message: deps.checks["gh-cli"] ? "GitHub CLI found" : "gh not found — PR creation unavailable",
    suggestion: deps.checks["gh-cli"] ? undefined : "brew install gh && gh auth login",
  });

  // MCP servers
  const mcpServers = ["gitnexus", "git-memory", "serena", "sentrux"];
  for (const server of mcpServers) {
    if (commandExists(server)) {
      checks.push({ name: `mcp:${server}`, status: "pass", message: `${server} installed` });
    } else {
      checks.push({
        name: `mcp:${server}`,
        status: "fail",
        message: `${server} not found in PATH`,
        suggestion: `npm i -g ${server}`,
      });
    }
  }

  // Config files
  const configFiles = [
    [".claude/settings.json", "Claude Code project settings"],
    [".mcp.json", "Project MCP config"],
    [".claude/commands/backend.md", "Backend command"],
    [".claude/commands/frontend.md", "Frontend command"],
    [".claude/skills/pr-review-backend/SKILL.md", "PR review backend skill"],
    [".claude/skills/docs-frontend/SKILL.md", "Docs frontend skill"],
    [".sentrux/rules.toml", "Sentrux architectural rules"],
  ];
  for (const [relPath, label] of configFiles) {
    const exists = fs.existsSync(path.join(cwd, relPath));
    checks.push({
      name: `config:${relPath}`,
      status: exists ? "pass" : "warn",
      message: exists ? `${label} exists` : `${label} missing`,
      suggestion: exists ? undefined : "Run `agent-smith init` to scaffold",
    });
  }

  // Git state
  try {
    const { execSync } = await import("node:child_process");
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    const isRepo = branch !== "";
    checks.push({
      name: "git-repo",
      status: isRepo ? "pass" : "fail",
      message: isRepo ? `On branch: ${branch}` : "Not a git repository",
    });
  } catch {
    checks.push({ name: "git-repo", status: "fail", message: "Not a git repository" });
  }

  // Print report
  let overall: "healthy" | "degraded" | "unhealthy" = "healthy";
  let fails = 0;
  let warns = 0;

  for (const check of checks) {
    const icon = check.status === "pass" ? chalk.green("✓") : check.status === "warn" ? chalk.yellow("⚠") : chalk.red("✗");
    console.log(`  ${icon} ${check.name.padEnd(30)} ${check.message}`);
    if (check.suggestion) {
      console.log(`    ${chalk.gray(check.suggestion)}`);
    }
    if (check.status === "fail") fails++;
    if (check.status === "warn") warns++;
  }

  if (fails > 0) overall = "unhealthy";
  else if (warns > 0) overall = "degraded";

  console.log("");
  const statusColor = overall === "healthy" ? chalk.green : overall === "degraded" ? chalk.yellow : chalk.red;
  console.log(statusColor.bold(`Overall: ${overall.toUpperCase()}`));
  console.log("");
}
