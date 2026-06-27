/**
 * install-step — MCP install consent, MCP config, Obsidian vault, local MCPs, CLAUDE.md.
 * Groups Steps 9–12 of initCommand.
 */
import chalk from "chalk";
import ora from "ora";
import { configureMCPs, registerLocalMCPs } from "../../install/mcp-installer.js";
import { installWithConsent } from "../../install/install-flow.js";
import { setupObsidianVault } from "../../install/obsidian-vault.js";
import { writeClaudeMd } from "../../adapt/claude-md-writer.js";
import type { TemplateVariables } from "../../shared/types.js";

// Minimal type alias to avoid a direct import of analyze-project just for the shape
type ProjectArg = Parameters<typeof installWithConsent>[0]["project"];

interface InstallStepOptions {
  targetDir: string;
  templateVars: TemplateVariables;
  project: ProjectArg;
  platform: string;
  dryRun?: boolean;
  yes?: boolean;
  install?: boolean;
  auto?: boolean;
  noInterview?: boolean;
}

/** Runs MCP install, config, Obsidian setup, local MCP registration, and CLAUDE.md write. */
export async function runInstallStep(opts: InstallStepOptions): Promise<void> {
  const { targetDir, templateVars, project, platform, dryRun, yes, install, auto, noInterview } = opts;

  // Step 9 — Install MCP server binaries (consent-gated)
  if (!dryRun) {
    const { consent } = await installWithConsent(
      { project },
      { yes, noInstall: install === false, auto },
    );
    if (!consent.approved) {
      console.log(chalk.yellow(`  ⊘ Skipping MCP install — ${consent.reason}.`));
      console.log(chalk.gray("    Run `agent-smith configure` later to install them."));
    }
  }

  // Step 9b — Write the MCP configuration bundle
  const mcpSpinner = ora("Configuring MCP servers...").start();
  await configureMCPs(targetDir, templateVars, platform, dryRun, project);
  mcpSpinner.succeed("MCP servers configured");

  // Step 10d — Register local-scope MCP servers (obsidian) + create vault
  if (!dryRun && platform === "claude-code") {
    const interactive = !auto && !noInterview;
    const vault = await setupObsidianVault(targetDir, { interactive });
    if (vault.vaultPath && vault.created) {
      console.log(chalk.gray(`  Created Obsidian vault: ${vault.vaultPath}`));
    }
    const localSpinner = ora("Registering local-scope MCP servers...").start();
    const { registered, skipped } = registerLocalMCPs(templateVars, platform);
    if (registered.length > 0) {
      localSpinner.succeed(`Registered local MCP servers: ${registered.join(", ")}`);
    } else {
      const skippedNote = skipped.length ? ` (skipped: ${skipped.join(", ")})` : "";
      localSpinner.info(`No local MCP servers registered${skippedNote}`);
    }
  }

  // Step 12 — Write/refresh CLAUDE.md managed block
  const claudeMdSpinner = ora("Writing CLAUDE.md (agent-smith managed block)...").start();
  const claudeMd = writeClaudeMd(targetDir, dryRun);
  claudeMdSpinner.succeed(`CLAUDE.md ${claudeMd.created ? "created" : "updated"} (commands + skills documented)`);
}
