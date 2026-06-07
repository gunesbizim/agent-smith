// configure command — MCP configuration only
import chalk from "chalk";
import ora from "ora";
import { checkDependencies } from "../install/dependency-checker.js";
import { installMCPs, configureMCPs } from "../install/mcp-installer.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

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

  const configSpinner = ora("Writing MCP configurations...").start();
  await configureMCPs(cwd, DEFAULT_TEMPLATE_VARS, "claude-code");
  await scaffoldConfigs(cwd, "claude-code");
  configSpinner.succeed("MCP configurations written");

  console.log(chalk.bold.green("\n✓ MCP configuration complete\n"));
}
