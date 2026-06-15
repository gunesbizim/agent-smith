// Map detected project patterns → template variables
import fs from "node:fs";
import path from "node:path";
import type { DetectedProject, TemplateVariables } from "../shared/types.js";
import type { PackageUsage } from "./package-scanner.js";
import type { ArchitecturePattern } from "./architecture-sniffer.js";

export function mapBestPractices(
  project: DetectedProject,
  patterns: ArchitecturePattern[],
  defaults: TemplateVariables,
  packageUsage?: PackageUsage,
): TemplateVariables {
  const vars: TemplateVariables = { ...defaults };

  // ---- CLI tool / Library: override defaults ----
  if (project.projectType === "cli-tool" || project.projectType === "library") {
    vars.PROJECT_NAME = path.basename(path.resolve(project.rootPath)) || "my-project";
    vars.BACKEND_LANG = "TypeScript 5.x";
    vars.BACKEND_FRAMEWORK = project.projectType === "cli-tool" ? "CLI Tool" : "Library";
    vars.BACKEND_FRAMEWORK_DETAIL = "Node.js CLI / Package";
    vars.BACKEND_DIR = "src";
    vars.BACKEND_TEST_CMD = project.testing.backend?.command || project.testing.frontend?.command || "npx vitest run";
    vars.BACKEND_LINT_CMD = project.linting.backend?.command || project.linting.frontend?.command || "npx eslint src --ext .ts";
    vars.BACKEND_TYPE_CHECK_CMD = "npx tsc --noEmit";
    vars.BACKEND_FORMAT_CMD = "";
    vars.PRE_PUSH_GATES = buildPrePushGates(project);
    vars.DB_ENGINE = "none";
    vars.ORM = "none";
    vars.AUTH_METHOD = "none";
    vars.ROLE_SYSTEM = "none";
    vars.IMPORT_STYLE = "absolute";
    vars.LOGGING_PATTERN = "unstructured";
    vars.API_DOCS_LIBRARY = "none";

    if (packageUsage) {
      vars.BACKEND_TEST_CMD = packageUsage.testFramework
        ? `npx ${packageUsage.testFramework.toLowerCase()} run`
        : vars.BACKEND_TEST_CMD;
    }
    // CLI tools / libraries have no frontend — never leak the default web stack.
    neutralizeFrontendVars(vars);
    return vars;
  }

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
  vars.DEFAULT_BRANCH = detectDefaultBranch(project.rootPath);

  // ---- Package-specific variables ----
  if (packageUsage) {
    vars.ORM_PACKAGE = packageUsage.orm ?? "none";
    vars.ORM_PACKAGE_VERSION = packageUsage.ormVersion ?? "";
    vars.AUTH_PACKAGE = packageUsage.authLibrary ?? "none";
    vars.AUTH_PACKAGE_VERSION = packageUsage.authLibraryVersion ?? "";
    vars.VALIDATION_PACKAGE = packageUsage.validationLibrary ?? "none";
    vars.VALIDATION_PACKAGE_VERSION = packageUsage.validationLibraryVersion ?? "";
    vars.LOGGING_PACKAGE = packageUsage.loggingLibrary ?? "none";
    vars.LOGGING_PACKAGE_VERSION = packageUsage.loggingLibraryVersion ?? "";
    vars.DB_DRIVER_PACKAGE = packageUsage.dbDriver ?? "none";
    vars.DB_DRIVER_PACKAGE_VERSION = packageUsage.dbDriverVersion ?? "";
    vars.CACHE_PACKAGE = packageUsage.cacheDriver ?? "none";
    vars.CACHE_PACKAGE_VERSION = packageUsage.cacheDriverVersion ?? "";
    vars.UI_PACKAGE = packageUsage.uiLibrary ?? "none";
    vars.UI_PACKAGE_VERSION = packageUsage.uiLibraryVersion ?? "";
    vars.STATE_PACKAGE = packageUsage.stateManagement ?? "none";
    vars.STATE_PACKAGE_VERSION = packageUsage.stateManagementVersion ?? "";
    vars.FORM_PACKAGE = packageUsage.formLibrary ?? "none";
    vars.FORM_PACKAGE_VERSION = packageUsage.formLibraryVersion ?? "";
    vars.ROUTER_PACKAGE = packageUsage.routerLibrary ?? "none";
    vars.ROUTER_PACKAGE_VERSION = packageUsage.routerLibraryVersion ?? "";
    vars.RENDER_PACKAGE = packageUsage.renderingLibrary ?? "none";
    vars.RENDER_PACKAGE_VERSION = packageUsage.renderingLibraryVersion ?? "";
    vars.TEST_FRAMEWORK_PACKAGE = packageUsage.testFramework ?? "none";
    vars.TEST_FRAMEWORK_PACKAGE_VERSION = packageUsage.testFrameworkVersion ?? "";
    vars.E2E_PACKAGE = packageUsage.e2eFramework ?? "none";
    vars.E2E_PACKAGE_VERSION = packageUsage.e2eFrameworkVersion ?? "";
    vars.MOCK_PACKAGE = packageUsage.mockingLibrary ?? "none";
    vars.MOCK_PACKAGE_VERSION = packageUsage.mockingLibraryVersion ?? "";

    // Override ORM with package-detected value if more specific
    if (packageUsage.orm) vars.ORM = packageUsage.orm;
    if (packageUsage.authLibrary) vars.AUTH_METHOD = packageUsage.authLibrary;
    if (packageUsage.uiLibrary) vars.FRONTEND_UI_LIBRARY = packageUsage.uiLibrary;
    if (packageUsage.stateManagement) vars.STATE_PACKAGE = packageUsage.stateManagement;
  }

  // Honest output: when a side wasn't detected, emit "none" rather than letting the
  // opinionated DEFAULT_TEMPLATE_VARS (a Django + Vue stack) leak through as if analyzed.
  if (!project.backend) neutralizeBackendVars(vars, project);
  if (!project.frontend) neutralizeFrontendVars(vars);

  return vars;
}

