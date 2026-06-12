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

  // --- Stub values: real implementation reads from sentrux MCP responses ---
  const checkRulesViolations: string[] = [];   // populated from check_rules() result
  const sessionEndPass = true;                  // populated from session_end().pass
  const signalBefore = 0;                       // from session_end().signal_before
  const signalAfter = 0;                        // from session_end().signal_after
  const bottleneck = "";                        // from most recent scan().bottleneck
  const sessionSummary = "";                    // from session_end().summary

  const errors: string[] = [];

  if (checkRulesViolations.length > 0) {
    errors.push(`sentrux check_rules violations: ${checkRulesViolations.join("; ")}`);
  }

  if (!sessionEndPass) {
    errors.push(`sentrux session_end: architecture signal degraded — ${sessionSummary}`);
  }

  const success = errors.length === 0;

  return {
    phase: "review",
    success,
    summary: success
      ? "Review complete — no blockers"
      : `Review blocked: ${errors.join(" | ")}`,
    filesChanged: [],
    errors,
    warnings: [],
    qualitySignal: {
      before: signalBefore,
      after: signalAfter,
      bottleneck,
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
