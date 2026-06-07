// Template engine — resolve {{PLACEHOLDER}} vars in text content
import { resolveTemplate, TEMPLATE_VAR_PATTERN, DEFAULT_TEMPLATE_VARS } from "../shared/templates.js";
import type { TemplateVariables } from "../shared/types.js";

export { resolveTemplate };

export function resolveAll(
  content: string,
  vars: Partial<TemplateVariables> = {},
): string {
  return resolveTemplate(content, vars);
}

export function extractPlaceholders(content: string): string[] {
  const matches = content.matchAll(TEMPLATE_VAR_PATTERN);
  return [...new Set([...matches].map((m) => m[1]))];
}

export function validateTemplates(
  templates: Record<string, string>,
): { valid: boolean; missing: string[]; unresolved: Record<string, string[]> } {
  const issues: Record<string, string[]> = {};
  let valid = true;

  for (const [path, content] of Object.entries(templates)) {
    const placeholders = extractPlaceholders(content);
    const unresolved = placeholders.filter(
      (p) => !(p in DEFAULT_TEMPLATE_VARS),
    );
    if (unresolved.length > 0) {
      issues[path] = unresolved;
      valid = false;
    }
  }

  return { valid, missing: [], unresolved: issues };
}

export { TEMPLATE_VAR_PATTERN };
