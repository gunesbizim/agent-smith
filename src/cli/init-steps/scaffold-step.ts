/**
 * scaffold-step — all scaffold, adapt, and source-dir operations for initCommand.
 * Groups Steps 5–11 (scaffold commands/skills, arch docs, sentrux install,
 * caveman compression, hooks, permissions, CI, source dir resolution).
 */
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "fs-extra";
import { scaffoldCommands } from "../../scaffold/commands.js";
import { scaffoldSkills } from "../../scaffold/skills.js";
import { scaffoldConfigs } from "../../scaffold/configs.js";
import { scaffoldHooks } from "../../scaffold/hooks.js";
import { scaffoldPermissions } from "../../scaffold/permissions.js";
import { scaffoldCI } from "../../scaffold/ci-workflow.js";
import { customizeSkills } from "../../adapt/skill-customizer.js";
import { writeArchitectureDocs } from "../../adapt/architecture-writer.js";
import { installSentrux } from "../../install/sentrux-installer.js";
import { cavemanCompress } from "../../adapt/caveman-compress.js";
import { resolveSourceDirs } from "../../analyze/source-dir.js";
import { writeSourceConfig } from "../../scaffold/source-config.js";
import type { TemplateVariables } from "../../shared/types.js";

// Re-export ProjectResult type shape used by callers (avoids direct import of analyze modules)
type ProjectResult = Parameters<typeof scaffoldPermissions>[1];

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

interface ScaffoldStepOptions {
  targetDir: string;
  templateVars: TemplateVariables;
  project: ProjectResult;
  platform: string;
  dryRun?: boolean;
  caveman?: boolean;
  auto?: boolean;
  noInterview?: boolean;
  llm?: boolean;
}

/** Runs all scaffold/adapt/install/hooks/source-dir steps. */
export async function runScaffoldStep(opts: ScaffoldStepOptions): Promise<void> {
  const { targetDir, templateVars, project, platform, dryRun, caveman, auto, noInterview, llm } = opts;

  // Step 5 — Scaffold commands
  const cmdSpinner = ora("Scaffolding commands...").start();
  await scaffoldCommands(targetDir, templateVars, dryRun);
  cmdSpinner.succeed("Commands scaffolded");

  // Step 6 — Scaffold skills
  const skillSpinner = ora("Scaffolding skills...").start();
  await scaffoldSkills(targetDir, templateVars, dryRun);
  skillSpinner.succeed("Skills scaffolded");

  // Step 7 — Customize skills
  const customizeSpinner = ora("Customizing skills for detected stack...").start();
  await customizeSkills(targetDir, templateVars, dryRun);
  customizeSpinner.succeed("Skills customized");

  // Step 8 — Write architecture docs
  const archDocSpinner = ora("Generating architecture documentation...").start();
  await writeArchitectureDocs(targetDir, templateVars, dryRun, {
    useLlm: llm !== false,
    project,
    onProgress: (m) => { archDocSpinner.text = m; },
  });
  archDocSpinner.succeed("Architecture docs written");

  // Step 8c — Install sentrux quality gate
  const sentruxRulesSpinner = ora("Installing sentrux quality gate (.sentrux/)...").start();
  if (dryRun) {
    sentruxRulesSpinner.info("sentrux install skipped (--dry-run)");
  } else {
    const sentruxInstall = await installSentrux(targetDir, templateVars);
    if (sentruxInstall.installed) {
      sentruxRulesSpinner.succeed(".sentrux/ installed (rules.toml + baseline.json)");
    } else {
      sentruxRulesSpinner.info(`sentrux: ${sentruxInstall.reason ?? "left existing config untouched"}`);
    }
  }

  // Step 8b — Caveman compression (if enabled)
  if (caveman && !dryRun) {
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

  // Step 10 — Write MCP configuration files
  const configSpinner = ora("Writing MCP configuration files...").start();
  await scaffoldConfigs(targetDir, platform, dryRun);
  configSpinner.succeed("MCP configurations written");

  // Step 10c — Resolve source directories
  const srcSpinner = ora("Resolving source directories...").start();
  const interactive = !auto && !noInterview && !dryRun;
  if (interactive) srcSpinner.stop();
  const sourceDirs = await resolveSourceDirs(targetDir, project, { interactive });
  await writeSourceConfig(targetDir, sourceDirs, dryRun);
  srcSpinner.succeed(`Source directories: ${sourceDirs.join(", ")}`);

  // Step 11 — Scaffold hooks, permissions, CI
  const hooksSpinner = ora("Setting up automation hooks...").start();
  await scaffoldHooks(targetDir, dryRun);
  await scaffoldPermissions(targetDir, project, dryRun);
  const ciWritten = await scaffoldCI(targetDir, templateVars, dryRun);
  hooksSpinner.succeed(`Automation hooks + permission policy${ciWritten ? " + CI workflow" : ""} configured`);

  if (!dryRun && platform === "claude-code") {
    console.log(chalk.gray(""));
  }
}
