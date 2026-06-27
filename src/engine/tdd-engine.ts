// The TDD-first runtime conductor.
//
// Drives UNDERSTAND → RED → PLAN → CODE → REVIEW → PR on top of the Claude CLI, one headless call
// per phase/subtask (each a fresh context). Opus plans/thinks/reviews; Sonnet codes (tests are code).
// State is event-sourced (events.jsonl) so a run resumes by replaying the log. All external effects
// — model calls, test runs, the architecture gate, approval prompts — are injectable, so the whole
// conductor is unit-testable without spawning Claude or shelling out.
import { execFileSync } from "node:child_process";
import fs from "fs-extra";
import type { ApprovalGate } from "../shared/types.js";
import type { AgentCallFn } from "./agent-call.js";
import { makeAgentCaller } from "./agent-call.js";
import { appendEvent, readEvents } from "./event-store.js";
import { defaultConfirm, shouldPause, type ConfirmFn } from "./gates.js";
import { extractJson } from "./parse.js";
import { treeFingerprint } from "./fingerprint.js";
import { buildRedProof, parseTestRun, type RedProof } from "./red-proof.js";
import { artifactPath, currentPointerPath, makeRunId, runsDir } from "./run-dir.js";
import { projectRunState, type RunState } from "./run-state.js";
import { codePrompt, planPrompt, redPrompt, reviewPrompt, understandPrompt } from "./prompts.js";

const PHASES = ["understand", "red", "plan", "code", "review", "pr"] as const;
type Phase = (typeof PHASES)[number];

const DEFAULT_PLAN_MODEL = "opus";
const DEFAULT_CODE_MODEL = "sonnet";
const DEFAULT_MAX_FIX_ATTEMPTS = 3;
const PHASE_TIMEOUT_MS = 20 * 60_000; // coding calls routinely exceed the 90s default

export interface TddEngineInput {
  ticketId: string | null;
  task: string;
  branch: string;
  approvalGate: ApprovalGate;
  /** Resolved project test command. "none"/empty ⇒ RED gate is skipped (fail-open with a warning). */
  testCommand: string;
  testCwd?: string;
  testHint?: string;
  mcpConfigPath?: string;
  planModel?: string;
  codeModel?: string;
  maxFixAttempts?: number;
  engineVersion: string;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  durationMs: number;
}

export interface TddEngineDeps {
  root: string;
  /** Defaults to a real caller bound to the run. Inject for tests. */
  callAgent?: AgentCallFn;
  runTests?: (command: string, cwd?: string) => TestRunResult;
  /** Architecture gate. Returns whether the change degraded architecture. Defaults to `sentrux gate .`. */
  runGate?: (cwd: string) => { degraded: boolean; output: string };
  confirm?: ConfirmFn;
  now?: () => Date;
  /** Resume an existing run instead of creating one. */
  runId?: string;
}

export interface TddEngineResult {
  runId: string;
  state: RunState;
}

interface PhaseOutcome {
  success: boolean;
  summary: string;
  warnings?: string[];
  errors?: string[];
}

