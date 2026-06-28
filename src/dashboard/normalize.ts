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
  const toolCallsAgg: ToolCallsAggregation = { total: 0, mcpCount: 0, byTool: {}, byServer: {} };

  for (const e of events) {
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
    status: deriveRunStatus(runStatus, allCalls),
    phases,
    totals: { tokens, costUsd, wallClockMs, callCount: allCalls.length },
    toolCalls: toolCallsAgg,
  };
}

function applyToolCall(e: ToolCallEvent, agg: ToolCallsAggregation): void {
  agg.total += 1;
  agg.byTool[e.tool] = (agg.byTool[e.tool] ?? 0) + 1;
  if (e.isMcp) {
    agg.mcpCount += 1;
    if (e.mcpServer) {
      agg.byServer[e.mcpServer] = (agg.byServer[e.mcpServer] ?? 0) + 1;
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

// A terminal run_finished status wins; otherwise infer from the calls.
function deriveRunStatus(fromEvent: CallStatus, calls: CallStatusBearer[]): CallStatus {
  if (fromEvent === "done" || fromEvent === "failed" || fromEvent === "queued") return fromEvent;
  return aggregateStatus(calls);
}

function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}
