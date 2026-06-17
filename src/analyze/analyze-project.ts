// B11 — the single source of project analysis, shared by `init` and `analyze`.
//
// Divergent analysis paths are how the version/ORM bugs hid (and how `analyze` historically
// skipped scanPackages). This one builder runs the full sequence — detect → (optional LLM
// refine) → sniff → scanPackages → synthesize stack → map vars → apply the D1 ledger — so
// `analyze --json` is a faithful preview of exactly what `init` will scaffold from.
import { detectProject } from "./project-detector.js";
import { refineWithLlm } from "./llm-analyzer.js";
import { sniffArchitecture } from "./architecture-sniffer.js";
import { scanPackages } from "./package-scanner.js";
import { gatherAndSynthesizeStack } from "./stack-synthesizer.js";
import { mapBestPractices } from "./best-practice-mapper.js";
import { applyConfirmedOverrides } from "./ground-truth-overrides.js";
import { readLedger } from "../artifacts/ground-truth.js";
import { DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";
import type { ArchitecturePattern } from "./architecture-sniffer.js";
import type { PackageUsage } from "./package-scanner.js";
import type { StackProfile } from "./stack-types.js";
import type { DetectedProject, TemplateVariables, GroundTruthLedger } from "../shared/types.js";

export interface ProjectAnalysis {
  project: DetectedProject;
  patterns: ArchitecturePattern[];
  packageUsage: PackageUsage;
  stackProfile: StackProfile;
  /** Mapped vars with the D1 ledger's confirmed values applied (the read-first authority). */
  templateVars: TemplateVariables;
  ledger: GroundTruthLedger;
  /** Whether the LLM project-refinement pass actually ran. */
  llmRefined: boolean;
  /** Reason the LLM pass was skipped (when llmRefined is false and useLlm was requested). */
  llmReason?: string;
}

export interface AnalyzeProjectOptions {
  useLlm?: boolean;
}

/**
 * Run the full analysis pipeline once. Both `init` and `analyze` call this so they can never
 * drift. `init` layers the sentrux probe + interview on top of the returned `templateVars`.
 */
export async function analyzeProject(
  cwd: string,
  opts: AnalyzeProjectOptions = {},
): Promise<ProjectAnalysis> {
  const useLlm = opts.useLlm ?? false;

  let project = await detectProject(cwd);
  let llmRefined = false;
  let llmReason: string | undefined;
  if (useLlm) {
    const refined = refineWithLlm(cwd, project);
    project = refined.project;
    llmRefined = refined.usedLlm;
    llmReason = refined.reason;
  }

  const patterns = await sniffArchitecture(cwd, project);
  const packageUsage = await scanPackages(cwd);
  const stackProfile = await gatherAndSynthesizeStack(cwd, { useLlm });
  const ledger = readLedger(cwd);

  let templateVars = mapBestPractices(project, patterns, DEFAULT_TEMPLATE_VARS, packageUsage, stackProfile);
  templateVars = applyConfirmedOverrides(templateVars, ledger);

  return { project, patterns, packageUsage, stackProfile, templateVars, ledger, llmRefined, llmReason };
}
