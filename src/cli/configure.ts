// configure command — MCP configuration only
import chalk from "chalk";
import ora from "ora";
import { checkDependencies } from "../install/dependency-checker.js";
import { configureMCPs, ensureGitignore, PLAYWRIGHT_OUTPUT_DIR } from "../install/mcp-installer.js";
import { installWithConsent } from "../install/install-flow.js";
import { setupObsidianVault } from "../install/obsidian-vault.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { detectProject } from "../analyze/project-detector.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

interface ConfigureOptions {
  mcp?: string;
  scope?: string;
  /** Approve MCP installs without prompting. */
  yes?: boolean;
  /** Commander maps `--no-install` to `install: false`. */
  install?: boolean;
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

  // Detect the stack first so install + config can both gate stack-specific
  // servers (browser/vuetify/laravel-boost) to projects they actually apply to.
  const project = await detectProject(cwd);

  // Consent-gate the install (shared flow with init). installMCPs renders the
  // cli-progress bar with the live command per server.
  const { consent } = await installWithConsent({ servers, project }, { yes: opts.yes, noInstall: opts.install === false });
  if (!consent.approved) {
    console.log(chalk.yellow(`\n⊘ Skipping MCP install — ${consent.reason}.`));
  }

  // Obsidian (local scope) needs a per-repo vault path. Ask for it at install
  // time — it is stored privately in ~/.claude.json, never committed — and
  // create the directory so the mcp-obsidian server can actually start.
  const vault = await setupObsidianVault(cwd, { interactive: true });
  if (vault.vaultPath && vault.created) {
    console.log(chalk.gray(`  Created Obsidian vault: ${vault.vaultPath}`));
  }

  const configSpinner = ora("Writing MCP configurations...").start();
  await configureMCPs(cwd, DEFAULT_TEMPLATE_VARS, "claude-code", false, project);
  await scaffoldConfigs(cwd, "claude-code");
  // Keep Playwright screenshot artifacts out of version control.
  ensureGitignore(cwd, [`${PLAYWRIGHT_OUTPUT_DIR}/`]);
  configSpinner.succeed("MCP configurations written — all servers (project, user, local) in .mcp.json");

  console.log(chalk.bold.green("\n✓ MCP configuration complete\n"));
}
