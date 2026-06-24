// Normalized DTOs the dashboard front end consumes. The browser never sees raw events.jsonl — only
// these shapes — so the on-disk event schema can evolve without touching the view, and a future
// remote (Azure) EventSource can serve the identical DTOs.

export type CallStatus = "queued" | "running" | "done" | "failed";
export type RunOrigin = "engine" | "interactive";

export interface AgentCallDTO {
  id: string;
  runId: string;
  phase: string;
  model: string;
  promptSummary: string;
  tokens: number;
  costUsd: number | null;
  durationMs: number | null;
  status: CallStatus;
  startedAt: string | null;
  finishedAt: string | null;
  origin: RunOrigin;
  subtaskKey?: string;
  /** Per-tool call counts for this agent (incl. `mcp__*`), when known. */
  tools?: Record<string, number>;
}

export interface PhaseDTO {
  name: string;
  status: CallStatus;
  calls: AgentCallDTO[];
  totals: { tokens: number; costUsd: number; durationMs: number };
}

export interface RunDTO {
  runId: string;
  origin: RunOrigin;
  ticketId: string | null;
  task: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: CallStatus;
  phases: PhaseDTO[];
  totals: { tokens: number; costUsd: number; wallClockMs: number; callCount: number };
}

export interface DashboardSnapshot {
  runs: RunDTO[];
  generatedAt: string;
}
