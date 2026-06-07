// Documentation generator — backend API docs + Playwright-driven visual docs
import type { TemplateVariables } from "../shared/types.js";

export async function generateBackendDocs(
  projectRoot: string,
  vars: TemplateVariables,
): Promise<{ endpoints: number; notes: string[] }> {
  // In production, uses gitnexus_route_map() to enumerate all endpoints
  // and generates/updates OpenAPI annotations
  return {
    endpoints: 0,
    notes: [`Documentation generated for ${vars.PROJECT_NAME} backend`],
  };
}

export async function generateFrontendUserGuide(
  projectRoot: string,
  flows: string[],
  roles: string[],
): Promise<{ flows: string[]; screenshots: string[]; notes: string[] }> {
  // In production, drives Playwright MCP per role, captures screenshots,
  // and writes the guide to Obsidian vault
  return {
    flows,
    screenshots: [],
    notes: [],
  };
}
