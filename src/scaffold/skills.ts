// Scaffold skills from templates
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { resolveTemplate } from "../shared/templates.js";
import { validateContract } from "./skill-contracts.js";
import type { TemplateVariables } from "../shared/types.js";

function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..");
}

const SKILL_TEMPLATES: Record<string, string> = {
  // Implementation worker skills — the meat of /as-backend and /as-frontend lives here so the
  // commands stay thin delegators. Both enforce test-driven design (RED-first, always).
  "backend/SKILL.md": "templates/skills/backend/SKILL.md",
  "frontend/SKILL.md": "templates/skills/frontend/SKILL.md",
  "pr-review-backend/SKILL.md": "templates/skills/pr-review-backend/SKILL.md",
  "pr-review-frontend/SKILL.md": "templates/skills/pr-review-frontend/SKILL.md",
  "test-backend/SKILL.md": "templates/skills/test-backend/SKILL.md",
  "test-frontend/SKILL.md": "templates/skills/test-frontend/SKILL.md",
  "docs-backend/SKILL.md": "templates/skills/docs-backend/SKILL.md",
  "docs-frontend/SKILL.md": "templates/skills/docs-frontend/SKILL.md",
  // A5 — adversarial critic panel (one distinct lens each; /as-pr-review fans out + synthesizes).
  "pr-critic-security/SKILL.md": "templates/skills/pr-critic-security/SKILL.md",
  "pr-critic-performance/SKILL.md": "templates/skills/pr-critic-performance/SKILL.md",
  "pr-critic-simplicity/SKILL.md": "templates/skills/pr-critic-simplicity/SKILL.md",
  "pr-critic-maintainability/SKILL.md": "templates/skills/pr-critic-maintainability/SKILL.md",
  "pr-critic-dx/SKILL.md": "templates/skills/pr-critic-dx/SKILL.md",
  // A8 — post-PR verification skill (smoke / health / migrate-rollback checklist).
  "smoke-test/SKILL.md": "templates/skills/smoke-test/SKILL.md",
  // handoff — at high context, write a structured HANDOFF.md and delegate the remaining
  // subtasks to fresh-context subagents (one per subtask).
  "handoff/SKILL.md": "templates/skills/handoff/SKILL.md",
};

// gitnexus helper skill stubs
const GITNEXUS_SKILLS: Record<string, string> = {
  "gitnexus/gitnexus-guide/SKILL.md": "gitnexus-guide",
  "gitnexus/gitnexus-exploring/SKILL.md": "gitnexus-exploring",
  "gitnexus/gitnexus-impact-analysis/SKILL.md": "gitnexus-impact-analysis",
  "gitnexus/gitnexus-debugging/SKILL.md": "gitnexus-debugging",
  "gitnexus/gitnexus-refactoring/SKILL.md": "gitnexus-refactoring",
  "gitnexus/gitnexus-cli/SKILL.md": "gitnexus-cli",
};

// git-memory helper skill stubs
const GITMEMORY_SKILLS: Record<string, string> = {
  "git-memory/git-memory-search/SKILL.md": "git-memory-search",
  "git-memory/git-memory-debug/SKILL.md": "git-memory-debug",
  "git-memory/git-memory-index/SKILL.md": "git-memory-index",
  "git-memory/git-memory-status/SKILL.md": "git-memory-status",
};

// Resolve one worker-skill template, validate its optional contract (A4), and write it.
async function writeWorkerSkill(
  skillsDir: string,
  targetDir: string,
  relPath: string,
  templatePath: string,
  vars: TemplateVariables,
  dryRun: boolean,
): Promise<void> {
  const destPath = path.join(skillsDir, relPath);
  if (!dryRun) fs.ensureDirSync(path.dirname(destPath));

  let template: string;
  try {
    template = await fs.readFile(path.join(getPackageRoot(), templatePath), "utf-8");
  } catch {
    template = await fs.readFile(path.join(targetDir, templatePath), "utf-8");
  }

  const resolved = resolveTemplate(template, vars);
  // A4 — validate any capability contract in the frontmatter (warn, never block scaffolding).
  const contractIssues = validateContract(resolved);
  if (contractIssues.length > 0) {
    console.warn(`  ⚠ contract issues in ${relPath}: ${contractIssues.join("; ")}`);
  }
  if (dryRun) {
    console.log(`  Would write: ${destPath}`);
  } else {
    await fs.writeFile(destPath, resolved, "utf-8");
  }
}

export async function scaffoldSkills(
  targetDir: string,
  vars: TemplateVariables,
  dryRun: boolean = false,
): Promise<void> {
  const skillsDir = path.join(targetDir, ".claude", "skills");
  if (!dryRun) {
    fs.ensureDirSync(skillsDir);
  }

  // Main worker skills
  for (const [relPath, templatePath] of Object.entries(SKILL_TEMPLATES)) {
    await writeWorkerSkill(skillsDir, targetDir, relPath, templatePath, vars, dryRun);
  }

  // smith-mode execution-discipline skill — copied verbatim (no template vars). Shipped to
  // every project so staged execution discipline is available and the SessionStart hook can
  // surface it each session.
  if (dryRun) {
    console.log(`  Would copy smith-mode skill to: ${path.join(skillsDir, "smith-mode")}`);
  } else {
    const smithSrc = path.join(getPackageRoot(), "templates", "skills", "smith-mode");
    const smithDest = path.join(skillsDir, "smith-mode");
    try {
      if (fs.existsSync(smithSrc)) {
        fs.ensureDirSync(smithDest);
        fs.copySync(smithSrc, smithDest, { overwrite: true });
      }
    } catch {
      // best-effort — a missing template dir should not abort the whole init
    }
  }

  // gitnexus helper skills
  for (const [relPath, _] of Object.entries(GITNEXUS_SKILLS)) {
    const destPath = path.join(skillsDir, relPath);
    if (!dryRun) {
      fs.ensureDirSync(path.dirname(destPath));
      // Copy existing stubs (no template vars in these)
      const srcPath = path.join(targetDir, "skills", relPath);
      if (fs.existsSync(srcPath)) {
        fs.copySync(srcPath, destPath);
      }
    }
  }

  // git-memory helper skills
  for (const [relPath, _] of Object.entries(GITMEMORY_SKILLS)) {
    const destPath = path.join(skillsDir, relPath);
    if (!dryRun) {
      fs.ensureDirSync(path.dirname(destPath));
      const srcPath = path.join(targetDir, "skills", relPath);
      if (fs.existsSync(srcPath)) {
        fs.copySync(srcPath, destPath);
      }
    }
  }
}
