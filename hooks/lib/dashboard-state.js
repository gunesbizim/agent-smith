/**
 * Shared state for the dashboard auto-start / auto-stop lifecycle hooks.
 *
 * The SessionStart hook (`session-start-dashboard.js`) launches the dashboard as a detached
 * background process so it survives the hook itself. That same property means a plain Ctrl-C / kill
 * of the Claude session never reaches the dashboard — it keeps serving forever. To bind the
 * dashboard's lifetime to the sessions that actually use it, both hooks share a tiny refcount file:
 *
 *   <cwd>/.agent-smith/dashboard.json
 *   { "pid": 12345, "port": 4575, "autostarted": true,
 *     "sessions": [ { "id": "<session_id>", "ppid": <claude pid> } ] }
 *
 * SessionStart registers its session; SessionEnd deregisters it and, when no session remains AND we
 * were the ones who auto-started the server, sends it SIGTERM. This is a plain refcount keyed by
 * session id — a clean exit of every using session stops the dashboard exactly once.
 *
 * A dashboard the user started by hand is never killed: `autostarted` is only set when this hook
 * spawned the process, and SessionStart leaves a not-owned-by-us server untouched.
 *
 * We deliberately do NOT use the hook's `ppid` to decide kills. Claude Code runs `type: command`
 * hooks through a shell, so `ppid` is a transient shell that exits when the hook returns — treating
 * its death as "session ended" would wrongly kill a dashboard a sibling session is still using. The
 * residual cost of pure refcounting is that a session which crashes without firing SessionEnd leaves
 * a stale entry, so its dashboard is not auto-stopped; that orphan is reclaimed the next time the
 * port is found free (SessionStart resets ownership when it spawns a fresh server). `ppid` is still
 * recorded for debugging, and `pruneSessions`/`isProcessAlive` remain available for the safe
 * stale-state reset — never for the kill decision.
 *
 * All functions are best-effort. Reads of a missing/corrupt file yield null; writes swallow errors.
 * Concurrent read-modify-write from two near-simultaneous session events can in theory clobber one
 * entry — acceptable for a local single-user dev tool.
 */
import fs from "node:fs";
import path from "node:path";

export const STATE_DIR = ".agent-smith";
export const STATE_FILE = "dashboard.json";

export function stateFilePath(cwd) {
  return path.join(cwd, STATE_DIR, STATE_FILE);
}

// ---- pure helpers (no IO; unit-tested) ----

/** Add or refresh a session entry, keyed by id (last writer wins on ppid). */
export function addSession(sessions, id, ppid) {
  const others = (sessions || []).filter((s) => s && s.id !== id);
  return [...others, { id, ppid }];
}

/** Remove a session entry by id. */
export function removeSession(sessions, id) {
  return (sessions || []).filter((s) => s && s.id !== id);
}

/** Drop sessions whose owning Claude process (ppid) is no longer alive. */
export function pruneSessions(sessions, isAlive) {
  return (sessions || []).filter((s) => s && (s.ppid == null || isAlive(s.ppid)));
}

/**
 * Decide whether SessionEnd should stop the dashboard: only when we auto-started it (and have a pid)
 * and, after removing this session, no session remains. Pure refcount — intentionally does NOT prune
 * by ppid liveness, which would risk killing a dashboard a sibling session is still using (see the
 * file header for why ppid is not a reliable session-liveness signal).
 */
export function shouldStopDashboard(state, sessionId) {
  if (!state || !state.autostarted || !state.pid) return false;
  return removeSession(state.sessions, sessionId).length === 0;
}

// ---- IO helpers (best-effort) ----

/** True if a process with `pid` exists and is signalable by us. */
export function isProcessAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, no actual signal delivered
    return true;
  } catch (err) {
    // EPERM means the process exists but we can't signal it — still "alive" for our purposes.
    return err && err.code === "EPERM";
  }
}

export function readState(cwd) {
  try {
    const raw = fs.readFileSync(stateFilePath(cwd), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeState(cwd, state) {
  try {
    const file = stateFilePath(cwd);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function deleteState(cwd) {
  try {
    fs.rmSync(stateFilePath(cwd), { force: true });
  } catch {
    /* best-effort */
  }
}
