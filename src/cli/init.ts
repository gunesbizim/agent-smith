// init command — full project bootstrap
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "fs-extra";
import { detectProject } from "../analyze/project-detector.js";
import { sniffArchitecture, probeSentrux } from "../analyze/architecture-sniffer.js";
import { mapBestPractices } from "../analyze/best-practice-mapper.js";
import { refineWithLlm } from "../analyze/llm-analyzer.js";
import { resolveSourceDirs, writeSourceConfig } from "../analyze/source-dir.js";
import { scanPackages } from "../analyze/package-scanner.js";
import { runInterview, applyInterviewAnswers } from "../adapt/project-interview.js";
import { checkDependencies } from "../install/dependency-checker.js";
import { installMCPs, configureMCPs } from "../install/mcp-installer.js";
import { scaffoldCommands } from "../scaffold/commands.js";
import { scaffoldSkills } from "../scaffold/skills.js";
import { scaffoldConfigs } from "../scaffold/configs.js";
import { scaffoldHooks } from "../scaffold/hooks.js";
import { customizeSkills } from "../adapt/skill-customizer.js";
import { writeArchitectureDocs, writeSentruxRules } from "../adapt/architecture-writer.js";
import { cavemanCompress } from "../adapt/caveman-compress.js";
import type { TemplateVariables } from "../shared/types.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

// Walk a directory recursively, returning all file paths
function walkFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

interface InitOptions {
  platform?: string;
  auto?: boolean;
  dryRun?: boolean;
  dir?: string;
  caveman?: boolean;
  noInterview?: boolean;
  llm?: boolean;
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

  // Step 2 — Detect project (optionally refined by an LLM pass with --llm)
  const detectSpinner = ora("Analyzing project structure...").start();
  let project = await detectProject(cwd);
  if (opts.llm) {
    detectSpinner.text = "Refining analysis with Claude...";
    const refined = refineWithLlm(cwd, project);
    project = refined.project;
    if (!refined.usedLlm) {
      detectSpinner.warn(`LLM refinement skipped: ${refined.reason}`);
      detectSpinner.start();
    }
  }
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
  let templateVars: TemplateVariables = mapBestPractices(project, patterns, DEFAULT_TEMPLATE_VARS, packageUsage);
  bpSpinner.succeed("Best practices mapped");

  // Step 4c — Sentrux probe (live scan to seed rules.toml thresholds)
  const sentruxSpinner = ora("Probing architecture quality (sentrux scan)...").start();
  const sentruxProbe = await probeSentrux(cwd);
  if (sentruxProbe.available) {
    const cycles = sentruxProbe.cycles ?? 0;

    if (cycles === 0) {
      // Enforce mode: zero cycles now → keep it that way
      templateVars.SENTRUX_MAX_CYCLES = "0";
      sentruxSpinner.succeed(
        `sentrux: max_cycles=0 (enforce mode) — 0 cycles detected, quality_signal=${sentruxProbe.qualitySignal ?? "n/a"}`,
      );
    } else {
      // Ratchet mode: existing debt → lock current count, block increases
      templateVars.SENTRUX_MAX_CYCLES = String(cycles);
      sentruxSpinner.warn(
        `sentrux: max_cycles=0 would FAIL now (${cycles} cycle${cycles === 1 ? "" : "s"}) → seeding max_cycles=${cycles} (ratchet)`,
      );
    }

    if (sentruxProbe.maxCC != null) {
      templateVars.SENTRUX_MAX_CC = String(sentruxProbe.maxCC);
    }
    if (sentruxProbe.couplingGrade != null) {
      templateVars.SENTRUX_MAX_COUPLING = sentruxProbe.couplingGrade;
    }
  } else {
    // Probe failed (binary missing or scan error) — advisory mode
    templateVars.SENTRUX_MAX_CYCLES = "unknown";
    sentruxSpinner.warn(
      "sentrux not available — rules.toml will have max_cycles commented out (advisory mode). Install sentrux and re-run.",
    );
  }

