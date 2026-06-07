// analyze command — project detection and report
import chalk from "chalk";
import ora from "ora";
import { detectProject } from "../analyze/project-detector.js";
import { sniffArchitecture } from "../analyze/architecture-sniffer.js";
import { mapBestPractices } from "../analyze/best-practice-mapper.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

interface AnalyzeOptions {
  json?: boolean;
}

export async function analyzeCommand(opts: AnalyzeOptions): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora("Analyzing project...").start();

  const project = await detectProject(cwd);
  const patterns = await sniffArchitecture(cwd, project);
  const vars = mapBestPractices(project, patterns, DEFAULT_TEMPLATE_VARS);

  spinner.succeed("Analysis complete");

  if (opts.json) {
    console.log(JSON.stringify({ project, patterns, templateVariables: vars }, null, 2));
    return;
  }

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Project Analysis\n"));

  // Backend
  if (project.backend) {
    console.log(chalk.bold("\nBackend:"));
    console.log(`  Framework:  ${project.backend.framework} (${project.backend.language} ${project.backend.languageVersion})`);
    console.log(`  ORM:        ${project.backend.orm ?? "none detected"}`);
    console.log(`  Imports:    ${project.backend.importStyle}`);
    console.log(`  Auth:       ${project.backend.authMethod}`);
    console.log(`  Roles:      ${project.backend.rolePattern}`);
    console.log(`  Logging:    ${project.backend.loggingPattern}`);
    console.log(`  Hexagonal:  ${project.backend.hasHexagonalArch ? "yes" : "no"}`);
    console.log(`  Service/Repo: ${project.backend.hasServiceRepo ? "yes" : "no"}`);
  } else {
    console.log(chalk.bold("\nBackend: none detected"));
  }

  // Frontend
  if (project.frontend) {
    console.log(chalk.bold("\nFrontend:"));
    console.log(`  Framework:  ${project.frontend.framework}`);
    console.log(`  UI Library: ${project.frontend.uiLibrary ?? "none"}`);
    console.log(`  State:      ${project.frontend.stateManagement ?? "none"}`);
    console.log(`  TypeScript: ${project.frontend.usesTypeScript ? "yes" : "no"}`);
    console.log(`  i18n:       ${project.frontend.usesI18n ? project.frontend.i18nLibrary : "none"}`);
    console.log(`  Role-aware: ${project.frontend.roleAwareUI ? "yes" : "no"}`);
  } else {
    console.log(chalk.bold("\nFrontend: none detected"));
  }

  // Testing
  console.log(chalk.bold("\nTesting:"));
  console.log(`  Backend:  ${project.testing.backend?.command ?? "none"}`);
  console.log(`  Frontend: ${project.testing.frontend?.command ?? "none"}`);

  // Linting
  console.log(chalk.bold("\nLinting:"));
  console.log(`  Backend:  ${project.linting.backend?.command ?? "none"}`);
  console.log(`  Frontend: ${project.linting.frontend?.command ?? "none"}`);

  // Database
  if (project.database) {
    console.log(chalk.bold("\nDatabase:"));
    console.log(`  Engine: ${project.database.engine}`);
    console.log(`  ORM:    ${project.database.orm ?? "none"}`);
  }

  // CI/CD
  if (project.cicd) {
    console.log(chalk.bold("\nCI/CD:"));
    console.log(`  Provider: ${project.cicd.provider}`);
    console.log(`  Config:   ${project.cicd.configPath}`);
  }

  // Template variables
  console.log(chalk.bold("\nTemplate Variables (for skill customization):"));
  for (const [key, value] of Object.entries(vars).slice(0, 16)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log("");
}
