// Wraps a headless `claude -p` call and records the agent_call event pair.
//
// This is the ONLY place the engine invokes the model, so every call is uniformly logged with model,
// tokens, cost, duration, and status. The underlying runner is injectable so the conductor can be
// unit-tested without spawning Claude.
import { randomUUID } from "node:crypto";
import { runClaudeDetailed } from "../analyze/claude-runner.js";
import { appendEvent } from "./event-store.js";
import type { AgentModel } from "./events.js";

export interface AgentCallParams {
  phase: string;
  model: AgentModel;
  prompt: string;
  subtaskKey?: string;
  allowedTools?: string[];
  cwd?: string;
  mcpConfigPath?: string;
  timeoutMs?: number;
  attempt?: number;
  promptHash?: string;
}

export interface AgentCallOutcome {
  callId: string;
  text: string | null;
  status: "ok" | "error" | "timeout";
  durationMs: number;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd?: number;
}

export type AgentCallFn = (params: AgentCallParams) => Promise<AgentCallOutcome>;

/** The runClaudeDetailed signature, injectable for tests. */
export type ClaudeRunner = typeof runClaudeDetailed;

/** Build an AgentCallFn bound to a run; emits agent_call_started/agent_call_finished around the call. */
export function makeAgentCaller(
  root: string,
  runId: string,
  runner: ClaudeRunner = runClaudeDetailed,
): AgentCallFn {
  return async (p) => {
    const callId = randomUUID();
    const attempt = p.attempt ?? 1;
    appendEvent(root, runId, {
      type: "agent_call_started",
      callId,
      phase: p.phase,
      model: p.model,
      subtaskKey: p.subtaskKey,
      promptHash: p.promptHash,
      promptSummary: summarize(p.prompt),
      attempt,
    });

    const res = runner(p.prompt, {
      cwd: p.cwd,
      allowedTools: p.allowedTools,
      mcpConfigPath: p.mcpConfigPath,
      timeoutMs: p.timeoutMs,
      model: p.model,
      outputFormat: "json",
    });

    const tokens = res.usage
      ? { input: res.usage.inputTokens, output: res.usage.outputTokens, total: res.usage.totalTokens }
      : undefined;

    appendEvent(root, runId, {
      type: "agent_call_finished",
      callId,
      phase: p.phase,
      model: p.model,
      status: res.status,
      durationMs: res.durationMs,
      tokens,
      costUsd: res.usage?.costUsd,
      subtaskKey: p.subtaskKey,
      attempt,
      origin: "engine",
    });

    return { callId, text: res.text, status: res.status, durationMs: res.durationMs, tokens, costUsd: res.usage?.costUsd };
  };
}

function summarize(prompt: string): string {
  return prompt.replace(/\s+/g, " ").trim().slice(0, 120);
}
