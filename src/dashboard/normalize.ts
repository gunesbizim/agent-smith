// Pure projection: a run's event log → a RunDTO tree (run → phases → agent calls).
//
// Handles both engine runs (full agent_call_started/finished pairs grouped by phase) and interactive
// runs captured by the telemetry hook (only agent_call_finished, no phase_started — synthesized under
// an "interactive" phase). Pure and deterministic; `nowMs` is injectable for live wall-clock.
import type { AgentCallFinishedEvent, EngineEvent, ToolCallEvent } from "../engine/events.js";
import type { AgentCallDTO, CallStatus, PhaseDTO, RunDTO, RunOrigin, ToolCallsAggregation } from "./types.js";

const CALL_STATUS: Record<string, CallStatus> = { ok: "done", error: "failed", timeout: "failed" };
const RUN_FINISHED_STATUS: Record<string, CallStatus> = { completed: "done", failed: "failed" };

function mapRunFinishedStatus(status: string): CallStatus {
  return RUN_FINISHED_STATUS[status] ?? "queued";
}

function notePhaseInto(name: string, phaseSeen: Set<string>, phaseOrder: string[]): void {
  if (!phaseSeen.has(name)) {
    phaseSeen.add(name);
    phaseOrder.push(name);
  }
}

/** Upsert a call DTO for an `agent_call_finished` event. */
function applyCallFinished(
  e: AgentCallFinishedEvent,
  calls: Map<string, AgentCallDTO>,
  runId: string,
  origin: RunOrigin,
): void {
  const existing = calls.get(e.callId);
  const dto: AgentCallDTO = existing ?? {
    id: e.callId,
    runId,
    phase: e.phase,
    model: e.model,
    promptSummary: e.promptSummary ?? "",
    tokens: 0,
    costUsd: null,
    durationMs: null,
    status: "running",
    startedAt: e.ts,
    finishedAt: null,
    origin: e.origin ?? origin,
    subtaskKey: e.subtaskKey,
  };
  dto.status = CALL_STATUS[e.status] ?? "done";
  dto.durationMs = e.durationMs ?? dto.durationMs;
  dto.tokens = e.tokens?.total ?? dto.tokens;
  dto.costUsd = e.costUsd ?? dto.costUsd;
  dto.finishedAt = e.ts;
  if (e.tools) dto.tools = e.tools;
  calls.set(e.callId, dto);
}

export function normalizeRun(runId: string, events: EngineEvent[], nowMs: number = Date.now()): RunDTO {
  const calls = new Map<string, AgentCallDTO>();
  const phaseOrder: string[] = [];
  const phaseSeen = new Set<string>();
  let origin: RunOrigin = runId.startsWith("interactive-") ? "interactive" : "engine";
  let ticketId: string | null = null;
  let task: string | null = null;
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  let runStatus: CallStatus = "running";

  // Accumulator for tool_call events
  const toolCallsAgg: ToolCallsAggregation = {
    total: 0,
    mcpCount: 0,
    errorCount: 0,
    byTool: {},
    byToolErrors: {},
    byServer: {},
    byServerErrors: {},
  };
  // Newest event timestamp seen — used to decide whether a non-terminal run is still live or has
  // gone idle (e.g. its terminal was killed with Ctrl-C, so no run_finished was ever written).
  let lastEventMs = 0;

  for (const e of events) {
    const tMs = Date.parse(e.ts);
    if (Number.isFinite(tMs)) lastEventMs = Math.max(lastEventMs, tMs);
    switch (e.type) {
      case "run_started":
        origin = e.origin ?? origin;
        ticketId = e.ticketId;
        task = e.task;
        startedAt = e.ts;
        break;
      case "phase_started":
        notePhaseInto(e.phase, phaseSeen, phaseOrder);
        break;
      case "agent_call_started": {
        notePhaseInto(e.phase, phaseSeen, phaseOrder);
        calls.set(e.callId, {
          id: e.callId,
          runId,
          phase: e.phase,
          model: e.model,
          promptSummary: e.promptSummary ?? "",
          tokens: 0,
          costUsd: null,
          durationMs: null,
          status: "running",
          startedAt: e.ts,
          finishedAt: null,
          origin,
          subtaskKey: e.subtaskKey,
        });
        break;
      }
      case "agent_call_finished":
        notePhaseInto(e.phase, phaseSeen, phaseOrder);
        applyCallFinished(e, calls, runId, origin);
        break;
      case "tool_call":
        applyToolCall(e, toolCallsAgg);
        break;
      case "run_finished":
        runStatus = mapRunFinishedStatus(e.status);
        finishedAt = e.ts;
        break;
      default:
        break;
    }
  }

  const phases: PhaseDTO[] = phaseOrder.map((name) => buildPhase(name, [...calls.values()].filter((c) => c.phase === name)));
  const allCalls = [...calls.values()];
  const tokens = sum(allCalls.map((c) => c.tokens));
  const costUsd = sum(allCalls.map((c) => c.costUsd ?? 0));
  const endMs = finishedAt ? Date.parse(finishedAt) : nowMs;
  const wallClockMs = startedAt ? Math.max(0, endMs - Date.parse(startedAt)) : 0;

  return {
    runId,
    origin,
    ticketId,
    task,
    startedAt,
    finishedAt,
    status: deriveRunStatus(runStatus, allCalls, {
      nowMs,
      lastEventMs,
      hasActivity: allCalls.length > 0 || toolCallsAgg.total > 0,
    }),
    phases,
    totals: { tokens, costUsd, wallClockMs, callCount: allCalls.length },
    toolCalls: toolCallsAgg,
  };
}

