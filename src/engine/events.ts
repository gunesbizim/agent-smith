// Event-sourced run log types.
//
// One JSON object per line in `.agent-smith/runs/<id>/events.jsonl`. The file is the single source
// of truth for a run (state is a pure projection of it — see run-state.ts) and the seam a dashboard
// or a future remote API reads. Every headless `claude -p` call emits exactly one
// `agent_call_started` + one `agent_call_finished` pair.

export const EVENT_SCHEMA_VERSION = 1;

/** TDD-first phase vocabulary the runtime engine speaks. */
export type TddPhase = "understand" | "red" | "plan" | "code" | "review" | "pr";

/** Model alias recorded on a call. Open string so full ids ("claude-opus-4-8") pass through. */
export type AgentModel = "opus" | "sonnet" | "haiku" | "fable" | (string & {});

export type EngineEventType =
  | "run_started"
  | "phase_started"
  | "phase_finished"
  | "plan_generated"
  | "subtask_started"
  | "subtask_finished"
  | "agent_call_started"
  | "agent_call_finished"
  | "test_run"
  | "gate_result"
  | "run_finished";

/** Envelope fields stamped by the event store at append time. */
export interface EngineEventBase {
  v: number; // schema version
  seq: number; // monotonic per run, 0-based, assigned at append
  id: string; // unique id
  ts: string; // ISO-8601
  runId: string;
  type: EngineEventType;
}

export interface RunStartedEvent extends EngineEventBase {
  type: "run_started";
  ticketId: string | null;
  task: string;
  branch: string;
  approvalGate: string;
  phases: string[];
  origin: "engine" | "interactive";
  engineVersion: string;
}

export interface PhaseStartedEvent extends EngineEventBase {
  type: "phase_started";
  phase: string;
  model?: AgentModel;
}

export interface PhaseFinishedEvent extends EngineEventBase {
  type: "phase_finished";
  phase: string;
  success: boolean;
  summary: string;
  filesChanged?: string[];
  warnings?: string[];
  errors?: string[];
}

export interface PlanGeneratedEvent extends EngineEventBase {
  type: "plan_generated";
  phase: string;
  subtaskCount: number;
  artifactPath: string;
}

export interface SubtaskStartedEvent extends EngineEventBase {
  type: "subtask_started";
  subtaskKey: string;
  summary: string;
  index: number;
  total: number;
}

export interface SubtaskFinishedEvent extends EngineEventBase {
  type: "subtask_finished";
  subtaskKey: string;
  status: "done" | "failed" | "skipped";
  filesChanged?: string[];
}

export interface AgentCallStartedEvent extends EngineEventBase {
  type: "agent_call_started";
  callId: string;
  phase: string;
  model: AgentModel;
  subtaskKey?: string;
  promptHash?: string;
  promptSummary?: string;
  attempt: number;
}

export interface AgentCallFinishedEvent extends EngineEventBase {
  type: "agent_call_finished";
  callId: string;
  phase: string;
  model: AgentModel;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd?: number;
  subtaskKey?: string;
  attempt: number;
  /** Tag interactive (hook-captured, non-engine) calls so the dashboard can group them. */
  origin?: "engine" | "interactive";
  /** Carried by interactive (telemetry-hook) calls that have no preceding started event. */
  promptSummary?: string;
}

export interface TestRunEvent extends EngineEventBase {
  type: "test_run";
  command: string;
  exitCode: number;
  passed: boolean;
  durationMs: number;
  logPath?: string;
}

export interface GateResultEvent extends EngineEventBase {
  type: "gate_result";
  phase: string;
  gate: string;
  decision: "approved" | "rejected" | "auto";
  by?: string;
}

export interface RunFinishedEvent extends EngineEventBase {
  type: "run_finished";
  status: "completed" | "paused" | "failed";
  lastPhase?: string;
  reason?: string;
}

export type EngineEvent =
  | RunStartedEvent
  | PhaseStartedEvent
  | PhaseFinishedEvent
  | PlanGeneratedEvent
  | SubtaskStartedEvent
  | SubtaskFinishedEvent
  | AgentCallStartedEvent
  | AgentCallFinishedEvent
  | TestRunEvent
  | GateResultEvent
  | RunFinishedEvent;

/** Distributive Omit so the discriminated union is preserved across the mapped type. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * What callers pass to appendEvent — everything except the envelope fields the store stamps
 * (`v`, `seq`, `id`, `ts`, `runId`).
 */
export type EngineEventInput = DistributiveOmit<EngineEvent, "v" | "seq" | "id" | "ts" | "runId">;
