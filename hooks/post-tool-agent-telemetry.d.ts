// Type declarations for the post-tool-agent-telemetry hook's pure helpers (tested from src/).
export interface AgentCallEvent {
  type: "agent_call_finished";
  callId: string;
  phase: "interactive";
  model: string;
  status: "ok" | "error";
  durationMs: number;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd?: number;
  attempt: number;
  origin: "interactive";
  promptSummary: string;
  _ts?: string;
}

export function slugSession(sessionId: unknown): string;
export function summarize(text: unknown): string;
export function buildCallEvent(payload: Record<string, unknown>, runId: string, now: string): AgentCallEvent;
