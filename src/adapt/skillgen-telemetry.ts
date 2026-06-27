// Surface skill-generation tool usage (including MCP tools) in the dashboard.
//
// The generation runs headless with hooks suppressed, so the agent-call telemetry hook can't capture
// it. Instead, once generation finishes we locate that run's Claude transcript by session id, tally
// every tool call (parent orchestrator + each subagent), and write a synthetic engine run under
// `.agent-smith/runs/` so the dashboard shows what tools — and which `mcp__*` tools — were used.
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { globSync } from "tinyglobby";
import { appendEvent } from "../engine/event-store.js";
import { makeRunId } from "../engine/run-dir.js";

export interface SkillGenCall {
  /** "orchestrator" for the parent run, or the subagent transcript id. */
  label: string;
  model: string;
  tools: Record<string, number>;
}

export interface SkillGenUsage {
  sessionId: string;
  calls: SkillGenCall[];
}

/** Tally tool_use blocks from one parsed JSONL message into `tools`; update `model` if not yet set. */
function processTranscriptLine(
  line: string,
  state: { model: string; tools: Record<string, number> },
): void {
  const t = line.trim();
  if (!t) return;
  let o: { message?: unknown } & Record<string, unknown>;
  try {
    o = JSON.parse(t);
  } catch {
    return;
  }
  const msg = (o.message ?? o) as { model?: unknown; content?: unknown };
  if (state.model === "unknown" && typeof msg.model === "string") state.model = msg.model;
  if (!Array.isArray(msg.content)) return;
  for (const b of msg.content as Array<Record<string, unknown>>) {
    if (b?.type === "tool_use" && typeof b.name === "string") {
      state.tools[b.name] = (state.tools[b.name] ?? 0) + 1;
    }
  }
}

/** Tally tool_use calls (and capture the model) from one transcript JSONL file. */
export function parseTranscriptTools(file: string): { model: string; tools: Record<string, number> } {
  const state = { model: "unknown", tools: {} as Record<string, number> };
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch {
    return state;
  }
  for (const line of raw.split("\n")) {
    processTranscriptLine(line, state);
  }
  return state;
}

/**
 * Locate the transcripts for a CLI session (parent + subagents) under ~/.claude/projects and tally
 * their tool usage. Returns null when no transcript is found (so the caller skips writing a run).
 */
export function collectSkillGenUsage(sessionId: string, homeDir: string = os.homedir()): SkillGenUsage | null {
  if (!sessionId) return null;
  const projects = path.join(homeDir, ".claude", "projects");
  if (!fs.existsSync(projects)) return null;
  const parents = globSync(`*/${sessionId}.jsonl`, { cwd: projects, absolute: true });
  const subs = globSync(`*/${sessionId}/subagents/*.jsonl`, { cwd: projects, absolute: true });
  if (parents.length === 0 && subs.length === 0) return null;

  const calls: SkillGenCall[] = [];
  for (const p of parents) {
    const { model, tools } = parseTranscriptTools(p);
    calls.push({ label: "orchestrator", model, tools });
  }
  for (const s of [...subs].sort((a, b) => a.localeCompare(b))) {
    const { model, tools } = parseTranscriptTools(s);
    calls.push({ label: path.basename(s, ".jsonl"), model, tools });
  }
  return { sessionId, calls };
}

/** Write a synthetic, dashboard-readable engine run capturing the generation's per-agent tool usage. */
export function writeSkillGenRun(projectRoot: string, usage: SkillGenUsage, now: Date = new Date()): string {
  const runId = makeRunId(`skillgen-${usage.sessionId.slice(0, 8)}`, now);
  appendEvent(projectRoot, runId, {
    type: "run_started",
    ticketId: null,
    task: "LLM skill generation",
    branch: "",
    approvalGate: "none",
    phases: ["generate"],
    origin: "engine",
    engineVersion: "skill-gen",
  });
  appendEvent(projectRoot, runId, { type: "phase_started", phase: "generate" });
  usage.calls.forEach((call, i) => {
    const total = Object.values(call.tools).reduce((a, b) => a + b, 0);
    appendEvent(projectRoot, runId, {
      type: "agent_call_finished",
      callId: `${runId}-${i}`,
      phase: "generate",
      model: call.model,
      status: "ok",
      durationMs: 0,
      subtaskKey: call.label,
      attempt: 1,
      origin: "engine",
      promptSummary: `${call.label}: ${total} tool call(s)`,
      tools: call.tools,
    });
  });
  appendEvent(projectRoot, runId, {
    type: "phase_finished",
    phase: "generate",
    success: true,
    summary: `skill generation used ${usage.calls.length} agent(s)`,
  });
  appendEvent(projectRoot, runId, { type: "run_finished", status: "completed", lastPhase: "generate" });
  return runId;
}
