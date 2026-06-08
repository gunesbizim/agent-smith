// Skill customizer — adapts skill stubs for the detected project
import path from "node:path";
import fs from "fs-extra";
import type { TemplateVariables } from "../shared/types.js";
import { resolveTemplate } from "../shared/templates.js";

const SKILL_FILES = [
  ".claude/skills/pr-review-backend/SKILL.md",
  ".claude/skills/pr-review-frontend/SKILL.md",
  ".claude/skills/test-backend/SKILL.md",
  ".claude/skills/test-frontend/SKILL.md",
  ".claude/skills/docs-backend/SKILL.md",
  ".claude/skills/docs-frontend/SKILL.md",
];

const COMMAND_FILES = [
  ".claude/commands/backend.md",
  ".claude/commands/frontend.md",
  ".claude/commands/test.md",
  ".claude/commands/pr-review.md",
  ".claude/commands/documentation.md",
  ".claude/commands/git.md",
];

export async function customizeSkills(
  targetDir: string,
  vars: TemplateVariables,
  dryRun: boolean = false,
): Promise<void> {
  // Customize all skill files
  for (const relPath of SKILL_FILES) {
    const filePath = path.join(targetDir, relPath);
    if (!fs.existsSync(filePath)) continue;

    let content = await fs.readFile(filePath, "utf-8");

    // Apply template variable substitution
    content = resolveTemplate(content, vars);

    // Apply framework-specific customizations
    content = applyFrameworkCustomizations(content, vars);

    if (dryRun) {
      console.log(`  Would customize: ${filePath}`);
    } else {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }

  // Customize all command files
  for (const relPath of COMMAND_FILES) {
    const filePath = path.join(targetDir, relPath);
    if (!fs.existsSync(filePath)) continue;

    let content = await fs.readFile(filePath, "utf-8");
    content = resolveTemplate(content, vars);
    content = applyFrameworkCustomizations(content, vars);

    if (dryRun) {
      console.log(`  Would customize: ${filePath}`);
    } else {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}

function applyFrameworkCustomizations(content: string, vars: TemplateVariables): string {
  // Remove framework-specific sections that don't apply
  const isDjango = vars.BACKEND_FRAMEWORK.toLowerCase().includes("django");
  const isVue = vars.FRONTEND_FRAMEWORK.toLowerCase().includes("vue");

  // Django-specific sections — strip if not Django
  if (!isDjango) {
    content = content.replace(
      /## Django \/ DRF patterns[\s\S]*?(?=## |$)/g,
      (_match) => {
        return "<!-- Django-specific patterns removed — project uses {{BACKEND_FRAMEWORK}} -->\n\n";
      },
    );

    // Replace DRF-specific commands
    content = content.replace(/python manage\.py/g, "# {{BACKEND_MIGRATE_CMD}}");
    content = content.replace(/drf-spectacular/g, "{{API_DOCS_LIBRARY}}");
  }

  // Vue-specific sections — strip if not Vue
  if (!isVue) {
    content = content.replace(
      /<script setup lang="ts">[\s\S]*?<\/script>/g,
      (_match) => "// Vue-specific code removed — project uses {{FRONTEND_FRAMEWORK}}",
    );
    content = content.replace(/\.vue['"]/g, ".tsx'  ");
    content = content.replace(/Vuetify 3/g, vars.FRONTEND_UI_LIBRARY);
  }

  // Vuetify-specific — strip if not Vuetify
  if (!vars.FRONTEND_UI_LIBRARY?.toLowerCase().includes("vuetify")) {
    content = content.replace(
      /## Vuetify[\s\S]*?(?=## |$)/g,
      "<!-- Vuetify section not applicable -->\n",
    );
  }

  return content;
}
