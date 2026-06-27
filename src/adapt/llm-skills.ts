// LLM-authored skills — regenerates each .claude/skills/<name>/SKILL.md so the skill is
// grounded in THIS project's real structure and architecture docs, instead of being a
// template-substituted stub. Best-effort: returns a result describing what happened; the
// caller keeps the already-scaffolded template skills when the LLM path is unavailable.
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "fs-extra";
import { runClaudeDetailed, type ClaudeRunResult } from "../analyze/claude-runner.js";
import { getMCPServer } from "../install/registry.js";
import { collectSkillGenUsage, writeSkillGenRun } from "./skillgen-telemetry.js";
import { readMarker } from "./skill-gen-marker.js";

// MCP categories whose tools help GROUND skill authoring (reading code + docs). Browser/quality/pm/
// memory servers are excluded so generation doesn't, e.g., launch a browser to author a skill.
const GROUNDING_MCP_CATEGORIES = new Set(["code-intelligence", "documentation"]);

function readMcpServers(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try {
    const cfg = fs.readJsonSync(file) as { mcpServers?: Record<string, unknown> };
    return cfg.mcpServers ?? {};
  } catch {
    return {};
  }
}

export interface GroundingMcp {
  /** Server name → config, for the servers to boot during the generation spawn. */
  servers: Record<string, unknown>;
  /** Matching `mcp__<server>` allowlist entries. */
  allow: string[];
}

/**
 * Collect the configured code-intelligence / documentation MCP servers to ground skill generation,
 * from BOTH `.mcp.json` AND `.claude/settings.json`. This matters because agent-smith writes
 * project-scoped non-browser servers (gitnexus, serena, git-memory) into settings.json — not
 * .mcp.json — so a generation spawn pointed only at .mcp.json (under --strict-mcp-config) would never
 * see them. Returns the servers to boot plus their `mcp__<server>` allowlist. Empty when none are
 * configured (generation then runs on file tools only).
 */
export function buildGroundingMcp(projectRoot: string): GroundingMcp {
  const merged: Record<string, unknown> = {
    ...readMcpServers(path.join(projectRoot, ".mcp.json")),
    ...readMcpServers(path.join(projectRoot, ".claude", "settings.json")),
  };
  const servers: Record<string, unknown> = {};
  const allow: string[] = [];
  for (const name of Object.keys(merged)) {
    const def = getMCPServer(name);
    if (def && GROUNDING_MCP_CATEGORIES.has(def.category)) {
      servers[name] = merged[name];
      allow.push(`mcp__${name}`);
    }
  }
  return { servers, allow };
}

/** Stable short hash of the generator prompt (A11) — recorded per run for reproducibility. */
export function hashPrompt(prompt: string): string {
  return crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

// The skills we regenerate, relative to the project's .claude/skills dir.
export const GENERATED_SKILLS = [
  "pr-review-backend",
  "pr-review-frontend",
  "test-backend",
  "test-frontend",
  "docs-backend",
  "docs-frontend",
  // A5 — the adversarial critic panel is grounded per project too, so each lens speaks the real stack.
  "pr-critic-security",
  "pr-critic-performance",
  "pr-critic-simplicity",
  "pr-critic-maintainability",
  "pr-critic-dx",
];

// Skill authoring fans out subagents (Task) to ground each skill in the repo, which on a large
// monorepo can take well over 10 minutes. The old hardcoded 600s cap SIGTERM'd those runs, surfacing
// as the misleading "claude unavailable" fallback. Default to 20 min and let big repos raise it via
// AGENT_SMITH_SKILLS_TIMEOUT_MS (milliseconds).
const DEFAULT_SKILLS_TIMEOUT_MS = 1_200_000;
export function skillsTimeoutMs(): number {
  const raw = process.env.AGENT_SMITH_SKILLS_TIMEOUT_MS;
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SKILLS_TIMEOUT_MS;
}

/** Thrown when an externalized prompt template file cannot be found/read (P1). */
export class SkillPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillPromptError";
  }
}

