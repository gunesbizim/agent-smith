#!/usr/bin/env node
/**
 * Stop hook — detects uncommitted changes and documentation gaps at session end.
 *
 * The hook output is written to ~/.claude/agent-smith/last-session-state.json for the
 * next SessionStart hook to pick up and inject as context.
 *
 * File classification is layout-agnostic: a changed file counts as CODE when it has a
 * known source-code extension OR lives under a configured/known source directory. It
 * counts as DOCS only when it is a documentation file (.md, .rst, …) or under docs/.
 * This avoids the old bug where CLI/library projects (code under src/, not backend/ or
 * frontend/) had all their code changes ignored and were wrongly flagged as
 * "documentation-only".
 *
 * Configure in .claude/settings.json:
 *   "Stop": [{ "hooks": [{ "type": "command", "command": "node hooks/stop-change-detector.js" }] }]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Read the hook's JSON stdin payload (best-effort, synchronous). Returns {} on any failure.
function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf-8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Source-code file extensions across every stack Agent Smith targets.
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro",
  ".py", ".go", ".rs", ".rb", ".php", ".java", ".kt", ".kts", ".scala",
  ".cs", ".swift", ".dart", ".c", ".cc", ".cpp", ".h", ".hpp", ".m", ".mm",
  ".sql", ".sh", ".bash", ".ps1",
]);

// Documentation file extensions.
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt", ".adoc"]);

// Directories that conventionally hold backend vs frontend code (best-effort labelling).
const BACKEND_DIR_HINTS = ["backend/", "server/", "api/", "services/"];
const FRONTEND_DIR_HINTS = ["frontend/", "client/", "web/", "ui/"];
const FRONTEND_EXTENSIONS = new Set([".vue", ".svelte", ".tsx", ".jsx", ".astro"]);

/**
 * Decide whether a path is code, docs, or neither, and (for code) whether it looks
 * backend or frontend. Pure — exported for testing.
 *
 * @param {string} file POSIX-style repo-relative path
 * @param {string[]} sourceDirs configured source directories (e.g. ["src"])
 */
export function classifyFile(file, sourceDirs = []) {
  const ext = path.posix.extname(file).toLowerCase();
  const normalizedDirs = sourceDirs
    .map((d) => d.replace(/^\.\/?/, "").replace(/\/?$/, "/"))
    .filter((d) => d && d !== "/");
  const underSourceDir = normalizedDirs.some((d) => file.startsWith(d));

  const isDoc = DOC_EXTENSIONS.has(ext) || file.startsWith("docs/");
  const isCode = CODE_EXTENSIONS.has(ext) || underSourceDir;

  // A documentation file under a source dir is still documentation.
  if (isDoc && !CODE_EXTENSIONS.has(ext)) return { kind: "docs" };
  if (!isCode) return { kind: "other" };

  const looksFrontend =
    FRONTEND_EXTENSIONS.has(ext) || FRONTEND_DIR_HINTS.some((d) => file.startsWith(d));
  const looksBackend = BACKEND_DIR_HINTS.some((d) => file.startsWith(d));

  return { kind: "code", side: looksFrontend ? "frontend" : looksBackend ? "backend" : "other" };
}

/**
 * Build the change report from a list of changed files. Pure — exported for testing.
 */
