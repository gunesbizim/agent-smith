// init command — full project bootstrap
import chalk from "chalk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { runDependencyChecks, runAnalysis } from "./init-steps/analyze-step.js";
import { runScaffoldStep } from "./init-steps/scaffold-step.js";
import { runInstallStep } from "./init-steps/install-step.js";
import { runLlmStep } from "./init-steps/llm-step.js";
import type { TemplateVariables } from "../shared/types.js";

// agent-smith's own version (read from the package.json shipped with it) for the A11 manifest.
const AGENT_SMITH_VERSION: string = (() => {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    return (JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

interface InitOptions {
  platform?: string;
  auto?: boolean;
  dryRun?: boolean;
  dir?: string;
  caveman?: boolean;
  /** Commander maps `--no-interview` to `interview: false`. `noInterview` kept for direct callers. */
  interview?: boolean;
  noInterview?: boolean;
  llm?: boolean;
  /** Approve MCP installs without prompting. */
  yes?: boolean;
  /** Commander maps `--no-install` to `install: false`; undefined/true means install. */
  install?: boolean;
  /** Re-run LLM skill generation even if the first-run marker is present (`--regen-skills`). */
  regenSkills?: boolean;
}

/**
 * Whether to skip the conventions interview. Commander maps `--no-interview` to
 * `opts.interview === false` (NOT `opts.noInterview`), so both are honored — checking only the
 * bare `noInterview` silently ignored the flag (the e2e regression). Exported for testing.
 */
export function shouldSkipInterview(opts: InitOptions): boolean {
  return !!opts.auto || opts.interview === false || !!opts.noInterview || !!opts.dryRun;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const platform = opts.platform || "claude-code";

  console.log(chalk.bold.cyan("\n⚒ Agent Smith — Project Initialization\n"));
  console.log(chalk.gray(`  Platform: ${platform}`));
  console.log(chalk.gray(`  Target:   ${cwd}\n`));

  // Steps 1–1b — dependency + gh-cli checks
  const depsOk = await runDependencyChecks({ dryRun: opts.dryRun });
  if (!depsOk) return;

  // Steps 2–4b — project analysis, sentrux probe, interview
  const { templateVars: rawVars, project, stackProfile } = await runAnalysis({
    cwd,
    dryRun: opts.dryRun,
    llm: opts.llm,
    auto: opts.auto,
    noInterview: opts.noInterview,
    interview: opts.interview,
  });
  // templateVars may be mutated by runInstallStep so use a local binding
  const templateVars: TemplateVariables = rawVars;

  // Steps 5–11 — scaffold commands/skills, arch docs, sentrux, caveman, configs, hooks, source dirs
  await runScaffoldStep({
    targetDir: cwd,
    templateVars,
    project,
    platform,
    dryRun: opts.dryRun,
    caveman: opts.caveman,
    auto: opts.auto,
    noInterview: opts.noInterview,
    llm: opts.llm,
  });

  // Steps 9–12 — MCP install, config, Obsidian, local MCPs, CLAUDE.md
  await runInstallStep({
    targetDir: cwd,
    templateVars,
    project,
    platform,
    dryRun: opts.dryRun,
    yes: opts.yes,
    install: opts.install,
    auto: opts.auto,
    noInterview: opts.noInterview,
  });

  // Step 13 (FINAL) — LLM skill generation
  const stackLabel = `${stackProfile.language ?? "none"}${stackProfile.framework ? "/" + stackProfile.framework : ""}`;
  await runLlmStep({
    targetDir: cwd,
    agentSmithVersion: AGENT_SMITH_VERSION,
    stackLabel,
    dryRun: opts.dryRun,
    llm: opts.llm,
    regenSkills: opts.regenSkills,
  });

  console.log(chalk.bold.green("\n✓ Agent Smith initialized successfully!\n"));
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Restart Claude Code to load new MCP servers, skills, and hooks"));
  console.log(chalk.gray("  2. Hooks will auto-check health on session start, guard git ops, detect changes on stop"));
  console.log(chalk.gray("  3. Try: /as-backend 'add a health endpoint'"));
  console.log(chalk.gray("  4. Try: /as-frontend 'create a dashboard view'"));
  console.log(chalk.gray("  5. Run: npx agent-smith doctor for health check\n"));
}
