// Default template variables — filled with project-agnostic defaults
// The analyze phase replaces these with detected project values

import type { TemplateVariables } from "./types.js";

export const DEFAULT_TEMPLATE_VARS: TemplateVariables = {
  BACKEND_LANG: "Python 3.12",
  BACKEND_FRAMEWORK: "Django",
  BACKEND_FRAMEWORK_DETAIL: "Django 6 + Django REST Framework 3.15",
  BACKEND_TEST_CMD: "pytest -m 'not integration'",
  BACKEND_LINT_CMD: "ruff check .",
  BACKEND_TYPE_CHECK_CMD: "mypy .",
  BACKEND_FORMAT_CMD: "ruff format --check .",
  BACKEND_DIR: "backend",
  BACKEND_SETTINGS_MODULE: "config.settings.dev",
  BACKEND_MIGRATE_CMD: "python manage.py makemigrations",

  FRONTEND_FRAMEWORK: "Vue 3",
  FRONTEND_UI_LIBRARY: "Vuetify 3",
  FRONTEND_TEST_CMD: "npx vitest run",
  FRONTEND_LINT_CMD: "npx eslint src --ext .ts,.vue",
  FRONTEND_TYPE_CHECK_CMD: "npx tsc --noEmit",
  FRONTEND_DIR: "frontend",
  FRONTEND_DEV_SERVER_CMD: "npm run dev",

  ROLE_SYSTEM: "role decorators on APIView subclasses",
  ROLE_VALID_VALUES: "admin, supervisor, lawyer",
  AUTH_METHOD: "JWT Bearer (HS256, 8h access / 7d refresh)",
  IMPORT_STYLE: "absolute",
  DB_ENGINE: "SQL Server",
  ORM: "Django ORM",
  PRE_PUSH_GATES: "ruff + mypy + pytest + lint_role_decorators",
  API_DOCS_LIBRARY: "drf-spectacular",

  PROJECT_NAME: "my-project",
  REPO_NAME: "my-project",
  GIT_HOST: "github.com",

  LOGGING_PATTERN: "structured",
  LOGGING_CANONICAL_KEYS: "trace_id, span_id, user_id, entity_id, action",
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
