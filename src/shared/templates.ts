// Default template variables — STACK-AGNOSTIC placeholders.
//
// These are the fallback values used ONLY when detection finds nothing. They must NOT
// describe any specific stack: an undetected field renders as honest "none", never as a
// borrowed Django/Vue/SQL-Server value. The analyze phase (evidence → StackProfile →
// mapBestPractices) overwrites every field it can determine with the project's real values.

import type { TemplateVariables } from "./types.js";

export const DEFAULT_TEMPLATE_VARS: TemplateVariables = {
  BACKEND_LANG: "none",
  BACKEND_FRAMEWORK: "none",
  BACKEND_FRAMEWORK_DETAIL: "none",
  BACKEND_TEST_CMD: "none",
  BACKEND_LINT_CMD: "none",
  BACKEND_TYPE_CHECK_CMD: "none",
  BACKEND_FORMAT_CMD: "none",
  BACKEND_DIR: ".",
  BACKEND_SETTINGS_MODULE: "none",
  BACKEND_MIGRATE_CMD: "none",

  FRONTEND_FRAMEWORK: "none",
  FRONTEND_UI_LIBRARY: "none",
  FRONTEND_TEST_CMD: "none",
  FRONTEND_LINT_CMD: "none",
  FRONTEND_TYPE_CHECK_CMD: "none",
  FRONTEND_DIR: ".",
  FRONTEND_DEV_SERVER_CMD: "none",

  ROLE_SYSTEM: "none",
  ROLE_VALID_VALUES: "none",
  AUTH_METHOD: "none",
  IMPORT_STYLE: "absolute",
  DB_ENGINE: "none",
  ORM: "none",
  PRE_PUSH_GATES: "none",
  API_DOCS_LIBRARY: "none",

  PROJECT_NAME: "my-project",
  REPO_NAME: "my-project",
  GIT_HOST: "github.com",
  DEFAULT_BRANCH: "main",
  SHIP_MAX_FIX_ATTEMPTS: "3",

  LOGGING_PATTERN: "unstructured",
  LOGGING_CANONICAL_KEYS: "none",

  // Package-specific
  ORM_PACKAGE: "none",
  ORM_PACKAGE_VERSION: "",
  AUTH_PACKAGE: "none",
  AUTH_PACKAGE_VERSION: "",
  VALIDATION_PACKAGE: "none",
  VALIDATION_PACKAGE_VERSION: "",
  LOGGING_PACKAGE: "none",
  LOGGING_PACKAGE_VERSION: "",
  DB_DRIVER_PACKAGE: "none",
  DB_DRIVER_PACKAGE_VERSION: "",
  CACHE_PACKAGE: "none",
  CACHE_PACKAGE_VERSION: "",
  UI_PACKAGE: "none",
  UI_PACKAGE_VERSION: "",
  STATE_PACKAGE: "none",
  STATE_PACKAGE_VERSION: "",
  FORM_PACKAGE: "none",
  FORM_PACKAGE_VERSION: "",
  ROUTER_PACKAGE: "none",
  ROUTER_PACKAGE_VERSION: "",
  RENDER_PACKAGE: "none",
  RENDER_PACKAGE_VERSION: "",
  TEST_FRAMEWORK_PACKAGE: "none",
  TEST_FRAMEWORK_PACKAGE_VERSION: "",
  E2E_PACKAGE: "none",
  E2E_PACKAGE_VERSION: "",
  MOCK_PACKAGE: "none",
  MOCK_PACKAGE_VERSION: "",

  TESTING_REQUIREMENTS: "unit tests for new logic, happy+error+edge paths, no empty test stubs",
  PR_CHECKLIST: "all tests pass, lint clean, 1+ reviewer approval, docs updated",

  // Sentrux quality gate
  SENTRUX_MAX_CYCLES: "0",
  SENTRUX_MAX_CC: "10",
  SENTRUX_MAX_COUPLING: "C",
  SENTRUX_LAYERS: "",
  SENTRUX_BOUNDARIES: "",
};

export const TEMPLATE_VAR_PATTERN = /\{\{(\w+)\}\}/g;

export function resolveTemplate(
  content: string,
  vars: Partial<TemplateVariables>,
): string {
  return content.replace(TEMPLATE_VAR_PATTERN, (_, key: string) => {
    if (key in vars) {
      return (vars as unknown as Record<string, string>)[key];
    }
    if (key in DEFAULT_TEMPLATE_VARS) {
      return (DEFAULT_TEMPLATE_VARS as unknown as Record<string, string>)[key];
    }
    return `{{${key}}}`; // leave unresolved placeholders intact
  });
}