export async function runEngine(input: TddEngineInput, deps: TddEngineDeps): Promise<TddEngineResult> {
  const root = deps.root;
  const now = deps.now ?? (() => new Date());
  const runId = deps.runId ?? makeRunId(input.ticketId ?? input.task, now());
  const callAgent = deps.callAgent ?? makeAgentCaller(root, runId);
  const runTests = deps.runTests ?? defaultRunTests;
  const runGate = deps.runGate ?? defaultRunGate;
  const confirm = deps.confirm ?? defaultConfirm;

  fs.ensureDirSync(runsDir(root));
  fs.writeFileSync(currentPointerPath(root), runId);

  const resumed = projectRunState(readEvents(root, runId));
  if (resumed.phasesStarted.length === 0) {
    appendEvent(root, runId, {
      type: "run_started",
      ticketId: input.ticketId,
      task: input.task,
      branch: input.branch,
      approvalGate: input.approvalGate,
      phases: [...PHASES],
      origin: "engine",
      engineVersion: input.engineVersion,
    });
  }

  for (const phase of PHASES) {
    if (resumed.phasesCompleted.includes(phase)) continue;

    if (shouldPause(phase, input.approvalGate)) {
      const ok = await confirm(phase);
      appendEvent(root, runId, {
        type: "gate_result",
        phase,
        gate: input.approvalGate,
        decision: ok ? "approved" : "rejected",
        by: "human",
      });
      if (!ok) {
        appendEvent(root, runId, { type: "run_finished", status: "paused", lastPhase: phase, reason: "approval gate" });
        return finish(root, runId);
      }
    }

    appendEvent(root, runId, { type: "phase_started", phase, model: modelForPhase(phase, input) });
    const outcome = await runPhase(phase, { root, runId, input, callAgent, runTests, runGate, now });
    appendEvent(root, runId, {
      type: "phase_finished",
      phase,
      success: outcome.success,
      summary: outcome.summary,
      warnings: outcome.warnings,
      errors: outcome.errors,
    });

    if (!outcome.success) {
      appendEvent(root, runId, { type: "run_finished", status: "failed", lastPhase: phase, reason: outcome.summary });
      return finish(root, runId);
    }
  }

  appendEvent(root, runId, { type: "run_finished", status: "completed", lastPhase: "pr" });
  return finish(root, runId);
}

function finish(root: string, runId: string): TddEngineResult {
  const state = projectRunState(readEvents(root, runId));
  // Retire the `current` pointer on terminal states so a finished run does not keep the TDD-gate hook
  // gating every later unrelated commit. Keep it for `paused` so `--resume` still finds the run.
  if (state.status !== "paused") {
    try {
      const p = currentPointerPath(root);
      if (fs.existsSync(p) && fs.readFileSync(p, "utf-8").trim() === runId) fs.removeSync(p);
    } catch {
      /* best-effort */
    }
  }
  return { runId, state };
}

function modelForPhase(phase: Phase, input: TddEngineInput): string {
  const plan = input.planModel ?? DEFAULT_PLAN_MODEL;
  const code = input.codeModel ?? DEFAULT_CODE_MODEL;
  // Opus thinks (understand/plan/review); Sonnet codes (red writes tests, code implements). PR is mechanical.
  return phase === "red" || phase === "code" || phase === "pr" ? code : plan;
}

interface PhaseCtx {
  root: string;
  runId: string;
  input: TddEngineInput;
  callAgent: AgentCallFn;
  runTests: (command: string, cwd?: string) => TestRunResult;
  runGate: (cwd: string) => { degraded: boolean; output: string };
  now: () => Date;
}

async function runPhase(phase: Phase, ctx: PhaseCtx): Promise<PhaseOutcome> {
  switch (phase) {
    case "understand":
      return understandPhase(ctx);
    case "red":
      return redPhase(ctx);
    case "plan":
      return planPhase(ctx);
    case "code":
      return codePhase(ctx);
    case "review":
      return reviewPhase(ctx);
    case "pr":
      return prPhase(ctx);
  }
}

// ---- artifact shapes ----
interface TestPlanEntry {
  id: string;
  file?: string;
  description?: string;
}
interface TestPlan {
  unit: TestPlanEntry[];
  feature: TestPlanEntry[];
}
interface UnderstandOutput {
  scenarios: string;
  testPlan: TestPlan;
}
interface Subtask {
  key: string;
  summary: string;
  files?: string[];
  targetTests?: string[];
}

function write(ctx: PhaseCtx, name: string, content: string): void {
  fs.outputFileSync(artifactPath(ctx.root, ctx.runId, name), content);
}
function readArtifact(ctx: PhaseCtx, name: string): string | null {
  const p = artifactPath(ctx.root, ctx.runId, name);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
}

