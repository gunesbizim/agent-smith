// analyze command — project detection and report
import chalk from "chalk";
import ora from "ora";
import { analyzeProject } from "../analyze/analyze-project.js";

interface AnalyzeOptions {
  json?: boolean;
  llm?: boolean;
}

export async function analyzeCommand(opts: AnalyzeOptions): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora("Analyzing project...").start();

  // B11 — one shared analysis builder (also runs scanPackages, which analyze used to skip),
  // so `analyze --json` is a faithful preview of what `init` scaffolds.
  const { project, patterns, packageUsage, stackProfile, templateVars: vars, llmRefined, llmReason } =
    await analyzeProject(cwd, { useLlm: opts.llm });
  let llmNote: string | undefined;
  if (opts.llm) {
    llmNote = llmRefined ? "refined by Claude" : `programmatic (${llmReason})`;
  }

  spinner.succeed(llmNote ? `Analysis complete — ${llmNote}` : "Analysis complete");

  if (opts.json) {
    console.log(JSON.stringify({ project, patterns, packageUsage, stackProfile, templateVariables: vars }, null, 2));
    return;
  }

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Project Analysis\n"));

  // Project type
  const typeLabels: Record<string, string> = {
    "web-app": "🌐 Web Application",
    "cli-tool": "⚒ CLI Tool",
    "library": "📦 Library/Package",
    "monorepo": "🗂 Monorepo",
    "unknown": "❓ Unknown",
  };
  console.log(chalk.bold(`Project Type: ${typeLabels[project.projectType] || project.projectType}`));
  console.log("");

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

  // Synthesized stack — the evidence-driven authority that drives the generated skills.
  if (stackProfile.language) {
    console.log(chalk.bold(`\nStack (synthesized — ${stackProfile.source}, confidence ${stackProfile.confidence}):`));
    console.log(`  Language:   ${stackProfile.language} ${stackProfile.languageVersion}`.trimEnd());
    console.log(`  Framework:  ${stackProfile.frameworkDetail}`);
    console.log(`  ORM:        ${stackProfile.orm ?? "none"}`);
    console.log(`  Database:   ${stackProfile.dbEngine ?? "none"}`);
    console.log(`  Auth:       ${stackProfile.authMethod ?? "none"}`);
    console.log(`  Test:       ${stackProfile.commands.test ?? "none"}`);
    console.log(`  Lint:       ${stackProfile.commands.lint ?? "none"}`);
    console.log(`  Format:     ${stackProfile.commands.format ?? "none"}`);
    console.log(`  Migrate:    ${stackProfile.commands.migrate ?? "none"}`);
  }

  // Template variables
  console.log(chalk.bold("\nTemplate Variables (for skill customization):"));
  for (const [key, value] of Object.entries(vars).slice(0, 16)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log("");
}
