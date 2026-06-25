// Pipeline orchestrator. branch/pr/ci phases are real (via injected PipelineDeps); plan/implement/test/review/docs are stubs pending engine integration (see stuff/plans/P5-pipeline-spike-findings.md). Not yet wired to a CLI command.
import type { PipelineContext, PipelinePhase, PhaseResult, ApprovalGate } from "../shared/types.js";
import { decideBranch } from "./branch.js";
import { parseGhChecks, evaluateCi } from "./ci-status.js";

export interface PipelineDeps {
  run: (cmd: string) => string;
  sleep: (ms: number) => Promise<void>;
  maxCiPolls?: number;
}

export type { PipelineContext };

export async function runPipeline(ctx: PipelineContext, deps: PipelineDeps): Promise<PipelineContext> {
  const phases: PipelinePhase[] = ["branch", "plan", "implement", "test", "review", "docs", "pr", "ci"];
  const startFrom = ctx.phasesCompleted.length > 0
    ? phases.indexOf(ctx.phasesCompleted[ctx.phasesCompleted.length - 1] as PipelinePhase) + 1
    : 0;

  for (let i = startFrom; i < phases.length; i++) {
    const phase = phases[i];

    // Approval gate check
    if (shouldPause(phase, ctx.approvalGate)) {
      const ok = await requestApproval(phase);
      if (!ok) {
        console.log(`Pipeline paused at phase: ${phase}`);
        return ctx;
      }
    }

    // Execute phase
    console.log(`\n⚒ Phase: ${phase.toUpperCase()}`);
    const result = await executePhase(phase, ctx, deps);

    ctx.phaseResults.set(phase, result);
    ctx.phasesCompleted.push(phase);

    if (!result.success) {
      console.log(`Phase ${phase} failed — stopping pipeline.`);
      break;
    }
  }

  return ctx;
}

async function executePhase(phase: PipelinePhase, ctx: PipelineContext, deps: PipelineDeps): Promise<PhaseResult> {
  switch (phase) {
    case "branch":
      return executeBranchPhase(ctx, deps);
    case "plan":
      return executePlanPhase(ctx);
    case "implement":
      return executeImplementPhase(ctx);
    case "test":
      return executeTestPhase(ctx);
    case "review":
      return executeReviewPhase(ctx);
    case "docs":
      return executeDocsPhase(ctx);
    case "pr":
      return executePRPhase(ctx, deps);
    case "ci":
      return executeCiPhase(ctx, deps);
  }
}

async function executeBranchPhase(ctx: PipelineContext, deps: PipelineDeps): Promise<PhaseResult> {
  const d = decideBranch({
    currentBranch: ctx.branch,
    continueHint: ctx.ticketId ?? "",
    proposedName: ctx.ticketId ? `feat/${ctx.ticketId}` : "",
  });

  for (const step of d.steps) {
    deps.run(step);
  }

  return {
    phase: "branch",
    success: true,
    summary: `Branch ${d.action}: ${d.branchName} (${d.reason})`,
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executePlanPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // gitnexus_query + gitnexus_impact + gitnexus_context → produce plan
  return {
    phase: "plan",
    success: true,
    summary: `Planned implementation for ${ctx.ticketId ?? "current changes"}`,
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executeImplementPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // 1. mcp__sentrux__session_start() — save architecture baseline before any edits.
  //    The baseline captured here is compared by session_end() in the review phase
  //    to detect regressions introduced during implementation.
  //
  // 2. serena find_symbol + insert_before_symbol + replace_symbol_body + get_diagnostics
  //    — perform the actual code changes.
  //
  // 3. mcp__sentrux__rescan() — re-analyse the working tree mid-implementation so the
  //    DSM and root_causes reflect the post-edit state before tests run.  Useful for
  //    catching cycle introductions early rather than at the review gate.
  return {
    phase: "implement",
    success: true,
    summary: "Implementation complete",
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executeTestPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // Run test suites
  return {
    phase: "test",
    success: true,
    summary: "Tests passing",
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executeReviewPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // 1. mcp__sentrux__check_rules()
  //    Validates .sentrux/rules.toml constraints (max_cycles, max_coupling, max_cc,
  //    no_god_files, layer boundaries).  Any violation is a hard blocker.
  //
  // 2. mcp__sentrux__session_end()
  //    Compares current architecture signal against the baseline saved by session_start()
  //    in executeImplementPhase.  If session_end.pass === false the PR introduced an
  //    architecture regression and the pipeline must not proceed to PR creation.
  //
  // 3. Self-review via pr-review skills (architecture, security, tests, etc.)

  // Stub: real implementation calls mcp__sentrux__check_rules() and
  // mcp__sentrux__session_end(), then populates violations/pass/signal fields.
  return {
    phase: "review",
    success: true,
    summary: "Review complete — no blockers",
    filesChanged: [],
    errors: [],
    warnings: [],
    qualitySignal: {
      before: 0,
      after: 0,
      bottleneck: "",
    },
  };
}

async function executeDocsPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // Playwright screenshots + OpenAPI annotations + Obsidian notes
  return {
    phase: "docs",
    success: true,
    summary: "Documentation updated",
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executePRPhase(ctx: PipelineContext, deps: PipelineDeps): Promise<PhaseResult> {
  // push current branch then open PR
  deps.run(`git push -u origin ${ctx.branch}`);
  const prOutput = deps.run("gh pr create --fill --base main");

  return {
    phase: "pr",
    success: true,
    summary: prOutput || `PR created for ${ctx.ticketId ?? "changes"}`,
    filesChanged: [],
    errors: [],
    warnings: [],
  };
}

async function executeCiPhase(ctx: PipelineContext, deps: PipelineDeps): Promise<PhaseResult> {
  const budget = deps.maxCiPolls ?? 30;

  for (let i = 0; i < budget; i++) {
    const raw = deps.run("gh pr checks --json name,state,bucket,link,workflow");
    const evalResult = evaluateCi(parseGhChecks(raw));

    if (evalResult.status === "green") {
      const s = evalResult.sonar;
      const summary = s.present ? "All CI + Sonar green" : "All CI green (no Sonar check found)";
      return {
        phase: "ci",
        success: true,
        summary,
        filesChanged: [],
        errors: [],
        warnings: [],
      };
    }

    if (evalResult.status === "failed") {
      return {
        phase: "ci",
        success: false,
        summary: `CI failed: ${evalResult.failed.map((c) => c.name).join(", ")}`,
        filesChanged: [],
        errors: evalResult.failed.map((c) => c.name),
        warnings: [],
      };
    }

    // pending — wait and re-poll
    await deps.sleep(1000);
  }

  return {
    phase: "ci",
    success: false,
    summary: "CI still pending after budget",
    filesChanged: [],
    errors: ["ci-timeout"],
    warnings: [],
  };
}

function shouldPause(phase: PipelinePhase, gate: ApprovalGate): boolean {
  if (gate === "none") return false;
  if (gate === "all") return true;
  if (gate === "plan" && phase === "plan") return true;
  return false;
}

async function requestApproval(phase: PipelinePhase): Promise<boolean> {
  // In production, prompt the user
  console.log(`[APPROVAL] Phase ${phase} ready. Proceed? (auto-approving in stub)`);
  return true;
}
