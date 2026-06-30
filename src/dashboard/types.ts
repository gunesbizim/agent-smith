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
  /** Aggregated counts from tool_call events. Zero-initialized when no tool_call events are present. */
  toolCalls: ToolCallsAggregation;
}

/** Aggregated per-session tool-call counts derived from `tool_call` events. */
export interface ToolCallsAggregation {
  /** Total number of tool calls (all non-Agent tools). */
  total: number;
  /** Total MCP tool calls (isMcp === true). */
  mcpCount: number;
  /** Total tool calls that ended in error (status === "error"). Powers success-rate analysis. */
  errorCount: number;
  /** Calls keyed by full tool name. */
  byTool: Record<string, number>;
  /** Error counts keyed by full tool name (only failing calls contribute). */
  byToolErrors: Record<string, number>;
  /** Calls keyed by MCP server segment (only MCP calls contribute). */
  byServer: Record<string, number>;
  /** Error counts keyed by MCP server segment (only failing MCP calls contribute). */
  byServerErrors: Record<string, number>;
}

export interface DashboardSnapshot {
  runs: RunDTO[];
  generatedAt: string;
}
