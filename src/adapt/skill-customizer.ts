// Skill customizer — adapts skill stubs for the detected project
import path from "node:path";
import fs from "fs-extra";
import type { TemplateVariables } from "../shared/types.js";
import { resolveTemplate } from "../shared/templates.js";
import { extractPlaceholders } from "./template-engine.js";

const SKILL_FILES = [
  ".claude/skills/backend/SKILL.md",
  ".claude/skills/frontend/SKILL.md",
  ".claude/skills/pr-review-backend/SKILL.md",
  ".claude/skills/pr-review-frontend/SKILL.md",
  ".claude/skills/test-backend/SKILL.md",
  ".claude/skills/test-frontend/SKILL.md",
  ".claude/skills/docs-backend/SKILL.md",
  ".claude/skills/docs-frontend/SKILL.md",
];

const COMMAND_FILES = [
  ".claude/commands/as-backend.md",
  ".claude/commands/as-frontend.md",
  ".claude/commands/as-test.md",
  ".claude/commands/as-pr-review.md",
  ".claude/commands/as-documentation.md",
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

    // B8: framework customizations run FIRST (they may inject {{VAR}} placeholders),
    // then substitution is the authoritative final pass.
    content = applyFrameworkCustomizations(content, vars);
    content = substituteToFixpoint(content, vars, relPath);

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
    content = applyFrameworkCustomizations(content, vars);
    content = substituteToFixpoint(content, vars, relPath);

    if (dryRun) {
      console.log(`  Would customize: ${filePath}`);
    } else {
      await fs.writeFile(filePath, content, "utf-8");
    }
  }
}

/**
 * Substitution as the authoritative final pass (B8). Resolves {{VAR}} placeholders
 * repeatedly until the output stabilises (a fixpoint) so any placeholder re-injected by
 * an earlier customization step is also resolved. Any residual `{{...}}` after the fixpoint
 * is a genuinely unknown variable: it is reported loudly rather than shipped silently.
 *
 * Exported so tests can assert the invariant directly.
 */
export function substituteToFixpoint(
  content: string,
  vars: Partial<TemplateVariables>,
  fileLabel = "<inline>",
): string {
  let prev = content;
  let out = resolveTemplate(content, vars);
  // resolveTemplate leaves unknown placeholders intact, so this converges in one extra
  // pass; the bound is a safety net against pathological self-referential placeholders.
  for (let i = 0; out !== prev && i < 5; i++) {
    prev = out;
    out = resolveTemplate(out, vars);
  }
  const residual = extractPlaceholders(out);
  if (residual.length > 0) {
    const wrapPlaceholder = (p: string): string => "{{" + p + "}}";
    const placeholderList = residual.map(wrapPlaceholder).join(", ");
    console.warn(`⚠ Unresolved template placeholders in ${fileLabel}: ${placeholderList}`);
  }
  return out;
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
