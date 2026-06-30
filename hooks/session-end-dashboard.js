#!/usr/bin/env node
/**
 * SessionEnd hook — stop the auto-started Agent Smith dashboard when the last using session ends.
 *
 * The dashboard is launched by `session-start-dashboard.js` as a detached process so it survives the
 * hook that started it. The cost of that is that killing the Claude session never reaches the
 * dashboard — it would keep serving forever. This hook closes the loop: it deregisters the ending
 * session from the shared refcount file and, once no live session is left AND we are the ones who
 * auto-started the server, sends it SIGTERM (the dashboard handles SIGTERM with a clean shutdown).
 *
 * A dashboard the user started by hand is never touched (it is not marked `autostarted`). A session
 * that crashed without firing SessionEnd is self-healed: its entry is pruned here (and on the next
 * SessionStart) once its owning Claude process is gone.
 *
 * Best-effort: every failure is swallowed and a valid SessionEnd result is always emitted. SessionEnd
 * hooks cannot block, so this only ever performs cleanup.
 *
 * Opt-out (env): AGENT_SMITH_DASHBOARD_AUTOSTART = 0 | off | false  → do not manage the dashboard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteState,
  isProcessAlive,
  readState,
  removeSession,
  shouldStopDashboard,
  writeState,
} from "./lib/dashboard-state.js";

const FALSEY = new Set(["0", "off", "false", "no"]);

export function isDisabled(env) {
  const v = String(env.AGENT_SMITH_DASHBOARD_AUTOSTART ?? "").trim().toLowerCase();
  return FALSEY.has(v);
}

function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf-8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emit() {
  // SessionEnd output carries no additionalContext (the session is ending); emit a valid envelope.
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionEnd" } }));
}

function stopDashboard(pid) {
  try {
    if (isProcessAlive(pid)) process.kill(pid, "SIGTERM");
  } catch {
    /* already gone / not signalable — nothing to do */
  }
}

async function main() {
  const env = process.env;
  if (isDisabled(env)) {
    emit();
    return;
  }

  try {
    const payload = readStdin();
    const cwd = payload.cwd || process.cwd();
    const sessionId = payload.session_id || "";
    const state = readState(cwd);

    if (state && state.autostarted) {
      if (shouldStopDashboard(state, sessionId)) {
        // Last session out — stop the server we started and clear the refcount file.
        stopDashboard(state.pid);
        deleteState(cwd);
      } else {
        // Other sessions remain — just drop our own entry.
        writeState(cwd, { ...state, sessions: removeSession(state.sessions, sessionId) });
      }
    }
  } catch {
    /* never let cleanup throw */
  }
  emit();
}

function fileURLToPathSafe(url) {
  try {
    return fileURLToPath(url);
  } catch {
    return "";
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) void main();
