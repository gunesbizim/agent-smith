#!/usr/bin/env node
/**
 * PostToolUse hook — agent-call telemetry.
 *
 * Matcher: `Agent` (the subagent-dispatch tool). Fires after every subagent finishes, capturing the
 * model, token usage, and duration that Claude Code reports in `tool_response`. It appends one
 * agent-call record per dispatch to a per-session interactive run log:
 *
 *   .agent-smith/runs/interactive-<session>/events.jsonl
 *
 * written in the SAME event vocabulary the engine uses, so the dashboard reads engine runs and ad-hoc
 * interactive sessions through one normalizer. This is how planning/coding done in a plain Claude Code
 * session (not via `agent-smith run`) still shows up in the tracking UI.
 *
 * Telemetry must NEVER block a tool: everything is wrapped, the hook always exits 0, and it emits an
 * empty PostToolUse result.
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "PostToolUse": [{ "matcher": "Agent", "hooks": [
 *     { "type": "command", "command": "node hooks/post-tool-agent-telemetry.js" } ]}]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---- pure, testable helpers ----

/**
 * Given a tool name like "mcp__serena__find_symbol", return the server segment ("serena").
 * Returns null for non-MCP tools.
 */
export function parseMcpServer(name) {
  if (!name || !name.startsWith("mcp__")) return null;
  const parts = name.split("__");
  // Format: mcp__<server>__<tool> → at least 3 parts
  return parts.length >= 3 ? parts[1] : null;
}

/**
 * Turn a PostToolUse(non-Agent) payload into a tool_call event body.
 * Pure — no fs. `now` is an ISO string so tests are deterministic.
 */
export function buildToolCallEvent(payload, runId, now) {
  const resp = payload.tool_response || {};
  const toolName = payload.tool_name || "unknown";
  const isMcp = toolName.startsWith("mcp__");
  const mcpServer = parseMcpServer(toolName);
  const durationMs = numOrUndef(resp.totalDurationMs);
  const event = {
    type: "tool_call",
    tool: toolName,
    isMcp,
    mcpServer,
    status: resp.status === "error" ? "error" : "ok",
    _ts: now,
  };
  if (durationMs !== undefined) event.durationMs = durationMs;
  return event;
}

export function slugSession(sessionId) {
  const s = String(sessionId || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 32);
  return s || "unknown";
}

export function summarize(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Turn a PostToolUse(Agent) payload into an agent_call_finished event body (sans envelope).
 * Pure — no fs. `now` is an ISO string so tests are deterministic.
 */
export function buildCallEvent(payload, runId, now) {
  const input = payload.tool_input || {};
  const resp = payload.tool_response || {};
  const model = resp.resolvedModel || input.model || input.subagent_type || "unknown";
  const total = numOrUndef(resp.totalTokens);
  const usage = resp.usage || {};
  const tokens = total !== undefined ? { total } : usageTokens(usage);
  return {
    type: "agent_call_finished",
    callId: payload.tool_use_id || crypto.randomUUID(),
    phase: "interactive",
    model,
    status: resp.status === "error" ? "error" : "ok",
    durationMs: numOrUndef(resp.totalDurationMs) ?? 0,
    tokens,
    costUsd: numOrUndef(resp.totalCostUsd),
    attempt: 1,
    origin: "interactive",
    promptSummary: summarize(input.prompt || input.description),
    _ts: now, // surfaced so main can stamp the envelope; stripped before writing if desired
  };
}

function usageTokens(usage) {
  const input = numOrUndef(usage.input_tokens);
  const output = numOrUndef(usage.output_tokens);
  if (input === undefined && output === undefined) return undefined;
  return { input, output, total: (input ?? 0) + (output ?? 0) };
}

function numOrUndef(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// ---- hook entry point ----

function appendLine(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + "\n");
}

function nextSeq(file) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return raw.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

function main() {
  try {
    let payload = {};
    try {
      const raw = fs.readFileSync(0, "utf-8").trim();
      if (raw) payload = JSON.parse(raw);
    } catch {
      /* no stdin */
    }

    const cwd = payload.cwd || process.cwd();
    const runId = `interactive-${slugSession(payload.session_id)}`;
    const dir = path.join(cwd, ".agent-smith", "runs", runId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "events.jsonl");
    const ts = new Date().toISOString();

    const stamp = (body, seq) => ({ v: 1, seq, id: crypto.randomUUID(), ts, runId, ...body });

    if (nextSeq(file) === 0) {
      appendLine(
        file,
        stamp(
          {
            type: "run_started",
            ticketId: null,
            task: "interactive session",
            branch: "",
            approvalGate: "none",
            phases: ["interactive"],
            origin: "interactive",
            engineVersion: "hook",
          },
          0,
        ),
      );
    }

    // Branch: Agent tool → richer agent_call_finished; all other tools → lightweight tool_call
    const toolName = payload.tool_name || "";
    const event =
      toolName === "Agent"
        ? buildCallEvent(payload, runId, ts)
        : buildToolCallEvent(payload, runId, ts);
    delete event._ts;
    appendLine(file, stamp(event, nextSeq(file)));
  } catch {
    /* telemetry is best-effort and must never block a tool */
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse" } }));
  process.exit(0);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) main();

function fileURLToPathSafe(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
