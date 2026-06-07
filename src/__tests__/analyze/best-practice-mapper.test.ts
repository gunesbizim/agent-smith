import { describe, it, expect } from "vitest";
import { mapBestPractices } from "../../analyze/best-practice-mapper.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject } from "../../shared/types.js";

const BASE_PROJECT: DetectedProject = {
  rootPath: "/test/project",
  backend: null,
  frontend: null,
  testing: { backend: null, frontend: null },
  linting: { backend: null, frontend: null },
  cicd: null,
  monorepo: null,
  database: null,
};

describe("Best Practice Mapper", () => {
  it("returns defaults when no project detected", () => {
    const vars = mapBestPractices(BASE_PROJECT, [], DEFAULT_TEMPLATE_VARS);
    expect(vars.BACKEND_FRAMEWORK).toBe(DEFAULT_TEMPLATE_VARS.BACKEND_FRAMEWORK);
    expect(vars.FRONTEND_FRAMEWORK).toBe(DEFAULT_TEMPLATE_VARS.FRONTEND_FRAMEWORK);
  });

  describe("Django backend", () => {
    it("maps Django conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: {
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
        },
        database: { engine: "postgresql", orm: "Django ORM" },
        testing: { backend: { framework: "pytest", command: "pytest -m 'not integration'" }, frontend: null },
        linting: { backend: { tool: "ruff", command: "ruff check ." }, frontend: null },
      };

      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Django");
      expect(vars.DB_ENGINE).toBe("postgresql");
      expect(vars.IMPORT_STYLE).toBe("absolute");
      expect(vars.AUTH_METHOD).toBe("JWT");
      expect(vars.ROLE_SYSTEM).toContain("decorators");
      expect(vars.BACKEND_TEST_CMD).toBe("pytest -m 'not integration'");
      expect(vars.BACKEND_LINT_CMD).toBe("ruff check .");
      expect(vars.PRE_PUSH_GATES).toContain("ruff");
      expect(vars.PRE_PUSH_GATES).toContain("pytest");
    });

    it("uses DRF spectacular for Django API docs", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: {
          framework: "django",
          language: "python",
          languageVersion: "3.12",
          hasHexagonalArch: false,
          hasServiceRepo: false,
          usesAPIView: true,
          usesFunctionViews: false,
          importStyle: "absolute",
          rolePattern: "decorators",
          authMethod: "JWT",
          loggingPattern: "structured",
          orm: "Django ORM",
        },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.API_DOCS_LIBRARY).toBe("drf-spectacular");
    });
  });

  describe("FastAPI backend", () => {
    it("maps FastAPI conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: {
          framework: "fastapi",
          language: "python",
          languageVersion: "3.12",
          hasHexagonalArch: false,
          hasServiceRepo: false,
          usesAPIView: false,
          usesFunctionViews: true,
          importStyle: "absolute",
          rolePattern: "middleware",
          authMethod: "JWT",
          loggingPattern: "unstructured",
          orm: null,
        },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Fastapi");
      expect(vars.ROLE_SYSTEM).toContain("middleware");
      expect(vars.API_DOCS_LIBRARY).toContain("FastAPI");
    });
  });

  describe("Vue 3 frontend", () => {
    it("maps Vue 3 with Vuetify conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: {
          framework: "vue3",
          componentPattern: "script-setup",
          uiLibrary: "Vuetify 3",
          stateManagement: "Pinia",
          usesI18n: true,
          i18nLibrary: "vue-i18n",
          usesTypeScript: true,
          roleAwareUI: true,
        },
        testing: { backend: null, frontend: { framework: "vitest", command: "npx vitest run" } },
        linting: { backend: null, frontend: { tool: "eslint", command: "npx eslint src --ext .ts,.vue" } },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Vue3");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("Vuetify 3");
      expect(vars.FRONTEND_TEST_CMD).toBe("npx vitest run");
      expect(vars.FRONTEND_LINT_CMD).toBe("npx eslint src --ext .ts,.vue");
      expect(vars.FRONTEND_TYPE_CHECK_CMD).toBe("npx tsc --noEmit");
    });
  });

  describe("React frontend", () => {
    it("maps React conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: {
          framework: "react",
          componentPattern: "functional",
          uiLibrary: "MUI",
          stateManagement: "Redux Toolkit",
          usesI18n: false,
          i18nLibrary: null,
          usesTypeScript: true,
          roleAwareUI: false,
        },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("React");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("MUI");
    });
  });

  describe("CI/CD detection", () => {
    it("detects GitHub Actions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        cicd: { provider: "github-actions", configPath: ".github/workflows/" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.GIT_HOST).toBe("github.com");
    });

    it("detects GitLab CI", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        cicd: { provider: "gitlab-ci", configPath: ".gitlab-ci.yml" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.GIT_HOST).toBe("gitlab.com");
    });
  });

  describe("project name extraction", () => {
    it("uses directory name as project name", () => {
      const vars = mapBestPractices(BASE_PROJECT, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.PROJECT_NAME).toBe("project");
    });
  });

  describe("none role system", () => {
    it("maps 'none' role pattern clearly", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: {
          framework: "express",
          language: "typescript",
          languageVersion: "5.x",
          hasHexagonalArch: false,
          hasServiceRepo: false,
          usesAPIView: false,
          usesFunctionViews: true,
          importStyle: "absolute",
          rolePattern: "none",
          authMethod: "JWT",
          loggingPattern: "unstructured",
          orm: null,
        },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.ROLE_SYSTEM).toContain("none");
      expect(vars.ROLE_VALID_VALUES).toBe("none");
    });
  });

  // ---- New framework tests ----

  describe("Go backends", () => {
    it("maps Gin conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "gin", language: "go", languageVersion: "1.22", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: "GORM" },
        testing: { backend: { framework: "go test", command: "go test ./..." }, frontend: null },
        linting: { backend: { tool: "golangci-lint", command: "golangci-lint run" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Gin");
      expect(vars.ORM).toBe("GORM");
      expect(vars.BACKEND_TEST_CMD).toBe("go test ./...");
      expect(vars.BACKEND_LINT_CMD).toBe("golangci-lint run");
    });

    it("maps Echo conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "echo", language: "go", languageVersion: "1.22", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: "Ent" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Echo");
      expect(vars.ORM).toBe("Ent");
    });

    it("maps Fiber conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "fiber", language: "go", languageVersion: "1.22", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Fiber");
    });
  });

  describe("Rust backends", () => {
    it("maps Actix-web conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "actix-web", language: "rust", languageVersion: "stable", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: "Diesel" },
        testing: { backend: { framework: "cargo test", command: "cargo test" }, frontend: null },
        linting: { backend: { tool: "clippy", command: "cargo clippy" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Actix-web");
      expect(vars.ORM).toBe("Diesel");
      expect(vars.BACKEND_TEST_CMD).toBe("cargo test");
      expect(vars.BACKEND_LINT_CMD).toBe("cargo clippy");
    });

    it("maps Axum conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "axum", language: "rust", languageVersion: "stable", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: "SQLx" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Axum");
      expect(vars.ORM).toBe("SQLx");
    });
  });

  describe("Java / JVM backends", () => {
    it("maps Spring Boot conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "spring-boot", language: "java", languageVersion: "21", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "decorators", authMethod: "Spring Security", loggingPattern: "structured", orm: "JPA/Hibernate" },
        testing: { backend: { framework: "JUnit", command: "mvn test" }, frontend: null },
        database: { engine: "postgresql", orm: "JPA/Hibernate" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Spring-boot");
      expect(vars.AUTH_METHOD).toBe("Spring Security");
      expect(vars.ROLE_SYSTEM).toContain("decorators");
      expect(vars.BACKEND_TEST_CMD).toBe("mvn test");
    });

    it("maps Quarkus conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "quarkus", language: "java", languageVersion: "21", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "decorators", authMethod: "Quarkus Security", loggingPattern: "structured", orm: "Hibernate/Panache" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Quarkus");
    });
  });

  describe("Kotlin backends", () => {
    it("maps Ktor conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "ktor", language: "kotlin", languageVersion: "2.x", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "Ktor Auth", loggingPattern: "unstructured", orm: "Exposed" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Ktor");
      expect(vars.ORM).toBe("Exposed");
    });
  });

  describe("C# backends", () => {
    it("maps ASP.NET Core conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "aspnet-core", language: "csharp", languageVersion: ".NET 8", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "middleware", authMethod: "ASP.NET Identity", loggingPattern: "structured", orm: "Entity Framework Core" },
        testing: { backend: { framework: "xUnit/NUnit", command: "dotnet test" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Aspnet-core");
      expect(vars.ORM).toBe("Entity Framework Core");
      expect(vars.BACKEND_TEST_CMD).toBe("dotnet test");
    });
  });

  describe("PHP backends", () => {
    it("maps Symfony conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "symfony", language: "php", languageVersion: "8.x", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "middleware", authMethod: "Symfony Security", loggingPattern: "structured", orm: "Doctrine" },
        testing: { backend: { framework: "PHPUnit", command: "vendor/bin/phpunit" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Symfony");
      expect(vars.ORM).toBe("Doctrine");
      expect(vars.BACKEND_TEST_CMD).toBe("vendor/bin/phpunit");
    });
  });

  describe("NestJS backend", () => {
    it("maps NestJS conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "nestjs", language: "typescript", languageVersion: "5.x", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "decorators", authMethod: "JWT", loggingPattern: "structured", orm: "Prisma" },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Nestjs");
      expect(vars.AUTH_METHOD).toBe("JWT");
      expect(vars.ROLE_SYSTEM).toContain("decorators");
    });
  });

  // ---- New frontend framework tests ----

  describe("Svelte frontends", () => {
    it("maps SvelteKit conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "sveltekit", componentPattern: "script-setup", uiLibrary: "Skeleton", stateManagement: "Svelte stores", usesI18n: true, i18nLibrary: "Paraglide", usesTypeScript: true, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Sveltekit");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("Skeleton");
    });
  });

  describe("SolidJS frontend", () => {
    it("maps SolidJS conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "solidjs", componentPattern: "functional", uiLibrary: "Kobalte", stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: true, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Solidjs");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("Kobalte");
    });
  });

  describe("Astro frontend", () => {
    it("maps Astro conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "astro", componentPattern: "functional", uiLibrary: "React (Astro island)", stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: true, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Astro");
    });
  });

  describe("Nuxt 3 frontend", () => {
    it("maps Nuxt 3 conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "nuxt3", componentPattern: "script-setup", uiLibrary: "Vuetify 3", stateManagement: "Pinia", usesI18n: true, i18nLibrary: "vue-i18n", usesTypeScript: true, roleAwareUI: true },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Nuxt3");
    });
  });

  describe("Non-JS frontends", () => {
    it("maps Flutter conventions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "flutter", componentPattern: "class-component", uiLibrary: "Material Design (Flutter)", stateManagement: "Riverpod", usesI18n: true, i18nLibrary: "flutter_localizations", usesTypeScript: false, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Flutter");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("Material Design (Flutter)");
    });

    it("maps HTMX frontend", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "htmx", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Htmx");
    });

    it("maps Alpine.js frontend", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "alpine", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Alpine");
    });
  });

  describe("generic-server and unknown frameworks", () => {
    it("maps generic-server without assumptions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "generic-server", language: "go", languageVersion: "1.22", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "none", authMethod: "none", loggingPattern: "unstructured", orm: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Generic-server");
      expect(vars.AUTH_METHOD).toBe("none");
      expect(vars.ROLE_VALID_VALUES).toBe("none");
    });

    it("maps unknown backend with defaults preserved", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "unknown", language: "python", languageVersion: "3.12", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "none", authMethod: "unknown", loggingPattern: "unstructured", orm: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.BACKEND_FRAMEWORK).toBe("Unknown");
    });
  });

  describe("generic-spa frontend", () => {
    it("maps generic-spa with no UI library assumptions", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        frontend: { framework: "generic-spa", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: true, roleAwareUI: false },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.FRONTEND_FRAMEWORK).toBe("Generic-spa");
      expect(vars.FRONTEND_UI_LIBRARY).toBe("none");
    });
  });

  describe("pre-push gate generation", () => {
    it("includes lint and test for Go projects", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "gin", language: "go", languageVersion: "1.22", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null },
        testing: { backend: { framework: "go test", command: "go test ./..." }, frontend: null },
        linting: { backend: { tool: "golangci-lint", command: "golangci-lint run" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.PRE_PUSH_GATES).toContain("golangci-lint");
      expect(vars.PRE_PUSH_GATES).toContain("go test");
    });

    it("includes cargo clippy + cargo test for Rust projects", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "axum", language: "rust", languageVersion: "stable", hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: null },
        testing: { backend: { framework: "cargo test", command: "cargo test" }, frontend: null },
        linting: { backend: { tool: "clippy", command: "cargo clippy" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.PRE_PUSH_GATES).toContain("cargo clippy");
      expect(vars.PRE_PUSH_GATES).toContain("cargo test");
    });

    it("includes dotnet test for .NET projects", () => {
      const project: DetectedProject = {
        ...BASE_PROJECT,
        backend: { framework: "aspnet-core", language: "csharp", languageVersion: ".NET 8", hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "middleware", authMethod: "ASP.NET Identity", loggingPattern: "structured", orm: "Entity Framework Core" },
        testing: { backend: { framework: "xUnit/NUnit", command: "dotnet test" }, frontend: null },
      };
      const vars = mapBestPractices(project, [], DEFAULT_TEMPLATE_VARS);
      expect(vars.PRE_PUSH_GATES).toContain("dotnet test");
    });
  });
});