async function understandPhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  const res = await ctx.callAgent({
    phase: "understand",
    model: ctx.input.planModel ?? DEFAULT_PLAN_MODEL,
    prompt: understandPrompt({ ticketId: ctx.input.ticketId, task: ctx.input.task, testCommand: ctx.input.testCommand }),
    allowedTools: ["Read", "Glob", "Grep"],
    cwd: ctx.root,
    mcpConfigPath: ctx.input.mcpConfigPath,
    timeoutMs: PHASE_TIMEOUT_MS,
  });
  const out = extractJson<UnderstandOutput>(res.text);
  if (!out?.testPlan) return { success: false, summary: "understand: agent returned no parseable test plan" };

  const unit = out.testPlan.unit ?? [];
  const feature = out.testPlan.feature ?? [];
  write(ctx, "scenarios.md", out.scenarios ?? "");
  write(ctx, "test-plan.json", JSON.stringify(out.testPlan, null, 2));

  if (unit.length < 1 || feature.length < 1) {
    return { success: false, summary: `understand: need ≥1 unit and ≥1 feature test (got ${unit.length}/${feature.length})` };
  }
  return { success: true, summary: `Scenarios + test plan: ${unit.length} unit, ${feature.length} feature` };
}

function newTestIds(ctx: PhaseCtx): string[] {
  const plan = extractJson<TestPlan>(readArtifact(ctx, "test-plan.json"));
  if (!plan) return [];
  return [...(plan.unit ?? []), ...(plan.feature ?? [])].map((t) => t.id).filter(Boolean);
}

async function redPhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  if (!hasTestCommand(ctx.input.testCommand)) {
    return { success: true, summary: "red: no test command configured — gate skipped", warnings: ["no test runner"] };
  }
  await ctx.callAgent({
    phase: "red",
    model: ctx.input.codeModel ?? DEFAULT_CODE_MODEL,
    prompt: redPrompt({ ticketId: ctx.input.ticketId, task: ctx.input.task, testCommand: ctx.input.testCommand, testPlanJson: readArtifact(ctx, "test-plan.json") ?? "{}" }),
    allowedTools: ["Read", "Glob", "Grep", "Write", "Edit"],
    cwd: ctx.root,
    mcpConfigPath: ctx.input.mcpConfigPath,
    timeoutMs: PHASE_TIMEOUT_MS,
  });

  const ids = newTestIds(ctx);
  const run = ctx.runTests(ctx.input.testCommand, ctx.input.testCwd);
  appendEvent(ctx.root, ctx.runId, { type: "test_run", command: ctx.input.testCommand, exitCode: run.exitCode, passed: run.exitCode === 0, durationMs: run.durationMs, logPath: "red-proof.raw.txt" });
  write(ctx, "red-proof.raw.txt", run.stdout);

  const proof: RedProof = buildRedProof({
    command: ctx.input.testCommand,
    stdout: run.stdout,
    exitCode: run.exitCode,
    newTestIds: ids,
    hint: ctx.input.testHint,
    capturedAt: ctx.now().toISOString(),
  });
  write(ctx, "red-proof.json", JSON.stringify(proof, null, 2));

  if (!proof.valid) return { success: false, summary: `red: ${proof.reason ?? "tests did not prove RED"}` };
  return { success: true, summary: `RED proven: ${proof.newTests.length} new test(s) failing` };
}

async function planPhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  const res = await ctx.callAgent({
    phase: "plan",
    model: ctx.input.planModel ?? DEFAULT_PLAN_MODEL,
    prompt: planPrompt({ ticketId: ctx.input.ticketId, task: ctx.input.task, testCommand: ctx.input.testCommand, redProofJson: readArtifact(ctx, "red-proof.json") ?? "{}", scenarios: readArtifact(ctx, "scenarios.md") ?? "" }),
    allowedTools: ["Read", "Glob", "Grep"],
    cwd: ctx.root,
    mcpConfigPath: ctx.input.mcpConfigPath,
    timeoutMs: PHASE_TIMEOUT_MS,
  });
  const out = extractJson<{ subtasks: Subtask[] }>(res.text);
  const subtasks = out?.subtasks ?? [];
  if (subtasks.length < 1) return { success: false, summary: "plan: agent returned no subtasks" };
  write(ctx, "subtasks.json", JSON.stringify(subtasks, null, 2));
  write(ctx, "todo.md", renderTodo(subtasks));
  appendEvent(ctx.root, ctx.runId, { type: "plan_generated", phase: "plan", subtaskCount: subtasks.length, artifactPath: "subtasks.json" });

  // Coverage check: every failing test must be claimed by some subtask.
  const claimed = new Set(subtasks.flatMap((s) => s.targetTests ?? []));
  const orphans = newTestIds(ctx).filter((id) => !claimed.has(id));
  if (orphans.length > 0) return { success: false, summary: `plan: ${orphans.length} failing test(s) not claimed by any subtask` };
  return { success: true, summary: `Planned ${subtasks.length} subtask(s)` };
}

