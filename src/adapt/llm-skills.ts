// LLM-authored skills — regenerates each .claude/skills/<name>/SKILL.md so the skill is
// grounded in THIS project's real structure and architecture docs, instead of being a
// template-substituted stub. Best-effort: returns a result describing what happened; the
// caller keeps the already-scaffolded template skills when the LLM path is unavailable.
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { runClaude } from "../analyze/claude-runner.js";
import { readMarker } from "./skill-gen-marker.js";

// The skills we regenerate, relative to the project's .claude/skills dir.
export const GENERATED_SKILLS = [
  "pr-review-backend",
  "pr-review-frontend",
  "test-backend",
  "test-frontend",
  "docs-backend",
  "docs-frontend",
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

export interface SkillGenResult {
  ran: boolean;
  reason?: string;
  summary?: string;
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
  // passed, skip the expensive step entirely (do NOT invoke claude).
  if (!opts.regen && readMarker(projectRoot)) {
    return { ran: false, reason: "already generated (use --regen-skills to re-run)" };
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
  return { ran: true, summary: out.trim().split("\n").pop() ?? "" };
}
