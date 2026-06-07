// init command — full project bootstrap
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "fs-extra";
import { detectProject } from "../analyze/project-detector.js";
import { sniffArchitecture } from "../analyze/architecture-sniffer.js";
import { mapBestPractices } from "../analyze/best-practice-mapper.js";
import { scanPackages } from "../analyze/package-scanner.js";
import { checkDependencies } from "../install/dependency-checker.js";
import { installMCPs, configureMCPs } from "../install/mcp-installer.js";
import { scaffoldCommands } from "../scaffold/commands.js";
import { scaffoldSkills } from "../scaffold/skills.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { scaffoldHooks } from "../scaffold/hooks.js";
import { customizeSkills } from "../adapt/skill-customizer.js";
import { writeArchitectureDocs } from "../adapt/architecture-writer.js";
import type { TemplateVariables } from "../shared/types.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

interface InitOptions {
  platform?: string;
  auto?: boolean;
  dryRun?: boolean;
  dir?: string;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const platform = opts.platform || "claude-code";

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Project Initialization\n"));
  console.log(chalk.gray(`  Platform: ${platform}`));
  console.log(chalk.gray(`  Target:   ${cwd}\n`));

  // Step 1 — Check dependencies
  const depSpinner = ora("Checking system dependencies...").start();
  const depResult = await checkDependencies();
  if (!depResult.ok) {
    depSpinner.fail("Missing dependencies:");
    for (const d of depResult.missing) {
      console.log(chalk.red(`  ✗ ${d.name} — ${d.installHint}`));
    }
    console.log(chalk.yellow("\nInstall missing dependencies and re-run."));
    return;
  }
  depSpinner.succeed(`Node ${depResult.nodeVersion}, npm ${depResult.npmVersion}, git ${depResult.gitVersion}`);

  // Step 2 — Detect project
  const detectSpinner = ora("Analyzing project structure...").start();
  const project = await detectProject(cwd);
  detectSpinner.succeed(
    `Detected: ${project.backend?.framework ?? "no backend"} / ${project.frontend?.framework ?? "no frontend"}`,
  );

  // Step 3 — Sniff architecture
  const archSpinner = ora("Sniffing architecture conventions...").start();
  const patterns = await sniffArchitecture(cwd, project);
  archSpinner.succeed(`Found ${patterns.length} architectural patterns`);

  // Step 4 — Map best practices
  const bpSpinner = ora("Mapping best practices...").start();
  const packageUsage = await scanPackages(cwd);
  const templateVars: TemplateVariables = mapBestPractices(project, patterns, DEFAULT_TEMPLATE_VARS, packageUsage);
  bpSpinner.succeed("Best practices mapped");

  // Step 5 — Scaffold commands
  const cmdSpinner = ora("Scaffolding commands...").start();
  const targetDir = cwd;
  await scaffoldCommands(targetDir, templateVars, opts.dryRun);
  cmdSpinner.succeed("Commands scaffolded");

  // Step 6 — Scaffold skills
  const skillSpinner = ora("Scaffolding skills...").start();
  await scaffoldSkills(targetDir, templateVars, opts.dryRun);
  skillSpinner.succeed("Skills scaffolded");

  // Step 7 — Customize skills
  const customizeSpinner = ora("Customizing skills for detected stack...").start();
  await customizeSkills(targetDir, templateVars, opts.dryRun);
  customizeSpinner.succeed("Skills customized");

  // Step 8 — Write architecture docs
  const archDocSpinner = ora("Generating architecture documentation...").start();
  await writeArchitectureDocs(targetDir, templateVars, opts.dryRun);
  archDocSpinner.succeed("Architecture docs written");

  // Step 9 — Install MCPs
  const mcpSpinner = ora("Configuring MCP servers...").start();
  await configureMCPs(targetDir, templateVars, platform, opts.dryRun);
  mcpSpinner.succeed("MCP configs written");

  // Step 10 — Write MCP configs
  const configSpinner = ora("Writing MCP configuration files...").start();
  await scaffoldConfigs(targetDir, platform, opts.dryRun);
  configSpinner.succeed("MCP configurations written");

  // Step 11 — Scaffold hooks
  const hooksSpinner = ora("Setting up automation hooks...").start();
  await scaffoldHooks(targetDir, opts.dryRun);
  hooksSpinner.succeed("Automation hooks configured");

  console.log(chalk.bold.green("\n✓ Agent Smith initialized successfully!\n"));
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Restart Claude Code to load new MCP servers, skills, and hooks"));
  console.log(chalk.gray("  2. Hooks will auto-check health on session start, guard git ops, detect changes on stop"));
  console.log(chalk.gray("  3. Try: /backend 'add a health endpoint'"));
  console.log(chalk.gray("  4. Try: /frontend 'create a dashboard view'"));
  console.log(chalk.gray("  5. Run: npx agent-smith doctor for health check\n"));
}
