// Shared headless-claude runner — the single place that shells out to the `claude` CLI.
//
// Two call shapes are needed across agent-smith:
//   1. Isolated classification (stack detection): no repo access, inline evidence, fast.
//   2. Grounded generation (architecture docs, skills): MUST read the real repo and may
//      summon subagents, so it runs IN the project with file tools enabled.
//
// All calls are best-effort: any failure (no binary, timeout, non-zero exit) returns null
// so callers can fall back to templates.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

// Is the `claude` CLI available to shell out to?
export function isClaudeAvailable(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 10_000 }); // NOSONAR — fixed binary, no shell, no user input
    return true;
  } catch {
    return false;
  }
}

export interface ClaudeRunOptions {
  // Working directory for the claude process. Defaults to a private temp dir (isolated).
  cwd?: string;
  // Tools the model may use, e.g. ["Read","Glob","Grep","Task","Write"]. Empty = no tools.
  allowedTools?: string[];
  // Milliseconds before the call is killed.
  timeoutMs?: number;
  // Max stdout bytes to buffer.
  maxBuffer?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

// Run a single headless `claude -p` prompt and return its stdout, or null on any failure.
// When opts.cwd is omitted, runs in a private mkdtemp dir (mode 0700) so no repo access
// and no project hooks/MCP servers boot. When opts.cwd is set (generation tasks), the
// caller is responsible for choosing a safe directory (typically the project root).
export function runClaude(prompt: string, opts: ClaudeRunOptions = {}): string | null {
  let scratch: string | null = null;
  try {
    let cwd = opts.cwd;
    if (!cwd) {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-claude-"));
      cwd = scratch;
    }

    const args = ["-p", prompt, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'];
    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push("--allowedTools", ...opts.allowedTools);
    }

    const out = execFileSync("claude", args, { // NOSONAR — fixed binary, no shell, no user input in argv
      cwd,
      encoding: "utf-8",
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
    });
    return out;
  } catch {
    return null;
  } finally {
    if (scratch) {
      try { fs.removeSync(scratch); } catch { /* best-effort cleanup */ }
    }
  }
}
