// LLM-authored skills — regenerates each .claude/skills/<name>/SKILL.md so the skill is
// grounded in THIS project's real structure and architecture docs, instead of being a
// template-substituted stub. Best-effort: returns a result describing what happened; the
// caller keeps the already-scaffolded template skills when the LLM path is unavailable.
import path from "node:path";
import fs from "fs-extra";
import { runClaude } from "../analyze/claude-runner.js";

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

// The master prompt. It instructs the model to FIRST understand the whole project and read
// the architecture docs, THEN fan out one subagent per skill to rewrite it in place.
export function buildMasterSkillPrompt(projectRoot: string): string {
  const skillList = GENERATED_SKILLS.map((s) => `  - .claude/skills/${s}/SKILL.md`).join("\n");
  return [
    "You are the agent-smith skill generator. Your job: rewrite this project's scaffolded",
    "skill files so each is precisely grounded in THIS repository — its real structure,",
    "stack, conventions, and the architecture docs — instead of generic template stubs.",
    "",
    "You are running in the project root with Read, Glob, Grep, Write, and Task tools.",
    "",
    "## Phase 1 — Understand the project (do this FIRST, before writing anything)",
    "",
    "1. Read BOTH architecture docs — they are the binding source of truth:",
    "   - docs/architecture/backend-architecture.md",
    "   - docs/architecture/frontend-architecture.md",
    "2. Explore the real source tree (Glob/Grep/Read): directory layout, layering, naming,",
    "   test setup, lint/build commands, auth/permissions, i18n, state management, logging.",
    "3. Read every existing stub you will rewrite so you preserve its INTENT and structure:",
    skillList,
    "4. Note the configured MCP tools mentioned in the stubs (gitnexus, git-memory, serena,",
    "   sentrux, obsidian, playwright, chrome-devtools) and keep references accurate.",
    "",
    "## Phase 2 — Fan out subagents (one per skill)",
    "",
    "For EACH skill file above, summon a subagent via the Task tool. Give each subagent:",
    "  - the full path of the stub to rewrite,",
    "  - the relevant architecture doc(s) to treat as binding,",
    "  - this instruction set (below).",
    "Run them concurrently where possible. Each subagent rewrites its ONE file in place with Write.",
    "",
    "## What each subagent MUST do (edge cases template substitution misses)",
    "",
    "- Preserve the YAML frontmatter `name:` exactly; refine `description:` to match the real stack.",
    "- Replace ALL stack assumptions with what the code actually uses. The stubs assume",
    "  Django/DRF + Vue3/Vuetify/Pinia/vue-i18n — if this project differs (FastAPI, Express,",
    "  Rails, Go, Rust, React, Svelte, a CLI/library with no web tier, a monorepo, etc.),",
    "  rewrite accordingly. NEVER leave a rule that does not apply to this repo.",
    "- If a side does not exist (e.g. no frontend for a CLI tool), the corresponding skill",
    "  must say so plainly and scope itself to what exists, not invent a stack.",
    "- Use the REAL commands from the architecture docs / package manifests (test, lint,",
    "  typecheck, build, dev server) — never placeholders.",
    "- Keep the skill's workflow shape (Plan → analyze → act → verify) and its MCP-tool usage",
    "  steps, but make every command and path correct for this repo.",
    "- Resolve any remaining {{TEMPLATE_VARS}} to concrete values; leave no unresolved braces.",
    "- Reference sibling commands by their as-* names (e.g. /as-pr-review, /as-test).",
    "- Serena correctness (CRITICAL — only emit calls that actually exist):",
    "    * Real tools: mcp__serena__get_symbols_overview, find_symbol, find_referencing_symbols,",
    "      replace_symbol_body, insert_after_symbol, insert_before_symbol, rename_symbol,",
    "      replace_content, check_onboarding_performed. There is NO find_implementations and NO",
    "      get_diagnostics_for_file — never emit those.",
    "    * Name paths use '/' not '.', e.g. find_symbol(name_path_pattern=\"ClassName/method\").",
    "    * find_referencing_symbols requires BOTH name_path AND relative_path.",
    "    * Instruct: run check_onboarding_performed once before Serena; load deferred Serena",
    "      tools via tool-search first; edit code discovered via Serena with Serena's symbolic",
    "      edit tools (built-in Edit is refused after a Serena read); Serena line numbers are 0-based.",
    "    * To verify after edits, run the project's type-check/test gate — not a diagnostics tool.",
    "- Every rule must be concrete and checkable by a reviewer — no generic filler.",
    "- Output is the rewritten file ONLY (via Write); do not add commentary inside the file.",
    "",
    "## Phase 3 — Verify",
    "",
    "After all subagents finish, re-read each file and confirm: valid frontmatter, no leftover",
    "{{...}} placeholders, no wrong-stack rules, real commands. Fix any that fall short.",
    "",
    "When done, output a one-line summary: which skills you rewrote and the stack you grounded them in.",
  ].join("\n");
}

export interface SkillGenResult {
  ran: boolean;
  reason?: string;
  summary?: string;
}

// Regenerate skills in place via the LLM. Requires the scaffolded stubs + architecture docs
// to already exist under projectRoot. Returns ran:false (with a reason) on any failure so
// the caller silently keeps the template-customized skills.
export function generateSkills(projectRoot: string): SkillGenResult {
  // Guard: the stubs and at least one architecture doc must exist.
  const skillsDir = path.join(projectRoot, ".claude", "skills");
  const archDir = path.join(projectRoot, "docs", "architecture");
  const haveStubs = GENERATED_SKILLS.every((s) =>
    fs.existsSync(path.join(skillsDir, s, "SKILL.md")),
  );
  if (!haveStubs) {
    return { ran: false, reason: "skill stubs not scaffolded yet" };
  }
  if (!fs.existsSync(path.join(archDir, "backend-architecture.md"))) {
    return { ran: false, reason: "architecture docs not generated yet" };
  }

  const prompt = buildMasterSkillPrompt(projectRoot);
  const out = runClaude(prompt, {
    cwd: projectRoot,
    allowedTools: ["Read", "Glob", "Grep", "Write", "Task"],
    timeoutMs: SKILLS_TIMEOUT_MS,
  });
  if (out === null) {
    return { ran: false, reason: "LLM skill generation failed or claude unavailable" };
  }
  return { ran: true, summary: out.trim().split("\n").pop() ?? "" };
}
