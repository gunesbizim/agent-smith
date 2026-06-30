#!/usr/bin/env node
/**
 * SessionStart hook — auto-start the Agent Smith dashboard.
 *
 * On every session start this checks whether the local dashboard is already serving on its port;
 * if not, it launches `agent-smith dashboard` as a detached background process (which opens the
 * browser once) so the user never has to start it by hand. A run that is already up is left alone —
 * the port probe makes the hook idempotent across the many sessions that can share one machine.
 *
 * Everything is best-effort: any failure is swallowed and the hook still emits a valid SessionStart
 * result so it can NEVER block a session from starting.
 *
 * Opt-out / tuning (env):
 *   AGENT_SMITH_DASHBOARD_AUTOSTART = 0 | off | false   → disable auto-start entirely
 *   AGENT_SMITH_DASHBOARD_PORT      = <port>            → port to probe / serve on (default 4575)
 *   AGENT_SMITH_DASHBOARD_OPEN      = 0 | off | false   → start the server but do not open a browser
 *   AGENT_SMITH_BIN                 = <path>            → explicit path to the agent-smith CLI entry
 *
 * Configure in .claude/settings.json (handled by src/scaffold/hooks.ts):
 *   "SessionStart": [{ "hooks": [{ "type": "command", "command": "node hooks/session-start-dashboard.js" }] }]
 */
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addSession, readState, writeState } from "./lib/dashboard-state.js";

const DEFAULT_PORT = 4575;

// ---- pure, testable helpers ----

const FALSEY = new Set(["0", "off", "false", "no"]);

export function isDisabled(env) {
  const v = String(env.AGENT_SMITH_DASHBOARD_AUTOSTART ?? "").trim().toLowerCase();
  return FALSEY.has(v);
}

export function shouldOpenBrowser(env) {
  const v = String(env.AGENT_SMITH_DASHBOARD_OPEN ?? "").trim().toLowerCase();
  return !FALSEY.has(v);
}

export function parsePort(env) {
  const n = Number.parseInt(String(env.AGENT_SMITH_DASHBOARD_PORT ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

/**
 * Resolve how to launch the dashboard. Order of preference:
 *   1. AGENT_SMITH_BIN env (explicit CLI entry path)
 *   2. <hookDir>/../bin/agent-smith.js (works inside the agent-smith package itself)
 *   3. the `agent-smith` command on PATH
 * Returns { cmd, args } where args already include the `dashboard` subcommand (sans port/dir).
 */
export function resolveDashboardCommand(hookDir, env, existsSync = fs.existsSync) {
  const envBin = env.AGENT_SMITH_BIN && String(env.AGENT_SMITH_BIN).trim();
  if (envBin && existsSync(envBin)) return { cmd: process.execPath, args: [envBin, "dashboard"] };

  const localBin = path.resolve(hookDir, "..", "bin", "agent-smith.js");
  if (existsSync(localBin)) return { cmd: process.execPath, args: [localBin, "dashboard"] };

  return { cmd: "agent-smith", args: ["dashboard"] };
}

// ---- IO helpers ----

/** Resolve true if something is already listening on 127.0.0.1:<port>. */
function isPortOpen(port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    const done = (open) => {
      sock.destroy();
      resolve(open);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

/**
 * Refcount this session into the shared dashboard state so SessionEnd can stop the server once the
 * last using session ends.
 *
 *  - When we just spawned the dashboard (`autostarted` true, real `pid`): take ownership, replacing
 *    any stale entry left by a previously-dead server on the same port.
 *  - When we found one already running (`autostarted` false, `pid` null): only register if existing
 *    state shows we auto-started a server on this port. A dashboard the user launched by hand has no
 *    such state and is left entirely alone.
 */
function registerSession(cwd, sessionId, port, pid, autostarted) {
  if (!sessionId) return; // nothing to refcount against
  try {
    const prior = readState(cwd);
    if (autostarted) {
      writeState(cwd, { pid, port, autostarted: true, sessions: [{ id: sessionId, ppid: process.ppid }] });
      return;
    }
    // Found an already-running server: only refcount onto one we own.
    if (prior && prior.autostarted && prior.port === port) {
      writeState(cwd, { ...prior, sessions: addSession(prior.sessions, sessionId, process.ppid) });
    }
  } catch {
    /* best-effort — never block session start */
  }
}

function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf-8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emit(additionalContext) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: additionalContext || "" },
    }),
  );
}

async function main() {
  const env = process.env;
  if (isDisabled(env)) {
    emit("");
    return;
  }

  let note = "";
  try {
    const payload = readStdin();
    const cwd = payload.cwd || process.cwd();
    const sessionId = payload.session_id || "";
    const port = parsePort(env);

    if (await isPortOpen(port)) {
      // Already running — point the user at it, do not spawn a second server. If we own this
      // dashboard (we auto-started it earlier), refcount this session so SessionEnd keeps it alive
      // until every using session has ended.
      registerSession(cwd, sessionId, port, /* pid */ null, /* autostarted */ false);
      emit(`▸ Agent Smith dashboard already running at http://127.0.0.1:${port}`);
      return;
    }

    const hookDir = path.dirname(fileURLToPath(import.meta.url));
    const { cmd, args } = resolveDashboardCommand(hookDir, env);
    const fullArgs = [...args, "--port", String(port), "--dir", cwd];
    if (!shouldOpenBrowser(env)) fullArgs.push("--no-open");

    const child = spawn(cmd, fullArgs, { cwd, stdio: "ignore", detached: true });
    child.on("error", () => {
      /* binary not found / not installed — best-effort, swallow */
    });
    child.unref();
    // Record the spawned pid + this session so SessionEnd can stop it once the last session ends.
    registerSession(cwd, sessionId, port, child.pid ?? null, /* autostarted */ true);
    note = `▸ Agent Smith dashboard starting at http://127.0.0.1:${port} (auto-start; set AGENT_SMITH_DASHBOARD_AUTOSTART=0 to disable)`;
  } catch {
    /* never block session start */
  }
  emit(note);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) void main();

function fileURLToPathSafe(url) {
  try {
    return fileURLToPath(url);
  } catch {
    return "";
  }
}