async function codePhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  const subtasks = extractJson<Subtask[]>(readArtifact(ctx, "subtasks.json")) ?? [];
  const done = projectRunState(readEvents(ctx.root, ctx.runId)).completedSubtasks;
  const maxAttempts = ctx.input.maxFixAttempts ?? DEFAULT_MAX_FIX_ATTEMPTS;
  const haveTests = hasTestCommand(ctx.input.testCommand);

  for (let i = 0; i < subtasks.length; i++) {
    const st = subtasks[i];
    if (done.has(st.key)) continue;
    appendEvent(ctx.root, ctx.runId, { type: "subtask_started", subtaskKey: st.key, summary: st.summary, index: i, total: subtasks.length });
    const green = await runSubtaskAttempts(ctx, st, maxAttempts, haveTests);
    appendEvent(ctx.root, ctx.runId, { type: "subtask_finished", subtaskKey: st.key, status: green ? "done" : "failed" });
    if (!green) return { success: false, summary: `code: subtask ${st.key} did not turn its tests green after ${maxAttempts} attempt(s)` };
  }

  if (haveTests) {
    const suiteOutcome = verifyFullSuiteGreen(ctx);
    if (suiteOutcome) return suiteOutcome;
  }
  return { success: true, summary: `Implemented ${subtasks.length} subtask(s); suite green` };
}

async function runSubtaskAttempts(ctx: PhaseCtx, st: Subtask, maxAttempts: number, haveTests: boolean): Promise<boolean> {
  let green = false;
  for (let attempt = 1; attempt <= maxAttempts && !green; attempt++) {
    await ctx.callAgent({
      phase: "code",
      model: ctx.input.codeModel ?? DEFAULT_CODE_MODEL,
      prompt: codePrompt({ ticketId: ctx.input.ticketId, task: ctx.input.task, testCommand: ctx.input.testCommand, subtaskSummary: st.summary, targetTests: st.targetTests }),
      allowedTools: ["Read", "Glob", "Grep", "Edit", "Write", "Bash"],
      cwd: ctx.root,
      mcpConfigPath: ctx.input.mcpConfigPath,
      timeoutMs: PHASE_TIMEOUT_MS,
      subtaskKey: st.key,
      attempt,
    });
    green = haveTests ? targetedGreen(ctx, st) : true;
  }
  return green;
}

function verifyFullSuiteGreen(ctx: PhaseCtx): PhaseOutcome | null {
  const run = ctx.runTests(ctx.input.testCommand, ctx.input.testCwd);
  appendEvent(ctx.root, ctx.runId, { type: "test_run", command: ctx.input.testCommand, exitCode: run.exitCode, passed: run.exitCode === 0, durationMs: run.durationMs });
  if (run.exitCode !== 0) return { success: false, summary: "code: full suite not green after all subtasks" };

  // Verify the green-proof against the ACTUAL final run, not the planned id list: every previously-red
  // test must be present AND passing. A suite that exits 0 because the new tests were skipped/renamed
  // must not produce a valid green-proof (that would let the TDD gate pass on unverified tests).
  const ids = newTestIds(ctx);
  const byId = new Map(parseTestRun(run.stdout, run.exitCode, ctx.input.testHint).tests.map((t) => [t.id, t]));
  const notGreen = ids.filter((id) => byId.get(id)?.status !== "pass");
  if (notGreen.length > 0) {
    return { success: false, summary: `code: suite exited 0 but new test(s) are not passing: ${notGreen.join(", ")}` };
  }
  writeGreenProof(ctx, ids);
  return null;
}

// Stamp the green-proof the deterministic TDD-gate hook checks before allowing a commit/push/PR.
// `passing` is the set of previously-red ids confirmed passing in the final run (verified by caller).
function writeGreenProof(ctx: PhaseCtx, passing: string[]): void {
  try {
    write(
      ctx,
      "green-proof.json",
      JSON.stringify({ fingerprint: treeFingerprint(ctx.root), passing, capturedAt: ctx.now().toISOString(), valid: true }, null, 2),
    );
  } catch {
    /* best-effort; if absent the gate denies and asks for a verified test run */
  }
}

