// Pure projection of a run's event log into current state.
//
// `projectRunState(readEvents(...))` is replay-safe: re-reading the log yields identical state. This
// is the core of resume/idempotency — the conductor skips finished phases and completed subtasks by
// consulting the projection, never a mutable side file.
import type { EngineEvent } from "./events.js";

export interface RunState {
  runId: string | null;
  ticketId: string | null;
  task: string | null;
  branch: string | null;
  approvalGate: string | null;
  phasesStarted: string[];
  phasesCompleted: string[];
  currentPhase: string | null;
  completedSubtasks: Set<string>;
  failedSubtasks: Set<string>;
  totalSubtasks: number;
  status: "running" | "paused" | "completed" | "failed";
  lastSeq: number;
  agentCalls: number;
  totalTokens: number;
  totalCostUsd: number;
}

function initialState(): RunState {
  return {
    runId: null,
    ticketId: null,
    task: null,
    branch: null,
    approvalGate: null,
    phasesStarted: [],
    phasesCompleted: [],
    currentPhase: null,
    completedSubtasks: new Set(),
    failedSubtasks: new Set(),
    totalSubtasks: 0,
    status: "running",
    lastSeq: -1,
    agentCalls: 0,
    totalTokens: 0,
    totalCostUsd: 0,
  };
}

export function projectRunState(events: EngineEvent[]): RunState {
  const s = initialState();
  for (const e of events) {
    if (e.seq > s.lastSeq) s.lastSeq = e.seq;
    s.runId ??= e.runId;
    applyEvent(s, e);
  }
  return s;
}

function applyEvent(s: RunState, e: EngineEvent): void {
  switch (e.type) {
    case "run_started":
      s.ticketId = e.ticketId;
      s.task = e.task;
      s.branch = e.branch;
      s.approvalGate = e.approvalGate;
      s.status = "running";
      break;
    case "phase_started":
      s.currentPhase = e.phase;
      if (!s.phasesStarted.includes(e.phase)) s.phasesStarted.push(e.phase);
      break;
    case "phase_finished":
      if (e.success && !s.phasesCompleted.includes(e.phase)) s.phasesCompleted.push(e.phase);
      break;
    case "plan_generated":
      s.totalSubtasks = e.subtaskCount;
      break;
    case "subtask_finished":
      if (e.status === "done") {
        s.completedSubtasks.add(e.subtaskKey);
        s.failedSubtasks.delete(e.subtaskKey);
      } else if (e.status === "failed") {
        s.failedSubtasks.add(e.subtaskKey);
      }
      break;
    case "agent_call_finished":
      s.agentCalls += 1;
      if (e.tokens?.total !== undefined) s.totalTokens += e.tokens.total;
      if (e.costUsd !== undefined) s.totalCostUsd += e.costUsd;
      break;
    case "run_finished":
      s.status = e.status;
      s.currentPhase = null;
      break;
    default:
      break;
  }
}
