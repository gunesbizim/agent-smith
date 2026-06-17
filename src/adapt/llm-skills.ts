// LLM-authored skills — regenerates each .claude/skills/<name>/SKILL.md so the skill is
// grounded in THIS project's real structure and architecture docs, instead of being a
// template-substituted stub. Best-effort: returns a result describing what happened; the
// caller keeps the already-scaffolded template skills when the LLM path is unavailable.
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import fs from "fs-extra";
import { runClaude } from "../analyze/claude-runner.js";
import { readMarker } from "./skill-gen-marker.js";

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

const SKILLS_TIMEOUT_MS = 600_000; // skill authoring fans out subagents — allow several minutes

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

const REPORT_SENTINEL = /<<<AGENT_SMITH_SKILLS_REPORT\s*([\s\S]*?)\s*AGENT_SMITH_SKILLS_REPORT>>>/;

/**
 * Extract the sentinel-fenced JSON skills report from claude's stdout (P4). Returns null on a
 * missing block or any parse/shape failure — the caller falls back to the one-line summary, so
 * a malformed report never fails init.
 */
export function parseSkillsReport(stdout: string): SkillsReport | null {
  const m = REPORT_SENTINEL.exec(stdout);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as Partial<SkillsReport>;
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

// Regenerate skills in place via the LLM. Requires the scaffolded stubs + architecture docs
// to already exist under projectRoot. Returns ran:false (with a reason) on any failure so
// the caller silently keeps the template-customized skills.
export function generateSkills(projectRoot: string, opts: GenerateSkillsOptions = {}): SkillGenResult {
  // P3: first-run gate. If generation already ran for this repo and --regen-skills was not
  // passed, skip the expensive step entirely (do NOT invoke claude). A11: if the generator
  // prompt changed since the recorded run, say so — the prior output is no longer reproducible
  // from the current prompt, so a regen is advisable.
  if (!opts.regen) {
    const marker = readMarker(projectRoot);
    if (marker) {
      let drift = "";
      try {
        if (marker.promptHash && marker.promptHash !== hashPrompt(loadSkillGeneratorPrompt())) {
          drift = " — note: the generator prompt CHANGED since this run; re-run with --regen-skills to refresh";
        }
      } catch { /* prompt unreadable → no drift note */ }
      return { ran: false, reason: `already generated (use --regen-skills to re-run)${drift}` };
    }
  }

  // Guard: the stubs and at least one architecture doc must exist.
  const skillsDir = path.join(projectRoot, ".claude", "skills");
  const archDir = path.join(projectRoot, "docs", "architecture");
  const haveStubs = GENERATED_SKILLS.every((s) =>
    fs.existsSync(path.join(skillsDir, s, "SKILL.md")),
  );
  if (!haveStubs) {
    return { ran: false, reason: "skill stubs not scaffolded yet" };
  }
  // P5: generation proceeds if AT LEAST ONE architecture doc exists. A frontend-only or
  // CLI/library project never produces backend-architecture.md, so a backend-only guard
  // made those projects silently skip generation. The per-skill subagents already scope a
  // side that does not exist.
  const haveArchDoc =
    fs.existsSync(path.join(archDir, "backend-architecture.md")) ||
    fs.existsSync(path.join(archDir, "frontend-architecture.md"));
  if (!haveArchDoc) {
    return { ran: false, reason: "architecture docs not generated yet" };
  }

  let prompt: string;
  try {
    prompt = loadSkillGeneratorPrompt();
  } catch (err) {
    if (err instanceof SkillPromptError) {
      return { ran: false, reason: err.message };
    }
    throw err;
  }
  // P2/P3: when generating against the live project, boot its MCP servers and suppress the
  // project's hooks so the model's Write calls aren't blocked by the sentrux/git PreToolUse
  // gates. The .mcp.json path is guarded by runClaude (falls back to zero-MCP if absent).
  const out = runClaude(prompt, {
    cwd: projectRoot,
    allowedTools: ["Read", "Glob", "Grep", "Write", "Task"],
    timeoutMs: SKILLS_TIMEOUT_MS,
    mcpConfigPath: opts.useProjectMcp ? path.join(projectRoot, ".mcp.json") : undefined,
    suppressHooks: opts.suppressHooks,
  });
  if (out === null) {
    return { ran: false, reason: "LLM skill generation failed or claude unavailable" };
  }
  const parsed = parseSkillsReport(out);
  const report = parsed ? crossCheckReport(parsed, projectRoot) : undefined;
  // A11: record the prompt hash so the caller can stamp it into the marker for reproducibility.
  return { ran: true, summary: out.trim().split("\n").pop() ?? "", report, promptHash: hashPrompt(prompt) };
}