// Resolve the agent-smith package root (NOT the project root) — the prompt templates ship
// with agent-smith. Same pattern as scaffold/hooks.ts. From <out>/adapt/llm-skills.js the
// package root is two levels up.
function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..");
}

// Where the externalized generator prompt templates live. Overridable via
// AGENT_SMITH_PROMPTS_DIR so a user can test a custom prompt without editing the package.
function promptsDir(): string {
  return process.env.AGENT_SMITH_PROMPTS_DIR || path.join(getPackageRoot(), "templates", "prompts");
}

/**
 * Load and interpolate the externalized skill-generator master prompt (P1, C1 keystone).
 * Reads templates/prompts/skill-generator.md and inlines the example stub, so the prose is
 * editable without recompiling. Throws SkillPromptError if a template file is missing — the
 * caller converts that to ran:false rather than shipping a silently-empty prompt.
 */
export function loadSkillGeneratorPrompt(): string {
  const dir = promptsDir();
  const promptPath = path.join(dir, "skill-generator.md");
  const examplePath = path.join(dir, "skill-stub-example.md");

  if (!fs.existsSync(promptPath)) {
    throw new SkillPromptError(`skill-generator prompt template not found at ${promptPath}`);
  }
  if (!fs.existsSync(examplePath)) {
    throw new SkillPromptError(`skill-stub-example template not found at ${examplePath}`);
  }

  const template = fs.readFileSync(promptPath, "utf-8");
  const example = fs.readFileSync(examplePath, "utf-8").trimEnd();
  const skillList = GENERATED_SKILLS.map((s) => `  - .claude/skills/${s}/SKILL.md`).join("\n");

  return template
    .replace("{{SKILL_LIST}}", skillList)
    .replace("{{STUB_EXAMPLE}}", example);
}

/**
 * Backwards-compatible alias. The master prompt is now externalized (P1); this wrapper keeps
 * the historical name and signature. `projectRoot` is unused — prompts ship with the package.
 */
export function buildMasterSkillPrompt(_projectRoot?: string): string {
  return loadSkillGeneratorPrompt();
}

export interface SkillReportEntry {
  name: string;
  path: string;
  rewritten: boolean;
  recommendedPractices: number;
}

export interface SkillsReport {
  stack: string;
  skills: SkillReportEntry[];
  bestPracticesDoc?: string;
  notes?: string;
}

export interface SkillGenResult {
  ran: boolean;
  reason?: string;
  summary?: string;
  /** Parsed + cross-checked report (P4); absent if the model emitted no valid report block. */
  report?: SkillsReport;
  /** Hash of the generator prompt used for this run (A11); the caller stamps it into the marker. */
  promptHash?: string;
}

const SENTINEL_OPEN = "<<<AGENT_SMITH_SKILLS_REPORT";
const SENTINEL_CLOSE = "\nAGENT_SMITH_SKILLS_REPORT>>>";

/**
 * Extract the sentinel-fenced JSON skills report from claude's stdout (P4). Returns null on a
 * missing block or any parse/shape failure — the caller falls back to the one-line summary, so
 * a malformed report never fails init.
 */
export function parseSkillsReport(stdout: string): SkillsReport | null {
  const openIdx = stdout.indexOf(SENTINEL_OPEN);
  if (openIdx === -1) return null;
  // Skip the sentinel tag and the following newline (normalise CRLF → LF)
  const afterOpen = stdout.indexOf("\n", openIdx);
  if (afterOpen === -1) return null;
  const closeIdx = stdout.indexOf(SENTINEL_CLOSE, afterOpen);
  if (closeIdx === -1) return null;
  const jsonBody = stdout.slice(afterOpen + 1, closeIdx);
  try {
    const parsed = JSON.parse(jsonBody) as Partial<SkillsReport>;
    if (typeof parsed.stack !== "string" || !Array.isArray(parsed.skills)) return null;
    const skills: SkillReportEntry[] = parsed.skills
      .filter((s): s is SkillReportEntry => !!s && typeof s.name === "string" && typeof s.path === "string")
      .map((s) => ({
        name: s.name,
        path: s.path,
        rewritten: s.rewritten === true,
        recommendedPractices: Number.isFinite(s.recommendedPractices) ? s.recommendedPractices : 0,
      }));
    return { stack: parsed.stack, skills, bestPracticesDoc: parsed.bestPracticesDoc, notes: parsed.notes };
  } catch {
    return null;
  }
}

