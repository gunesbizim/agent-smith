/**
 * analyze-step — dependency checks, project analysis, sentrux probe, and interview.
 * Groups Steps 1–4b from initCommand so init.ts doesn't import all leaf modules directly.
 */
import chalk from "chalk";
import ora from "ora";
import { analyzeProject } from "../../analyze/analyze-project.js";
import { probeSentrux } from "../../analyze/architecture-sniffer.js";
import { runInterview, applyInterviewAnswers } from "../../adapt/project-interview.js";
import { checkDependencies } from "../../install/dependency-checker.js";
import { ensureGhCli } from "../../install/gh-installer.js";
import type { TemplateVariables } from "../../shared/types.js";

export interface AnalyzeStepResult {
  templateVars: TemplateVariables;
  project: Awaited<ReturnType<typeof analyzeProject>>["project"];
  stackProfile: Awaited<ReturnType<typeof analyzeProject>>["stackProfile"];
}

interface AnalyzeStepOptions {
  cwd: string;
  dryRun?: boolean;
  llm?: boolean;
  auto?: boolean;
  noInterview?: boolean;
  interview?: boolean;
}

/** Returns false if a fatal dependency is missing (caller should return early). */
export async function runDependencyChecks(opts: { dryRun?: boolean }): Promise<boolean> {
  const depSpinner = ora("Checking system dependencies...").start();
  const depResult = await checkDependencies();
  if (!depResult.ok) {
    depSpinner.fail("Missing dependencies:");
    for (const d of depResult.missing) {
      console.log(chalk.red(`  ✗ ${d.name} — ${d.installHint}`));
    }
    console.log(chalk.yellow("\nInstall missing dependencies and re-run."));
    return false;
  }
  depSpinner.succeed(`Node ${depResult.nodeVersion}, npm ${depResult.npmVersion}, git ${depResult.gitVersion}`);

  if (!opts.dryRun) {
    const ghSpinner = ora("Ensuring GitHub CLI (gh)...").start();
    const gh = await ensureGhCli();
    if (gh.alreadyPresent) {
      ghSpinner.succeed("GitHub CLI present");
    } else if (gh.installed) {
      ghSpinner.succeed("GitHub CLI installed — run `gh auth login` once to enable PR creation");
    } else {
      ghSpinner.warn(`GitHub CLI not installed — ${gh.reason}`);
    }
  }

  return true;
}

/** Runs project analysis and the sentrux probe; returns the populated templateVars. */
export async function runAnalysis(opts: AnalyzeStepOptions): Promise<AnalyzeStepResult> {
  const { cwd, dryRun, llm } = opts;
  const llmRequested = llm !== false;

  const analysisSpinner = ora("Analyzing project (detect → stack → best practices)...").start();
  const analysis = await analyzeProject(cwd, { useLlm: llmRequested && !dryRun });
  const { project, patterns, stackProfile, ledger } = analysis;
  let templateVars: TemplateVariables = analysis.templateVars;

  if (llmRequested && !dryRun && !analysis.llmRefined) {
    analysisSpinner.warn(`LLM refinement skipped: ${analysis.llmReason}`);
    analysisSpinner.start();
  }

  const confirmedCount = Object.keys(ledger.values).filter(
    (k) => ledger.values[k].source === "confirmed",
  ).length;
  const confirmedSuffix = confirmedCount ? ` · ${confirmedCount} confirmed` : "";
  const frameworkSuffix = stackProfile.framework ? "/" + stackProfile.framework : "";
  analysisSpinner.succeed(
    `Detected: ${project.backend?.framework ?? "no backend"} / ${project.frontend?.framework ?? "no frontend"} · ` +
    `${patterns.length} patterns · stack ${stackProfile.language ?? "none"}${frameworkSuffix}${confirmedSuffix}`,
  );

  // Sentrux probe
  const sentruxSpinner = ora("Probing architecture quality (sentrux scan)...").start();
  const sentruxProbe = await probeSentrux(cwd);
  if (sentruxProbe.available) {
    const cycles = sentruxProbe.cycles ?? 0;
    if (cycles === 0) {
      templateVars.SENTRUX_MAX_CYCLES = "0";
      sentruxSpinner.succeed(
        `sentrux: max_cycles=0 (enforce mode) — 0 cycles detected, quality_signal=${sentruxProbe.qualitySignal ?? "n/a"}`,
      );
    } else {
      templateVars.SENTRUX_MAX_CYCLES = String(cycles);
      sentruxSpinner.warn(
        `sentrux: max_cycles=0 would FAIL now (${cycles} cycle${cycles === 1 ? "" : "s"}) → seeding max_cycles=${cycles} (ratchet)`,
      );
    }
    if (sentruxProbe.maxCC != null) templateVars.SENTRUX_MAX_CC = String(sentruxProbe.maxCC);
    if (sentruxProbe.couplingGrade != null) templateVars.SENTRUX_MAX_COUPLING = sentruxProbe.couplingGrade;
  } else {
    templateVars.SENTRUX_MAX_CYCLES = "unknown";
    sentruxSpinner.warn(
      "sentrux not available — rules.toml will have max_cycles commented out (advisory mode). Install sentrux and re-run.",
    );
  }

  // Interview (unless suppressed)
  const skipInterview = !!opts.auto || opts.interview === false || !!opts.noInterview || !!opts.dryRun;
  if (!skipInterview) {
    const sentruxForInterview = sentruxProbe.available
      ? { cycles: sentruxProbe.cycles, maxCC: sentruxProbe.maxCC }
      : undefined;
    try {
      const interviewAnswers = await runInterview(cwd, project, sentruxForInterview);
      if (interviewAnswers) {
        templateVars = applyInterviewAnswers(templateVars, interviewAnswers);
      }
    } catch (err) {
      console.log(chalk.yellow(`\n  Interview skipped: ${err instanceof Error ? err.message : err}`));
    }
    console.log(chalk.gray(""));
  } else if (!opts.dryRun) {
    console.log(chalk.gray("  Interview: skipped (--auto or --no-interview)"));
  }

  return { templateVars, project, stackProfile };
}
