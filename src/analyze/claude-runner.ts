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
import { needsShellForCli } from "../shared/platform-utils.js";

// On Windows the `claude` CLI is a `.cmd` shim that Node can't launch directly, so the call must go
// through cmd.exe (shell:true). On POSIX `claude` is a real executable and we keep shell:false so the
// arbitrary `-p <prompt>` argv is passed verbatim with no shell quoting. See needsShellForCli.
const CLI_SHELL = needsShellForCli();

// Is the `claude` CLI available to shell out to?
export function isClaudeAvailable(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 10_000, shell: CLI_SHELL }); // NOSONAR — fixed binary, args are a constant flag
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
  // Path to an .mcp.json whose servers should boot for this run (P2). When set AND the file
  // exists, it is passed via `--mcp-config <path>` (still strict, so ONLY that file's servers
  // load — never the developer's user-scope MCP set). When unset or missing, the isolated
  // zero-MCP default is kept so the fast detection path stays deterministic.
  mcpConfigPath?: string;
  // Disable project hooks for this spawn (P2/P3). The generation spawn runs in the project
  // dir, so it would otherwise load .claude/settings.json hooks (sentrux gate, git guard,
  // doctor SessionStart) which can block/slow the model's Write calls. Overrides hooks to {}.
  suppressHooks?: boolean;
  // Model alias or full id ("opus" | "sonnet" | "haiku" | "fable" | "claude-...", e.g. "claude-sonnet-5"). When set,
  // adds `--model <model>`. Omit to use the CLI's configured default (preserves every existing
  // detection/generation call). The runtime engine uses this for model routing: opus = plan/think,
  // sonnet = code.
  model?: string;
  // Request structured output via `--output-format json` so the caller can read token usage, cost,
  // and duration (see runClaudeDetailed). Off by default to keep the plain-text path byte-for-byte.
  outputFormat?: "text" | "json";
}

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

// Token/cost usage parsed from a `--output-format json` run. Fields are optional because the
// CLI envelope can change; callers must treat any field as possibly-absent.
export interface ClaudeUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface ClaudeRunResult {
  // Model text. For outputFormat "json" this is the parsed `result` field; for "text" it is stdout
  // verbatim. null on any failure (no binary, timeout, non-zero exit).
  text: string | null;
  status: "ok" | "error" | "timeout";
  // Wall-clock duration of the spawn, measured regardless of output format.
  durationMs: number;
  // Present only when outputFormat is "json" and parsing succeeded.
  usage?: ClaudeUsage;
  // The CLI session id (from the json envelope) — lets callers locate this run's transcript.
  sessionId?: string;
}

// Detailed variant: returns status, wall-clock duration, and (with outputFormat "json") token/cost
// usage. The plain-text runClaude() below is a thin wrapper over this. Never throws — failures
// surface as { text: null, status }. The runtime engine calls this so it can record per-call
// telemetry (model, tokens, cost, duration) into the event log.
export function runClaudeDetailed(prompt: string, opts: ClaudeRunOptions = {}): ClaudeRunResult {
  let scratch: string | null = null;
  const start = Date.now();
  try {
    let cwd = opts.cwd;
    if (!cwd) {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-claude-"));
      cwd = scratch;
    }

    // MCP config: pass the project's .mcp.json only when it actually exists, otherwise keep
    // the isolated zero-MCP default. Either way --strict-mcp-config ensures no user-global
    // server leakage, so generation is reproducible across machines.
    const useProjectMcp = !!opts.mcpConfigPath && fs.existsSync(opts.mcpConfigPath);
    const mcpConfigArg = useProjectMcp ? opts.mcpConfigPath! : '{"mcpServers":{}}';
    const args = ["-p", prompt, "--strict-mcp-config", "--mcp-config", mcpConfigArg];
    if (opts.allowedTools && opts.allowedTools.length > 0) {
      args.push("--allowedTools", ...opts.allowedTools);
    }
    if (opts.model) {
      args.push("--model", opts.model); // NOSONAR — value from a closed model enum/caller, not user input
    }
    if (opts.outputFormat === "json") {
      args.push("--output-format", "json");
    }
    // Hook suppression: override project hooks to empty for this invocation only. There is no
    // dedicated disable flag, so a --settings override is the mechanism (P3).
    if (opts.suppressHooks) {
      args.push("--settings", '{"hooks":{}}');
    }

    const out = execFileSync("claude", args, { // NOSONAR — fixed binary; argv from closed callers, shell only on win32 to launch the .cmd shim
      cwd,
      encoding: "utf-8",
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
      shell: CLI_SHELL,
    });

    const durationMs = Date.now() - start;
    if (opts.outputFormat === "json") {
      return { ...parseJsonEnvelope(out), durationMs };
    }
    return { text: out, status: "ok", durationMs };
  } catch (err) {
    return {
      text: null,
      status: isTimeout(err) ? "timeout" : "error",
      durationMs: Date.now() - start,
    };
  } finally {
    if (scratch) {
      try { fs.removeSync(scratch); } catch { /* best-effort cleanup */ }
    }
  }
}

