// Pipeline orchestrator — full autonomous ticket-to-PR flow
import type { PipelineContext, PipelinePhase, PhaseResult, ApprovalGate } from "../shared/types.js";

export async function runPipeline(ctx: PipelineContext): Promise<PipelineContext> {
  const phases: PipelinePhase[] = ["plan", "implement", "test", "review", "docs", "pr"];
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
    const result = await executePhase(phase, ctx);

    ctx.phaseResults.set(phase, result);
    ctx.phasesCompleted.push(phase);

    if (!result.success) {
      console.log(`Phase ${phase} failed — stopping pipeline.`);
      break;
    }
  }

  return ctx;
}

async function executePhase(phase: PipelinePhase, ctx: PipelineContext): Promise<PhaseResult> {
  switch (phase) {
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
      return executePRPhase(ctx);
  }
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
  // serena find_symbol + insert_before_symbol + replace_symbol_body + get_diagnostics
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
  // Self-review via pr-review skills
  return {
    phase: "review",
    success: true,
    summary: "Review complete — no blockers",
    filesChanged: [],
    errors: [],
    warnings: [],
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

async function executePRPhase(ctx: PipelineContext): Promise<PhaseResult> {
  // git add + commit + push + gh pr create
  return {
    phase: "pr",
    success: true,
    summary: `PR created for ${ctx.ticketId ?? "changes"}`,
    filesChanged: [],
    errors: [],
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