function applyToolCall(e: ToolCallEvent, agg: ToolCallsAggregation): void {
  const isError = e.status === "error";
  agg.total += 1;
  agg.byTool[e.tool] = (agg.byTool[e.tool] ?? 0) + 1;
  if (isError) {
    agg.errorCount += 1;
    agg.byToolErrors[e.tool] = (agg.byToolErrors[e.tool] ?? 0) + 1;
  }
  if (e.isMcp) {
    agg.mcpCount += 1;
    if (e.mcpServer) {
      agg.byServer[e.mcpServer] = (agg.byServer[e.mcpServer] ?? 0) + 1;
      if (isError) agg.byServerErrors[e.mcpServer] = (agg.byServerErrors[e.mcpServer] ?? 0) + 1;
    }
  }
}

function buildPhase(name: string, calls: AgentCallDTO[]): PhaseDTO {
  return {
    name,
    status: aggregateStatus(calls),
    calls,
    totals: {
      tokens: sum(calls.map((c) => c.tokens)),
      costUsd: sum(calls.map((c) => c.costUsd ?? 0)),
      durationMs: sum(calls.map((c) => c.durationMs ?? 0)),
    },
  };
}

// failed > running > done > queued
function aggregateStatus(calls: CallStatusBearer[]): CallStatus {
  if (calls.some((c) => c.status === "failed")) return "failed";
  if (calls.some((c) => c.status === "running")) return "running";
  if (calls.length > 0 && calls.every((c) => c.status === "done")) return "done";
  return "queued";
}

interface CallStatusBearer {
  status: CallStatus;
}

/**
 * A run is considered idle (its session ended without a terminal `run_finished` event — e.g. the
 * terminal was killed with Ctrl-C) when no event has been recorded for this long. The dashboard
 * re-normalizes on every poll with a fresh `nowMs`, so a run flips back to "running" the instant a
 * new tool/agent event lands — the heuristic is self-healing, not sticky.
 */
export const INTERACTIVE_IDLE_MS = 120_000;

interface RunStatusContext {
  nowMs: number;
  lastEventMs: number;
  hasActivity: boolean;
}

// A terminal run_finished status wins; otherwise infer from the calls and recency. Without a
// run_finished event we can never see a clean shutdown, so a run with no recent activity is treated
// as ended ("done"/"failed") rather than left hanging as "running"/"queued" forever.
function deriveRunStatus(fromEvent: CallStatus, calls: CallStatusBearer[], ctx: RunStatusContext): CallStatus {
  if (fromEvent === "done" || fromEvent === "failed" || fromEvent === "queued") return fromEvent;
  if (calls.some((c) => c.status === "failed")) return "failed";
  // An in-flight call (agent_call_started with no finished — engine runs) means work is genuinely
  // still running, however long it has been quiet. Never let idle override that.
  if (calls.some((c) => c.status === "running")) return "running";

  const idle = ctx.lastEventMs > 0 && ctx.nowMs - ctx.lastEventMs > INTERACTIVE_IDLE_MS;
  if (idle) return ctx.hasActivity ? "done" : "queued";
  return ctx.hasActivity ? "running" : "queued";
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}
