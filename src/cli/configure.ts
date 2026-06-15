// configure command — MCP configuration only
import readline from "node:readline";
import chalk from "chalk";
import ora from "ora";
import { checkDependencies } from "../install/dependency-checker.js";
import { installMCPs, configureMCPs, registerLocalMCPs, ensureGitignore, PLAYWRIGHT_OUTPUT_DIR } from "../install/mcp-installer.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { detectProject } from "../analyze/project-detector.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

/** Prompt once for a value on a TTY; returns "" when non-interactive or left blank. */
async function promptValue(message: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(message, resolve));
    return answer.trim();
  } finally {
    rl.close();
  }
}

interface ConfigureOptions {
  mcp?: string;
  scope?: string;
}

export async function configureCommand(opts: ConfigureOptions): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — MCP Configuration\n"));

  const depSpinner = ora("Checking dependencies...").start();
  const depResult = await checkDependencies();
  if (!depResult.ok) {
    depSpinner.fail("Missing dependencies — run `agent-smith init` first.");
    return;
  }
  depSpinner.succeed("Dependencies OK");

  const servers = opts.mcp ? opts.mcp.split(",").map((s) => s.trim()) : undefined;

  const installSpinner = ora("Installing MCP servers...").start();
  await installMCPs({ servers });
  installSpinner.succeed("MCP servers installed");

  // Obsidian (local scope) needs a per-repo vault path. Ask for it at install time —
  // it is stored privately in ~/.claude.json, never committed.
  if (!process.env.OBSIDIAN_VAULT_PATH) {
    const vault = await promptValue(
      chalk.white("\nObsidian vault path for this repo (absolute; blank to skip obsidian): "),
    );
    if (vault) process.env.OBSIDIAN_VAULT_PATH = vault;
  }

  const configSpinner = ora("Writing MCP configurations...").start();
  const project = await detectProject(cwd);
  await configureMCPs(cwd, DEFAULT_TEMPLATE_VARS, "claude-code", false, project);
  await scaffoldConfigs(cwd, "claude-code");
  // Keep Playwright screenshot artifacts out of version control.
  ensureGitignore(cwd, [`${PLAYWRIGHT_OUTPUT_DIR}/`]);
  configSpinner.succeed("MCP configurations written");

  // Register local-scope servers (e.g. obsidian) into ~/.claude.json for this repo.
  const localSpinner = ora("Registering local-scope MCP servers...").start();
  const { registered, skipped } = registerLocalMCPs(DEFAULT_TEMPLATE_VARS, "claude-code");
  if (registered.length > 0) {
    localSpinner.succeed(`Registered local MCP servers: ${registered.join(", ")}`);
  } else {
    const skippedNote = skipped.length ? ` (skipped: ${skipped.join(", ")})` : "";
    localSpinner.info(`No local MCP servers registered${skippedNote}`);
  }

  console.log(chalk.bold.green("\n✓ MCP configuration complete\n"));
}