/**
 * Cross-check a parsed report against the real filesystem (P4). A skill the model CLAIMED it
 * rewrote is downgraded to rewritten:false if its file is missing or still contains a {{
 * placeholder — catching a model that reported success but left a stub behind.
 */
/**
 * Verify one generated skill is a real, decorated fit (C3) — not a stub the model claimed to
 * rewrite. Returns the list of concrete issues; empty means the file passes. Shared by the P4
 * report cross-check so there is one "perfect fit" oracle.
 *
 *  - missing file → it was never written.
 *  - residual `{{...}}` → the substitution-last invariant (B8) failed to fully resolve.
 *  - implausibly short → the model did not actually decorate the stub.
 *  - missing YAML frontmatter `name:` → the decoration contract was broken.
 */
export function verifySkillFile(absPath: string): string[] {
  const issues: string[] = [];
  let content: string;
  try {
    if (!fs.existsSync(absPath)) return ["file missing"];
    content = fs.readFileSync(absPath, "utf-8");
  } catch {
    return ["file unreadable"];
  }
  if (/\{\{[A-Za-z_]+\}\}/.test(content)) issues.push("unresolved {{placeholder}}");
  if (content.trim().length < 200) issues.push("implausibly short (likely not decorated)");
  if (!/^---[\s\S]*?\bname:\s*\S/m.test(content)) issues.push("missing frontmatter name");
  return issues;
}

export function crossCheckReport(report: SkillsReport, projectRoot: string): SkillsReport {
  const skills = report.skills.map((s) => {
    if (!s.rewritten) return s;
    const issues = verifySkillFile(path.join(projectRoot, s.path));
    return issues.length === 0 ? s : { ...s, rewritten: false };
  });
  return { ...report, skills };
}

export interface GenerateSkillsOptions {
  /** Pass the project's .mcp.json to the spawned claude so generation can use its MCP servers (P2). */
  useProjectMcp?: boolean;
  /** Disable project hooks for the generation spawn so PreToolUse hooks don't block Write (P2). */
  suppressHooks?: boolean;
  /** Re-run generation even if the first-run marker is present (`--regen-skills`). */
  regen?: boolean;
}

// Run the generation spawn: boot ONLY the configured code-intelligence / documentation MCP servers
// (from .mcp.json AND .claude/settings.json) via a temp strict config so generation can prefer them,
// suppress project hooks so Write isn't gated, and clean up the temp config afterward.
function runSkillGenClaude(projectRoot: string, prompt: string, opts: GenerateSkillsOptions): ClaudeRunResult {
  const grounding = opts.useProjectMcp ? buildGroundingMcp(projectRoot) : { servers: {}, allow: [] };
  let mcpConfigPath: string | undefined;
  let tmpMcpDir: string | undefined;
  if (Object.keys(grounding.servers).length > 0) {
    tmpMcpDir = fs.mkdtempSync(path.join(os.tmpdir(), "as-skillgen-mcp-"));
    mcpConfigPath = path.join(tmpMcpDir, "mcp.json");
    fs.writeJsonSync(mcpConfigPath, { mcpServers: grounding.servers });
  }
  try {
    return runClaudeDetailed(prompt, {
      cwd: projectRoot,
      allowedTools: ["Read", "Glob", "Grep", "Write", "Task", ...grounding.allow],
      timeoutMs: skillsTimeoutMs(),
      mcpConfigPath,
      suppressHooks: opts.suppressHooks,
      // JSON output yields the session id so we can locate the transcript and surface tool/MCP usage.
      outputFormat: "json",
    });
  } finally {
    if (tmpMcpDir) {
      try {
        fs.removeSync(tmpMcpDir);
      } catch {
        /* best-effort temp cleanup */
      }
    }
  }
}

