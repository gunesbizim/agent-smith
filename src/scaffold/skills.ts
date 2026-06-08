// Scaffold skills from templates
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import { resolveTemplate } from "../shared/templates.js";
import type { TemplateVariables } from "../shared/types.js";

function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..");
}

const SKILL_TEMPLATES: Record<string, string> = {
  "pr-review-backend/SKILL.md": "templates/skills/pr-review-backend/SKILL.md",
  "pr-review-frontend/SKILL.md": "templates/skills/pr-review-frontend/SKILL.md",
  "test-backend/SKILL.md": "templates/skills/test-backend/SKILL.md",
  "test-frontend/SKILL.md": "templates/skills/test-frontend/SKILL.md",
  "docs-backend/SKILL.md": "templates/skills/docs-backend/SKILL.md",
  "docs-frontend/SKILL.md": "templates/skills/docs-frontend/SKILL.md",
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
    const destPath = path.join(skillsDir, relPath);
    if (!dryRun) {
      fs.ensureDirSync(path.dirname(destPath));
    }

    let template: string;
    try {
      const pkgTemplatePath = path.join(getPackageRoot(), templatePath);
      template = await fs.readFile(pkgTemplatePath, "utf-8");
    } catch {
      const fallbackPath = path.join(targetDir, templatePath);
      template = await fs.readFile(fallbackPath, "utf-8");
    }

    const resolved = resolveTemplate(template, vars);
    if (dryRun) {
      console.log(`  Would write: ${destPath}`);
    } else {
      await fs.writeFile(destPath, resolved, "utf-8");
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