// Replace any leaked backend defaults with honest "none" values. Preserves a detected
// test/lint command if one exists (e.g. a CLI tool with a test runner but no web backend).
function neutralizeBackendVars(vars: TemplateVariables, project: DetectedProject): void {
  vars.BACKEND_LANG = "none";
  vars.BACKEND_FRAMEWORK = "none";
  vars.BACKEND_FRAMEWORK_DETAIL = "none";
  vars.BACKEND_DIR = ".";
  vars.BACKEND_SETTINGS_MODULE = "none";
  vars.BACKEND_MIGRATE_CMD = "none";
  vars.BACKEND_TEST_CMD = project.testing.backend?.command ?? "none";
  vars.BACKEND_LINT_CMD = project.linting.backend?.command ?? "none";
  vars.BACKEND_TYPE_CHECK_CMD = "none";
  vars.BACKEND_FORMAT_CMD = "none";
  vars.ORM = "none";
  vars.AUTH_METHOD = "none";
  vars.ROLE_SYSTEM = "none";
  vars.ROLE_VALID_VALUES = "none";
  vars.DB_ENGINE = "none";
  vars.API_DOCS_LIBRARY = "none";
  vars.LOGGING_PATTERN = "none";
  vars.LOGGING_CANONICAL_KEYS = "none";
}

// Replace any leaked frontend defaults with honest "none" values.
function neutralizeFrontendVars(vars: TemplateVariables): void {
  vars.FRONTEND_FRAMEWORK = "none";
  vars.FRONTEND_UI_LIBRARY = "none";
  vars.FRONTEND_TEST_CMD = "none";
  vars.FRONTEND_LINT_CMD = "none";
  vars.FRONTEND_TYPE_CHECK_CMD = "none";
  vars.FRONTEND_DIR = ".";
  vars.FRONTEND_DEV_SERVER_CMD = "none";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Detect the repo's default branch by reading .git ref files directly (no subprocess).
// Falls back to "main".
function detectDefaultBranch(rootPath: string): string {
  const gitDir = path.join(rootPath, ".git");

  // Prefer the remote HEAD's symref target, e.g. "ref: refs/remotes/origin/main".
  const remoteHead = readGitRef(path.join(gitDir, "refs", "remotes", "origin", "HEAD"));
  if (remoteHead) {
    const branch = remoteHead.split("/").pop();
    if (branch) return branch;
  }

  // Else use the local checked-out branch if it's a conventional default.
  const head = readGitRef(path.join(gitDir, "HEAD"));
  if (head) {
    const current = head.split("/").pop();
    if (current === "main" || current === "master") return current;
  }

  return "main";
}

// Read a git ref file and return its "ref: <target>" pointer, or null.
// Uses plain string parsing (no regex) — the content is a single short line.
function readGitRef(refPath: string): string | null {
  try {
    const content = fs.readFileSync(refPath, "utf-8").trim();
    if (!content.startsWith("ref:")) return null;
    const target = content.slice(4).trim();
    return target || null;
  } catch {
    return null;
  }
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

