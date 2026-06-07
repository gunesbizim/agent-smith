// Map detected project patterns → template variables
import path from "node:path";
import type { DetectedProject, TemplateVariables } from "../shared/types.js";
import type { ArchitecturePattern } from "./architecture-sniffer.js";

export function mapBestPractices(
  project: DetectedProject,
  patterns: ArchitecturePattern[],
  defaults: TemplateVariables,
): TemplateVariables {
  const vars: TemplateVariables = { ...defaults };

  // ---- Backend ----
  if (project.backend) {
    const b = project.backend;
    vars.BACKEND_LANG = `${capitalize(b.language)} ${b.languageVersion}`;

    // Framework detail
    const fwMap: Record<string, string> = {
      django: "Django 6 + Django REST Framework 3.15",
      fastapi: "FastAPI + Pydantic v2",
      express: "Express.js + TypeScript",
      "nextjs-api": "Next.js API Routes + TypeScript",
      rails: "Ruby on Rails",
      laravel: "Laravel",
      "spring-boot": "Spring Boot",
    };
    vars.BACKEND_FRAMEWORK = capitalize(b.framework);
    vars.BACKEND_FRAMEWORK_DETAIL = fwMap[b.framework] ?? `${capitalize(b.framework)}`;

    // ORM
    vars.ORM = b.orm ?? "none";

    // Import style
    vars.IMPORT_STYLE = b.importStyle;

    // Auth
    vars.AUTH_METHOD = b.authMethod || "JWT";

    // Role system
    if (b.rolePattern === "decorators") {
      vars.ROLE_SYSTEM = "role decorators on APIView subclasses — every view must have exactly one";
      vars.ROLE_VALID_VALUES = "admin, supervisor, lawyer";
    } else if (b.rolePattern === "middleware") {
      vars.ROLE_SYSTEM = "middleware-based role enforcement";
      vars.ROLE_VALID_VALUES = "admin, user";
    } else {
      vars.ROLE_SYSTEM = "none (manual permission checks)";
      vars.ROLE_VALID_VALUES = "none";
    }

    // Logging
    vars.LOGGING_PATTERN = b.loggingPattern;
    vars.LOGGING_CANONICAL_KEYS = b.loggingPattern === "structured"
      ? "trace_id, span_id, user_id, entity_id, action"
      : "none";

    // Database
    if (project.database) {
      vars.DB_ENGINE = project.database.engine;
    }

    // Pre-push gates
    vars.PRE_PUSH_GATES = buildPrePushGates(project);

    // Type check command — language-specific
    if (b.language === "go") {
      vars.BACKEND_TYPE_CHECK_CMD = "go vet ./...";
    } else if (b.language === "rust") {
      vars.BACKEND_TYPE_CHECK_CMD = "cargo check";
    } else if (b.language === "python") {
      vars.BACKEND_TYPE_CHECK_CMD = "mypy .";
    } else if (b.language === "typescript" || b.language === "javascript") {
      vars.BACKEND_TYPE_CHECK_CMD = "npx tsc --noEmit";
    } else {
      vars.BACKEND_TYPE_CHECK_CMD = "";
    }

    // Backend dir
    vars.BACKEND_DIR = detectBackendDir(project);

    // Test command
    if (project.testing.backend) {
      vars.BACKEND_TEST_CMD = project.testing.backend.command;
    }

    // Lint command
    if (project.linting.backend) {
      vars.BACKEND_LINT_CMD = project.linting.backend.command;
    }

    // API docs library
    if (b.framework === "django") {
      vars.API_DOCS_LIBRARY = "drf-spectacular";
    } else if (b.framework === "fastapi") {
      vars.API_DOCS_LIBRARY = "FastAPI built-in OpenAPI (Swagger UI + ReDoc)";
    } else {
      vars.API_DOCS_LIBRARY = "none";
    }
  }

  // ---- Frontend ----
  if (project.frontend) {
    const f = project.frontend;
    vars.FRONTEND_FRAMEWORK = capitalize(f.framework);
    vars.FRONTEND_UI_LIBRARY = f.uiLibrary ?? "none";

    if (project.testing.frontend) {
      vars.FRONTEND_TEST_CMD = project.testing.frontend.command;
    }
    if (project.linting.frontend) {
      vars.FRONTEND_LINT_CMD = project.linting.frontend.command;
    }
    if (f.usesTypeScript) {
      vars.FRONTEND_TYPE_CHECK_CMD = "npx tsc --noEmit";
    }

    vars.FRONTEND_DIR = detectFrontendDir(project);
    vars.FRONTEND_DEV_SERVER_CMD = detectDevServerCmd(project);
  }

  // ---- Project ----
  vars.PROJECT_NAME = path.basename(path.resolve(project.rootPath)) || "my-project";
  vars.REPO_NAME = vars.PROJECT_NAME;

  if (project.cicd?.provider === "github-actions") {
    vars.GIT_HOST = "github.com";
  } else if (project.cicd?.provider === "gitlab-ci") {
    vars.GIT_HOST = "gitlab.com";
  }

  return vars;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPrePushGates(project: DetectedProject): string {
  const gates: string[] = [];

  // Backend gates
  if (project.linting.backend) gates.push(project.linting.backend.command);
  if (project.testing.backend) gates.push(project.testing.backend.command);
  if (project.backend?.language === "python") gates.push("mypy .");

  // Frontend gates
  if (project.linting.frontend) gates.push(project.linting.frontend.command);
  if (project.testing.frontend) gates.push(project.testing.frontend.command);
  if (project.frontend?.usesTypeScript) gates.push("npx tsc --noEmit");

  return gates.length > 0 ? gates.join(" + ") : "none";
}

function detectBackendDir(project: DetectedProject): string {
  if (project.monorepo) return "backend";
  // Django projects typically have backend/ dir in monorepo setups
  if (project.backend?.framework === "django") return "backend";
  return ".";
}

function detectFrontendDir(project: DetectedProject): string {
  if (project.monorepo) return "frontend";
  return project.frontend ? "frontend" : ".";
}

function detectDevServerCmd(project: DetectedProject): string {
  if (project.frontend?.framework === "vue3") return "npm run dev";
  if (project.frontend?.framework === "react") return "npm run dev";
  if (project.frontend?.framework === "nextjs") return "npm run dev";
  if (project.frontend?.framework === "angular") return "ng serve";
  return "npm run dev";
}