  // Step 4b — Interactive interview (unless --auto or --no-interview)
  let interviewAnswers = null;
  if (!opts.auto && !opts.noInterview && !opts.dryRun) {
    const sentruxForInterview = sentruxProbe.available
      ? { cycles: sentruxProbe.cycles, maxCC: sentruxProbe.maxCC }
      : undefined;
    try {
      interviewAnswers = await runInterview(cwd, project, sentruxForInterview);
      if (interviewAnswers) {
        templateVars = applyInterviewAnswers(templateVars, interviewAnswers);
      }
    } catch (err) {
      console.log(chalk.yellow(`\n  Interview skipped: ${err instanceof Error ? err.message : err}`));
    }
    console.log(chalk.gray(""));
  } else if (opts.auto || opts.noInterview) {
    console.log(chalk.gray("  Interview: skipped (--auto or --no-interview)"));
  }

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

  // Step 8c — Write .sentrux/rules.toml
  const sentruxRulesSpinner = ora("Writing .sentrux/rules.toml...").start();
  await writeSentruxRules(targetDir, templateVars, opts.dryRun);
  sentruxRulesSpinner.succeed(".sentrux/rules.toml written");

  // Step 8b — Caveman compression (if enabled)
  if (opts.caveman && !opts.dryRun) {
    const cavemanSpinner = ora("Applying caveman compression...").start();
    const skillDir = path.join(targetDir, ".claude", "skills");
    const archDir = path.join(targetDir, "docs", "architecture");
    for (const dir of [skillDir, archDir]) {
      if (fs.existsSync(dir)) {
        for (const file of walkFiles(dir)) {
          if (file.endsWith(".md")) {
            const content = await fs.readFile(file, "utf-8");
            const compressed = cavemanCompress(content);
            await fs.writeFile(file, compressed, "utf-8");
          }
        }
      }
    }
    cavemanSpinner.succeed("Caveman compression applied (~75% token savings)");
  }

  // Step 9 — Install MCPs (stack-aware: browser MCPs only when a frontend exists)
  const mcpSpinner = ora("Configuring MCP servers...").start();
  await configureMCPs(targetDir, templateVars, platform, opts.dryRun, project);
  mcpSpinner.succeed("MCP servers configured");

  // Step 10 — Write MCP configs
  const configSpinner = ora("Writing MCP configuration files...").start();
  await scaffoldConfigs(targetDir, platform, opts.dryRun);
  configSpinner.succeed("MCP configurations written");

  // Step 10c — Resolve source directories (for layout-agnostic change detection in hooks)
  const srcSpinner = ora("Resolving source directories...").start();
  const interactive = !opts.auto && !opts.noInterview && !opts.dryRun;
  if (interactive) srcSpinner.stop(); // release the spinner so the prompt is readable
  const sourceDirs = await resolveSourceDirs(targetDir, project, { interactive });
  await writeSourceConfig(targetDir, sourceDirs, opts.dryRun);
  srcSpinner.succeed(`Source directories: ${sourceDirs.join(", ")}`);

  // Step 11 — Scaffold hooks
  const hooksSpinner = ora("Setting up automation hooks...").start();
  await scaffoldHooks(targetDir, opts.dryRun);
  hooksSpinner.succeed("Automation hooks configured");

  console.log(chalk.bold.green("\n✓ Agent Smith initialized successfully!\n"));
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Restart Claude Code to load new MCP servers, skills, and hooks"));
  console.log(chalk.gray("  2. Hooks will auto-check health on session start, guard git ops, detect changes on stop"));
  console.log(chalk.gray("  3. Try: /as-backend 'add a health endpoint'"));
  console.log(chalk.gray("  4. Try: /as-frontend 'create a dashboard view'"));
  console.log(chalk.gray("  5. Run: npx agent-smith doctor for health check\n"));
}
