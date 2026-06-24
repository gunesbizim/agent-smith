#!/usr/bin/env node
/**
 * UserPromptSubmit hook — context-pressure handoff nudge.
 *
 * Hooks aren't handed live context usage, but they ARE given `transcript_path`. This hook reads the
 * transcript, estimates current context occupancy from the LAST assistant message's `usage` block,
 * and — when it crosses a threshold (default 60% of the model's context window) — injects a one-time
 * `additionalContext` suggestion telling the model to run `/as-handoff` (write a HANDOFF.md and
 * delegate remaining work to fresh-context agents).
 *
 * It can only SUGGEST `/as-handoff` (a hook cannot auto-invoke a command). It fires at most ONCE per
 * session (a latch file keyed by session id), and is STRICTLY FAIL-OPEN — any error → empty output,
 * exit 0, so it never blocks a prompt.
 *
 * Config (env): AGENT_SMITH_HANDOFF_THRESHOLD (0..1, default 0.60),
 *               AGENT_SMITH_CONTEXT_WINDOW (tokens, default 200000).
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "UserPromptSubmit": [{ "hooks": [
 *     { "type": "command", "command": "node hooks/user-prompt-handoff-nudge.js" } ]}]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_WINDOW = 200_000;

// ---- pure, testable helpers ----

/**
 * Estimate current context tokens from a transcript JSONL string: the LAST assistant message's
 * usage block (input + cache_read + cache_creation + output) = what the model just processed =
 * current context occupancy. Summing across all lines would massively overcount, so we take only
 * the last usage we see. Returns 0 when no usage is present.
 */
export function estimateContextTokens(transcriptText) {
  let tokens = 0;
  for (const line of String(transcriptText || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let o;
    try {
      o = JSON.parse(t);
    } catch {
      continue;
    }
    const usage = (o && o.message && o.message.usage) || (o && o.usage);
    if (usage && typeof usage === "object") {
      const sum =
        num(usage.input_tokens) +
        num(usage.cache_read_input_tokens) +
        num(usage.cache_creation_input_tokens) +
        num(usage.output_tokens);
      if (sum > 0) tokens = sum; // keep the latest non-zero usage
    }
  }
  return tokens;
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Decide whether to nudge. Pure. Returns { nudge: boolean, pct: number }. */
export function decideNudge({ tokens, windowSize, threshold, alreadyNudged }) {
  const win = windowSize > 0 ? windowSize : DEFAULT_WINDOW;
  const ratio = tokens / win;
  const pct = Math.round(ratio * 100);
  return { nudge: !alreadyNudged && ratio >= threshold, pct };
}

export function nudgeMessage(pct) {
  return (
    `⚠ Context is ~${pct}% full. Consider running /as-handoff now: write a HANDOFF.md ` +
    `(goal, state, branches/PRs, next-steps-as-subtasks, verification) and delegate the remaining ` +
    `work to fresh-context subagents — quality drops as the window fills.`
  );
}

// ---- hook entry point ----

function envThreshold() {
  const n = Number(process.env.AGENT_SMITH_HANDOFF_THRESHOLD);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_THRESHOLD;
}
function envWindow() {
  const n = Number(process.env.AGENT_SMITH_CONTEXT_WINDOW);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW;
}

function emit(additionalContext) {
  const out = additionalContext
    ? { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } }
    : {};
  console.log(JSON.stringify(out));
  process.exit(0);
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
    const transcriptPath = payload.transcript_path;
    const sessionId = String(payload.session_id || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 64) || "unknown";
    if (!transcriptPath || !fs.existsSync(transcriptPath)) emit("");

    // Once-per-session latch so we nudge a single time, not on every prompt.
    const latchDir = path.join(os.homedir(), ".claude", "agent-smith");
    const latch = path.join(latchDir, `handoff-nudge-${sessionId}.flag`);
    const alreadyNudged = fs.existsSync(latch);

    const tokens = estimateContextTokens(fs.readFileSync(transcriptPath, "utf-8"));
    const { nudge, pct } = decideNudge({ tokens, windowSize: envWindow(), threshold: envThreshold(), alreadyNudged });
    if (!nudge) emit("");

    try {
      fs.mkdirSync(latchDir, { recursive: true });
      fs.writeFileSync(latch, String(Date.now()));
    } catch {
      /* latch is best-effort; worst case we nudge again later */
    }
    emit(nudgeMessage(pct));
  } catch {
    emit(""); // strictly fail-open
  }
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