// Best-effort: surface the generation's tool usage (incl. MCP) in the dashboard. Never throws.
function recordSkillGenUsage(projectRoot: string, sessionId: string | undefined): void {
  if (!sessionId) return;
  try {
    const usage = collectSkillGenUsage(sessionId);
    if (usage) writeSkillGenRun(projectRoot, usage);
  } catch {
    /* telemetry is best-effort */
  }
}

// P3/A11: If generation already ran (and regen not forced), return early with a drift note if needed.
function checkFirstRunGate(projectRoot: string, regen?: boolean): SkillGenResult | null {
  if (regen) return null;
  const marker = readMarker(projectRoot);
  if (!marker) return null;
  let drift = "";
  try {
    if (marker.promptHash && marker.promptHash !== hashPrompt(loadSkillGeneratorPrompt())) {
      drift = " — note: the generator prompt CHANGED since this run; re-run with --regen-skills to refresh";
    }
  } catch { /* prompt unreadable → no drift note */ }
  return { ran: false, reason: `already generated (use --regen-skills to re-run)${drift}` };
}

// Guard: the skill stubs and at least one architecture doc must exist before we invoke the LLM.
function checkPreconditions(projectRoot: string): SkillGenResult | null {
  const skillsDir = path.join(projectRoot, ".claude", "skills");
  const haveStubs = GENERATED_SKILLS.every((s) =>
    fs.existsSync(path.join(skillsDir, s, "SKILL.md")),
  );
  if (!haveStubs) return { ran: false, reason: "skill stubs not scaffolded yet" };

  // P5: proceed if AT LEAST ONE architecture doc exists — frontend-only / CLI projects never
  // produce backend-architecture.md, so a backend-only guard caused silent skips.
  const archDir = path.join(projectRoot, "docs", "architecture");
  const haveArchDoc =
    fs.existsSync(path.join(archDir, "backend-architecture.md")) ||
    fs.existsSync(path.join(archDir, "frontend-architecture.md"));
  if (!haveArchDoc) return { ran: false, reason: "architecture docs not generated yet" };

  return null;
}

// Regenerate skills in place via the LLM. Requires the scaffolded stubs + architecture docs
// to already exist under projectRoot. Returns ran:false (with a reason) on any failure so
// the caller silently keeps the template-customized skills.
export function generateSkills(projectRoot: string, opts: GenerateSkillsOptions = {}): SkillGenResult {
  const gateResult = checkFirstRunGate(projectRoot, opts.regen);
  if (gateResult) return gateResult;

  const preResult = checkPreconditions(projectRoot);
  if (preResult) return preResult;

  let prompt: string;
  try {
    prompt = loadSkillGeneratorPrompt();
  } catch (err) {
    if (err instanceof SkillPromptError) {
      return { ran: false, reason: err.message };
    }
    throw err;
  }
  // P2/P3: boot the grounding MCP servers + suppress hooks (see runSkillGenClaude); record best-effort
  // dashboard telemetry after a successful run.
  const res = runSkillGenClaude(projectRoot, prompt, opts);
  if (res.text === null) {
    // Distinguish a real timeout (the common large-repo case) from claude being unavailable, so the
    // user gets an actionable reason instead of the old catch-all.
    const reason =
      res.status === "timeout"
        ? `LLM skill generation timed out after ${Math.round(skillsTimeoutMs() / 1000)}s — raise AGENT_SMITH_SKILLS_TIMEOUT_MS (ms) for large repos, then re-run with --regen-skills`
        : "LLM skill generation failed or claude unavailable";
    return { ran: false, reason };
  }
  const out = res.text;
  recordSkillGenUsage(projectRoot, res.sessionId);
  const parsed = parseSkillsReport(out);
  const report = parsed ? crossCheckReport(parsed, projectRoot) : undefined;
  // A11: record the prompt hash so the caller can stamp it into the marker for reproducibility.
  return { ran: true, summary: out.trim().split("\n").pop() ?? "", report, promptHash: hashPrompt(prompt) };
}
