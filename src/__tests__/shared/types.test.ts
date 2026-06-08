import { describe, it, expect } from "vitest";
import type {
  DetectedProject,
  BackendInfo,
  FrontendInfo,
  MCPServerDefinition,
  TemplateVariables,
  PipelineContext,
  JiraTicket,
  HealthCheck,
  HealthReport,
} from "../../shared/types.js";

describe("Type exports — compile-time verification", () => {
  it("BackendInfo shape compiles", () => {
    const b: BackendInfo = {
      framework: "django",
      language: "python",
      languageVersion: "3.12",
      hasHexagonalArch: true,
      hasServiceRepo: true,
      usesAPIView: true,
      usesFunctionViews: false,
      importStyle: "absolute",
      rolePattern: "decorators",
      authMethod: "JWT",
      loggingPattern: "structured",
      orm: "Django ORM",
    };
    expect(b.framework).toBe("django");
  });

  it("BackendInfo supports all new languages", () => {
    const languages: BackendInfo["language"][] = [
      "python", "typescript", "javascript", "ruby", "java", "php",
      "go", "rust", "csharp", "kotlin", "swift", "scala",
    ];
    for (const lang of languages) {
      const b: BackendInfo = {
        framework: "generic-server",
        language: lang,
        languageVersion: "1.0",
        hasHexagonalArch: false,
        hasServiceRepo: false,
        usesAPIView: false,
        usesFunctionViews: true,
        importStyle: "absolute",
        rolePattern: "none",
        authMethod: "none",
        loggingPattern: "unstructured",
        orm: null,
      };
      expect(b.language).toBe(lang);
    }
  });

  it("BackendInfo covers all BackendFramework values for new stacks", () => {
    const frameworks: BackendInfo["framework"][] = [
      // Python
      "django", "fastapi", "flask", "pyramid",
      // TypeScript/JS
      "express", "fastify", "nestjs", "koa", "hono",
      "adonisjs", "feathersjs",
      // Meta-frameworks
      "nextjs-api", "nuxt-api", "remix", "sveltekit-api",
      // Ruby
      "rails", "sinatra",
      // PHP
      "laravel", "symfony", "slim",
      // Java
      "spring-boot", "quarkus", "micronaut", "jakarta-ee",
      // Kotlin
      "ktor", "spring-boot-kotlin",
      // Go
      "gin", "echo", "fiber", "chi",
      // Rust
      "actix-web", "axum", "rocket",
      // C#
      "aspnet-core", "blazor-api",
      // Swift
      "vapor",
      // Scala
      "play-framework",
      // Generic
      "generic-server", "unknown",
    ];
    for (const fw of frameworks) {
      const b: BackendInfo = {
        framework: fw, language: "python", languageVersion: "1",
        hasHexagonalArch: false, hasServiceRepo: false,
        usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "none",
        authMethod: "none", loggingPattern: "unstructured", orm: null,
      };
      expect(b.framework).toBe(fw);
    }
  });

  it("FrontendInfo shape compiles", () => {
    const f: FrontendInfo = {
      framework: "vue3",
      componentPattern: "script-setup",
      uiLibrary: "Vuetify 3",
      stateManagement: "Pinia",
      usesI18n: true,
      i18nLibrary: "vue-i18n",
      usesTypeScript: true,
      roleAwareUI: true,
    };
    expect(f.framework).toBe("vue3");
  });

  it("FrontendInfo covers all new FrontendFramework values", () => {
    const frameworks: FrontendInfo["framework"][] = [
      "vue3", "nuxt3",
      "react", "nextjs", "gatsby", "remix-spa", "react-native",
      "angular",
      "svelte", "sveltekit",
      "solidjs", "qwik", "astro",
      "blazor-wasm", "htmx", "alpine",
      "flutter", "swiftui",
      "generic-spa", "unknown",
    ];
    for (const fw of frameworks) {
      const f: FrontendInfo = {
        framework: fw, componentPattern: "unknown",
        uiLibrary: null, stateManagement: null,
        usesI18n: false, i18nLibrary: null,
        usesTypeScript: false, roleAwareUI: false,
      };
      expect(f.framework).toBe(fw);
    }
  });

  it("FrontendInfo supports 'unknown' componentPattern", () => {
    const f: FrontendInfo = {
      framework: "htmx",
      componentPattern: "unknown",
      uiLibrary: null, stateManagement: null,
      usesI18n: false, i18nLibrary: null,
      usesTypeScript: false, roleAwareUI: false,
    };
    expect(f.componentPattern).toBe("unknown");
  });

  it("DetectedProject shape compiles", () => {
    const p: DetectedProject = {
      rootPath: "/test",
      projectType: "cli-tool",
      backend: null,
      frontend: null,
      testing: { backend: null, frontend: null },
      linting: { backend: null, frontend: null },
      cicd: null,
      monorepo: null,
      database: null,
    };
    expect(p.projectType).toBe("cli-tool");
  });

  it("MCPServerDefinition shape compiles", () => {
    const m: MCPServerDefinition = {
      name: "test-mcp",
      description: "test",
      category: "code-intelligence",
      scope: "project",
      installType: "npm",
      installCommand: "npm i test",
      checkCommand: "test --version",
      requiredEnvVars: [],
      configTemplate: {
        type: "stdio",
        command: "test",
        args: [],
        env: {},
      },
    };
    expect(m.name).toBe("test-mcp");
  });

  it("TemplateVariables shape compiles", () => {
    const v: TemplateVariables = {
      BACKEND_LANG: "Python 3.12",
      BACKEND_FRAMEWORK: "Django",
      BACKEND_FRAMEWORK_DETAIL: "Django 6 + DRF",
      BACKEND_TEST_CMD: "pytest",
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
      ROLE_SYSTEM: "decorators",
      ROLE_VALID_VALUES: "admin, supervisor",
      AUTH_METHOD: "JWT",
      IMPORT_STYLE: "absolute",
      DB_ENGINE: "PostgreSQL",
      ORM: "Django ORM",
      PRE_PUSH_GATES: "ruff + mypy + pytest",
      API_DOCS_LIBRARY: "drf-spectacular",
      PROJECT_NAME: "test",
      REPO_NAME: "test",
      GIT_HOST: "github.com",
      LOGGING_PATTERN: "structured",
      LOGGING_CANONICAL_KEYS: "trace_id, span_id",
      ORM_PACKAGE: "Prisma",
      ORM_PACKAGE_VERSION: "5.0",
      AUTH_PACKAGE: "NextAuth",
      AUTH_PACKAGE_VERSION: "4.0",
      VALIDATION_PACKAGE: "Zod",
      VALIDATION_PACKAGE_VERSION: "3.0",
      LOGGING_PACKAGE: "Pino",
      LOGGING_PACKAGE_VERSION: "9.0",
      DB_DRIVER_PACKAGE: "pg",
      DB_DRIVER_PACKAGE_VERSION: "8.0",
      CACHE_PACKAGE: "ioredis",
      CACHE_PACKAGE_VERSION: "5.0",
      UI_PACKAGE: "Radix UI",
      UI_PACKAGE_VERSION: "1.0",
      STATE_PACKAGE: "Zustand",
      STATE_PACKAGE_VERSION: "4.0",
      FORM_PACKAGE: "react-hook-form",
      FORM_PACKAGE_VERSION: "7.0",
      ROUTER_PACKAGE: "React Router",
      ROUTER_PACKAGE_VERSION: "6.0",
      RENDER_PACKAGE: "PixiJS",
      RENDER_PACKAGE_VERSION: "8.0",
      TEST_FRAMEWORK_PACKAGE: "Vitest",
      TEST_FRAMEWORK_PACKAGE_VERSION: "2.0",
      E2E_PACKAGE: "Playwright",
      E2E_PACKAGE_VERSION: "1.40",
      MOCK_PACKAGE: "MSW",
      MOCK_PACKAGE_VERSION: "2.0",
      TESTING_REQUIREMENTS: "unit tests, integration tests, coverage > 80%",
      PR_CHECKLIST: "tests pass, lint clean, 2 approvals, no TODOs",
    };
    expect(v.BACKEND_LANG).toBe("Python 3.12");
  });

  it("PipelineContext shape compiles", () => {
    const ctx: PipelineContext = {
      ticketId: "PROJ-123",
      ticketTitle: "Test ticket",
      ticketDescription: "desc",
      acceptanceCriteria: ["AC1", "AC2"],
      branch: "feat/PROJ-123-test",
      approvalGate: "plan",
      phasesCompleted: [],
      phaseResults: new Map(),
    };
    expect(ctx.ticketId).toBe("PROJ-123");
  });

  it("JiraTicket shape compiles", () => {
    const t: JiraTicket = {
      key: "PROJ-42",
      summary: "Add feature X",
      description: "Full description",
      acceptanceCriteria: ["Given X, when Y, then Z"],
      issueType: "story",
      status: "In Progress",
      assignee: null,
      sprint: null,
      epic: null,
    };
    expect(t.key).toBe("PROJ-42");
  });

  it("HealthCheck shape compiles", () => {
    const h: HealthCheck = {
      name: "test-check",
      status: "pass",
      message: "All good",
    };
    expect(h.status).toBe("pass");
  });

  it("HealthReport shape compiles", () => {
    const r: HealthReport = {
      platform: "claude-code",
      nodeVersion: "20.0.0",
      npmVersion: "10.0.0",
      gitVersion: "2.40.0",
      checks: [],
      overallStatus: "healthy",
    };
    expect(r.overallStatus).toBe("healthy");
  });
});