// Parse the `claude -p --output-format json` envelope defensively. A CLI schema change degrades to
// { usage: undefined } (or raw text) rather than throwing, so a run never crashes on telemetry.
function parseJsonEnvelope(raw: string): Omit<ClaudeRunResult, "durationMs"> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const text = typeof obj.result === "string" ? obj.result : raw;
    const u = (obj.usage ?? {}) as Record<string, unknown>;
    const inputTokens = numOrUndef(u.input_tokens);
    const outputTokens = numOrUndef(u.output_tokens);
    const haveTokens = inputTokens !== undefined || outputTokens !== undefined;
    const usage: ClaudeUsage = {
      inputTokens,
      outputTokens,
      totalTokens: haveTokens ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined,
      costUsd: numOrUndef(obj.total_cost_usd),
    };
    const isError = obj.is_error === true || obj.subtype === "error";
    const sessionId = typeof obj.session_id === "string" ? obj.session_id : undefined;
    return { text, status: isError ? "error" : "ok", usage, sessionId };
  } catch {
    return { text: raw, status: "ok" };
  }
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

// execFileSync sets killed/signal on a timeout kill; treat those as "timeout" vs a plain "error".
function isTimeout(err: unknown): boolean {
  const e = err as { killed?: boolean; signal?: string; code?: string } | null;
  return !!e && (e.signal === "SIGTERM" || e.code === "ETIMEDOUT" || e.killed === true);
}

// Run `claude mcp list` (in `cwd`, so the project-scoped servers are checked) and return its
// stdout — the per-server health-check status Claude Code shows for `/mcp`. Best-effort: returns
// null when the CLI is absent or the call errors with no captured output. `claude mcp list` exits
// non-zero when a server fails its health check, but still prints the status table to stdout, so
// the catch path salvages `err.stdout` rather than discarding a perfectly useful result.
export function listMcpServers(cwd?: string): string | null {
  try {
    return execFileSync("claude", ["mcp", "list"], { // NOSONAR — fixed binary + constant args
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: DEFAULT_MAX_BUFFER,
      shell: CLI_SHELL,
    });
  } catch (err) {
    const e = err as { stdout?: string | Buffer } | null;
    if (e?.stdout != null) return e.stdout.toString();
    return null;
  }
}

// Run a single headless `claude -p` prompt and return its stdout, or null on any failure.
// Thin wrapper over runClaudeDetailed for the many callers that only need the text. When opts.cwd
// is omitted, runs in a private mkdtemp dir so no repo access and no project hooks/MCP servers boot.
export function runClaude(prompt: string, opts: ClaudeRunOptions = {}): string | null {
  return runClaudeDetailed(prompt, opts).text;
}