export function buildReport(changedFiles, sourceDirs, projectRoot) {
  const report = {
    timestamp: new Date().toISOString(),
    projectRoot,
    hasUncommittedChanges: changedFiles.length > 0,
    sourceDirs,
    changedCodeFiles: [],
    changedBackendFiles: [],
    changedFrontendFiles: [],
    changedDocsFiles: [],
    suggestions: [],
  };

  for (const file of changedFiles) {
    const { kind, side } = classifyFile(file, sourceDirs);
    if (kind === "code") {
      report.changedCodeFiles.push(file);
      if (side === "backend") report.changedBackendFiles.push(file);
      else if (side === "frontend") report.changedFrontendFiles.push(file);
    } else if (kind === "docs") {
      report.changedDocsFiles.push(file);
    }
  }

  const hasCode = report.changedCodeFiles.length > 0;
  const hasDocs = report.changedDocsFiles.length > 0;

  if (hasCode) {
    // Nudge toward the full ship pipeline when available, else a plain commit.
    const hasShip = fs.existsSync(path.join(projectRoot, ".claude", "commands", "ship.md"));
    report.suggestions.push(
      hasShip
        ? "commit: uncommitted code changes — if the task is complete, run /ship (commit → PR → review → CI), or /git to just commit"
        : "commit: uncommitted code changes — run /git to commit with conventional format",
    );
    if (!hasDocs && fs.existsSync(path.join(projectRoot, ".claude", "commands", "documentation.md"))) {
      report.suggestions.push("docs: code changed without doc updates — run /documentation latest");
    }
  } else if (hasDocs) {
    // Documentation-only is only correct when there are genuinely no code changes.
    report.suggestions.push("commit: documentation-only changes ready to commit");
  }

  return report;
}

/**
 * Resolve configured source directories. Reads .claude/agent-smith/config.json written
 * at init time; falls back to ["src"] so CLI/library layouts are handled out of the box.
 */
export function resolveSourceDirs(projectRoot) {
  try {
    const cfgPath = path.join(projectRoot, ".claude", "agent-smith", "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    if (Array.isArray(cfg.sourceDirs) && cfg.sourceDirs.length > 0) return cfg.sourceDirs;
  } catch {
    /* no config — fall back */
  }
  return ["src"];
}

function cmd(command, cwd) {
  try {
    return execSync(command, { encoding: "utf-8", timeout: 5000, cwd }).trim();
  } catch {
    return null;
  }
}

function collectChangedFiles(cwd) {
  const branch = cmd("git branch --show-current 2>/dev/null", cwd);
  if (!branch) return [];
  const diffFiles = cmd("git diff --name-only HEAD 2>/dev/null", cwd);
  const stagedFiles = cmd("git diff --staged --name-only 2>/dev/null", cwd);
  const untracked = cmd("git ls-files --others --exclude-standard 2>/dev/null", cwd);
  return [
    ...(diffFiles?.split("\n") ?? []),
    ...(stagedFiles?.split("\n") ?? []),
    ...(untracked?.split("\n") ?? []),
  ].filter(Boolean);
}

function main() {
  const input = readHookInput();

  // Loop guard (per Claude Code Stop-hook contract): when Claude is already running
  // because THIS Stop hook fired (its additionalContext re-invokes the model),
  // `stop_hook_active` is true. Emitting context again would loop until the harness
  // force-ends the turn (the "blocked N times" message). On re-invocation, emit nothing
  // and exit 0 so the turn ends cleanly — the documented prevention pattern.
  if (input.stop_hook_active) {
    process.exit(0);
  }

  const cwd = process.cwd();
  const sourceDirs = resolveSourceDirs(cwd);
  const changedFiles = collectChangedFiles(cwd);
  const report = buildReport(changedFiles, sourceDirs, cwd);

  // Sentrux architectural quality gate — compare against saved baseline.
  const sentruxInstalled = !!cmd(process.platform === "win32" ? "where sentrux" : "command -v sentrux", cwd);
  if (sentruxInstalled) {
    let gateExitCode = 0;
    try {
      execSync("sentrux gate .", { encoding: "utf-8", timeout: 15000, cwd }); // NOSONAR
    } catch (err) {
      gateExitCode = err.status ?? 1;
    }
    if (gateExitCode !== 0) {
      report.suggestions.push("sentrux: architectural quality regressed this session — run `sentrux gate .` for details");
    }
  }

  // Persist state for the SessionStart hook to pick up.
  const stateDir = path.join(os.homedir(), ".claude", "agent-smith");
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "last-session-state.json"), JSON.stringify(report, null, 2));
  } catch {
    /* ignore */
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext: report.suggestions.length > 0 ? `\nAgent Smith: ${report.suggestions.join(" | ")}\n` : "",
    },
  };
  console.log(JSON.stringify(output));
}

// Run main only when executed directly as the hook entry point (not when imported by tests).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPathSafe(import.meta.url);
if (invokedDirectly) main();

function fileURLToPathSafe(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