function targetedGreen(ctx: PhaseCtx, st: Subtask): boolean {
  const run = ctx.runTests(ctx.input.testCommand, ctx.input.testCwd);
  const parsed = parseTestRun(run.stdout, run.exitCode, ctx.input.testHint);
  const targets = st.targetTests ?? [];
  if (targets.length === 0) return run.exitCode === 0;
  const byId = new Map(parsed.tests.map((t) => [t.id, t]));
  return targets.every((id) => byId.get(id)?.status === "pass");
}

async function reviewPhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  await ctx.callAgent({
    phase: "review",
    model: ctx.input.planModel ?? DEFAULT_PLAN_MODEL,
    prompt: reviewPrompt({ ticketId: ctx.input.ticketId, task: ctx.input.task, testCommand: ctx.input.testCommand }),
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    cwd: ctx.root,
    mcpConfigPath: ctx.input.mcpConfigPath,
    timeoutMs: PHASE_TIMEOUT_MS,
  });

  // Architecture gate: must not degrade (always run sentrux, always ratchet up).
  const gate = ctx.runGate(ctx.root);
  appendEvent(ctx.root, ctx.runId, { type: "gate_result", phase: "review", gate: "sentrux", decision: gate.degraded ? "rejected" : "auto" });
  if (gate.degraded) return { success: false, summary: "review: sentrux gate — architecture degraded; blocked" };
  return { success: true, summary: "Review complete; architecture gate held" };
}

async function prPhase(ctx: PhaseCtx): Promise<PhaseOutcome> {
  // Real commit/push/PR is performed by the gated `/as-ship` workflow (which the deterministic
  // sentrux + TDD hooks guard). The engine records readiness; it never force-pushes unattended.
  return { success: true, summary: "Ready to ship — run /as-ship (human-gated) to open the PR" };
}

function renderTodo(subtasks: Subtask[]): string {
  const lines = ["# Subtask todo", ""];
  for (const s of subtasks) {
    const testSuffix = s.targetTests?.length ? ` (tests: ${s.targetTests.join(", ")})` : "";
    lines.push(`- [ ] **${s.key}** — ${s.summary}${testSuffix}`);
  }
  return lines.join("\n") + "\n";
}

function hasTestCommand(cmd: string): boolean {
  const c = (cmd ?? "").trim().toLowerCase();
  return c.length > 0 && c !== "none";
}

// ---- real default effects (used when deps not injected) ----

function defaultRunTests(command: string, cwd?: string): TestRunResult {
  const start = Date.now();
  try {
    const stdout = execFileSync("bash", ["-lc", command], { cwd, encoding: "utf-8", timeout: PHASE_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 }); // NOSONAR — command from project config
    return { exitCode: 0, stdout, durationMs: Date.now() - start };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: e.status ?? 1, stdout: `${e.stdout ?? ""}${e.stderr ?? ""}`, durationMs: Date.now() - start };
  }
}

function defaultRunGate(cwd: string): { degraded: boolean; output: string } {
  try {
    // sentrux exits 0 even when it reports DEGRADED, so the verdict is read from stdout (same as the
    // sentrux-gate hook): degradation only when it prints DEGRADED.
    const output = execFileSync("sentrux", ["gate", "."], { cwd, encoding: "utf-8", timeout: 120_000 }); // NOSONAR — fixed binary
    return { degraded: /DEGRADED/i.test(output), output };
  } catch (err) {
    const e = err as { stdout?: string; code?: string };
    // Genuinely absent → can't gate, don't wedge the engine (fail-open). Any OTHER failure (crash,
    // timeout, non-zero exit) → fail-CLOSED: treat as degraded rather than silently passing review.
    if (e.code === "ENOENT") return { degraded: false, output: "sentrux not installed — gate skipped (fail-open)" };
    return { degraded: true, output: e.stdout || "sentrux gate errored — blocking review (fail-closed)" };
  }
}
