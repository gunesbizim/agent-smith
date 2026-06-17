// analyze command — project detection and report
import chalk from "chalk";
import ora from "ora";
import { detectProject } from "../analyze/project-detector.js";
import { sniffArchitecture } from "../analyze/architecture-sniffer.js";
import { mapBestPractices } from "../analyze/best-practice-mapper.js";
import { applyConfirmedOverrides } from "../analyze/ground-truth-overrides.js";
import { readLedger } from "../artifacts/ground-truth.js";
import { refineWithLlm } from "../analyze/llm-analyzer.js";
import { gatherAndSynthesizeStack } from "../analyze/stack-synthesizer.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";

interface AnalyzeOptions {
  json?: boolean;
  llm?: boolean;
}

export async function analyzeCommand(opts: AnalyzeOptions): Promise<void> {
  const cwd = process.cwd();
  const spinner = ora("Analyzing project...").start();

  let project = await detectProject(cwd);
  let llmNote: string | undefined;
  if (opts.llm) {
    spinner.text = "Refining analysis with Claude...";
    const refined = refineWithLlm(cwd, project);
    project = refined.project;
    llmNote = refined.usedLlm ? "refined by Claude" : `programmatic (${refined.reason})`;
  }
  const patterns = await sniffArchitecture(cwd, project);

  // Evidence-driven stack synthesis — the authority for backend stack + toolchain commands.
  spinner.text = "Synthesizing stack from project evidence...";
  const stackProfile = await gatherAndSynthesizeStack(cwd, { useLlm: opts.llm });
  let vars = mapBestPractices(project, patterns, DEFAULT_TEMPLATE_VARS, undefined, stackProfile);
  // C2/D1 — read-first: a human-confirmed ground-truth value wins over detection.
  vars = applyConfirmedOverrides(vars, readLedger(cwd));

  spinner.succeed(llmNote ? `Analysis complete — ${llmNote}` : "Analysis complete");

  if (opts.json) {
    console.log(JSON.stringify({ project, patterns, stackProfile, templateVariables: vars }, null, 2));
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
