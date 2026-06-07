// Project detector — scan repo and identify tech stack
// Covers all languages/frameworks gitnexus can index
import path from "node:path";
import fs from "fs-extra";
import type {
  DetectedProject,
  BackendInfo,
  BackendFramework,
  FrontendInfo,
  FrontendFramework,
  TestingInfo,
  LintingInfo,
  CICDInfo,
  DatabaseInfo,
  MonorepoInfo,
} from "../shared/types.js";

// ============================================================
// Main entry
// ============================================================

export async function detectProject(rootPath: string): Promise<DetectedProject> {
  const project: DetectedProject = {
    rootPath,
    backend: null,
    frontend: null,
    testing: { backend: null, frontend: null },
    linting: { backend: null, frontend: null },
    cicd: null,
    monorepo: null,
    database: null,
  };

  project.backend = await detectBackend(rootPath);
  project.frontend = await detectFrontend(rootPath);
  project.testing = await detectTesting(rootPath);
  project.linting = await detectLinting(rootPath);
  project.cicd = await detectCICD(rootPath);
  project.monorepo = await detectMonorepo(rootPath);
  project.database = await detectDatabase(rootPath, project.backend);

  return project;
}

// ============================================================
// Backend detection — all languages gitnexus supports
// ============================================================

async function detectBackend(rootPath: string): Promise<BackendInfo | null> {
  // ---- Python ----
  if (await fileExists(rootPath, "**/pyproject.toml") || await fileExists(rootPath, "requirements.txt") || await fileExists(rootPath, "**/setup.py")) {

    // Django
    if (await fileExists(rootPath, "manage.py")) {
      return buildBackendInfo("django", "python", await pyVersion(rootPath), "Django ORM", true);
    }

    // FastAPI
    if (await grepFirst(rootPath, "**/main.py", "FastAPI|fastapi")) {
      return { framework: "fastapi", language: "python", languageVersion: await pyVersion(rootPath), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null };
    }

    // Flask
    if (await grepFirst(rootPath, "**/*.py", "flask|Flask")) {
      return { framework: "flask", language: "python", languageVersion: await pyVersion(rootPath), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "manual", authMethod: "session", loggingPattern: "unstructured", orm: await detectPythonORM(rootPath) };
    }

    // Generic Python server
    return buildBackendInfo("generic-server", "python", await pyVersion(rootPath), await detectPythonORM(rootPath), false);
  }

  // ---- TypeScript/JavaScript (Node.js) ----
  const rootPkg = await readJson(rootPath, "package.json");
  const backendPkg = await readJson(rootPath, "backend/package.json") ?? await readJson(rootPath, "server/package.json") ?? await readJson(rootPath, "api/package.json");
  const pkg = backendPkg ?? rootPkg;

  if (pkg) {
    const deps = pkgDeps(pkg);

    // NestJS
    if (deps["@nestjs/core"]) {
      return {
        framework: "nestjs", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "decorators", authMethod: "JWT",
        loggingPattern: "structured", orm: deps["@prisma/client"] ? "Prisma" : deps.typeorm ? "TypeORM" : deps.mikroorm ? "MikroORM" : deps.knex ? "Knex" : null,
      };
    }

    // Fastify
    if (deps.fastify) {
      return {
        framework: "fastify", language: deps.typescript ? "typescript" : "javascript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }

    // Koa
    if (deps.koa) {
      return {
        framework: "koa", language: deps.typescript ? "typescript" : "javascript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }

    // Hono
    if (deps.hono) {
      return {
        framework: "hono", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }

    // AdonisJS
    if (deps["@adonisjs/core"]) {
      return {
        framework: "adonisjs", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "session",
        loggingPattern: "structured", orm: "Lucid",
      };
    }

    // Express / generic Node
    if (deps.express) {
      return {
        framework: "express", language: deps.typescript ? "typescript" : "javascript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }

    // FeathersJS
    if (deps["@feathersjs/feathers"]) {
      return {
        framework: "feathersjs", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }

    // Next.js API
    if (deps.next) {
      return {
        framework: "nextjs-api", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "NextAuth",
        loggingPattern: "unstructured", orm: deps.prisma ? "Prisma" : deps.drizzle ? "Drizzle" : null,
      };
    }

    // Nuxt API
    if (deps.nuxt || deps["nuxt3"]) {
      return {
        framework: "nuxt-api", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "session",
        loggingPattern: "unstructured", orm: deps.prisma ? "Prisma" : deps.drizzle ? "Drizzle" : null,
      };
    }

    // Remix
    if (deps["@remix-run/node"] || deps["@remix-run/react"]) {
      return {
        framework: "remix", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "session",
        loggingPattern: "unstructured", orm: deps.prisma ? "Prisma" : null,
      };
    }

    // SvelteKit API
    if (deps["@sveltejs/kit"]) {
      return {
        framework: "sveltekit-api", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "session",
        loggingPattern: "unstructured", orm: deps.prisma ? "Prisma" : deps.drizzle ? "Drizzle" : null,
      };
    }

    // Generic Node server (has express-like patterns)
    if (deps["body-parser"] || deps.cors || deps.helmet) {
      return {
        framework: "generic-server", language: "typescript", languageVersion: "5.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "none", authMethod: "none",
        loggingPattern: "unstructured", orm: nodeORM(deps),
      };
    }
  }

  // ---- Ruby ----
  if (await fileExists(rootPath, "Gemfile")) {
    const gemfile = await readFileSafe(rootPath, "Gemfile") ?? "";

    if (gemfile.includes("rails")) {
      return {
        framework: "rails", language: "ruby", languageVersion: "3.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "Devise",
        loggingPattern: "structured", orm: "ActiveRecord",
      };
    }

    if (gemfile.includes("sinatra")) {
      return {
        framework: "sinatra", language: "ruby", languageVersion: "3.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "manual", authMethod: "none",
        loggingPattern: "unstructured", orm: gemfile.includes("activerecord") ? "ActiveRecord" : gemfile.includes("sequel") ? "Sequel" : null,
      };
    }

    // Generic Ruby
    return {
      framework: "generic-server", language: "ruby", languageVersion: "3.x",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
      importStyle: "absolute", rolePattern: "none", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  // ---- PHP ----
  if (await fileExists(rootPath, "composer.json")) {
    const composer = await readJson(rootPath, "composer.json");
    if (composer) {
      const require = (composer.require as Record<string, string>) ?? {};

      if (require["laravel/framework"]) {
        return {
          framework: "laravel", language: "php", languageVersion: "8.x",
          hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false,
          importStyle: "absolute", rolePattern: "middleware", authMethod: "Sanctum",
          loggingPattern: "unstructured", orm: "Eloquent",
        };
      }

      if (require["symfony/framework-bundle"] || require["symfony/http-kernel"]) {
        return {
          framework: "symfony", language: "php", languageVersion: "8.x",
          hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
          importStyle: "absolute", rolePattern: "middleware", authMethod: "Symfony Security",
          loggingPattern: "structured", orm: require["doctrine/orm"] ? "Doctrine" : null,
        };
      }

      if (require["slim/slim"]) {
        return {
          framework: "slim", language: "php", languageVersion: "8.x",
          hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
          importStyle: "absolute", rolePattern: "middleware", authMethod: "none",
          loggingPattern: "unstructured", orm: require["illuminate/database"] ? "Eloquent" : require["doctrine/orm"] ? "Doctrine" : null,
        };
      }

      // Generic PHP
      return {
        framework: "generic-server", language: "php", languageVersion: "8.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "none", authMethod: "none",
        loggingPattern: "unstructured", orm: null,
      };
    }
  }

  // ---- Java / Kotlin / Scala (JVM) ----
  if (await fileExists(rootPath, "**/pom.xml") || await fileExists(rootPath, "**/build.gradle") || await fileExists(rootPath, "**/build.gradle.kts")) {
    // Try to read build file
    const pom = await readFileSafe(rootPath, "**/pom.xml") ?? "";
    const gradle = (await readFileSafe(rootPath, "**/build.gradle") ?? "") + (await readFileSafe(rootPath, "**/build.gradle.kts") ?? "");
    const buildContent = pom + gradle;

    if (buildContent.includes("spring-boot") || buildContent.includes("org.springframework.boot")) {
      const isKotlin = buildContent.includes("kotlin");
      return {
        framework: isKotlin ? "spring-boot-kotlin" : "spring-boot",
        language: isKotlin ? "kotlin" : "java",
        languageVersion: isKotlin ? "2.x" : "21",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "decorators", authMethod: "Spring Security",
        loggingPattern: "structured", orm: buildContent.includes("spring-data-jpa") ? "JPA/Hibernate" : buildContent.includes("mybatis") ? "MyBatis" : null,
      };
    }

    if (buildContent.includes("quarkus")) {
      return {
        framework: "quarkus", language: "java", languageVersion: "21",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "decorators", authMethod: "Quarkus Security",
        loggingPattern: "structured", orm: buildContent.includes("hibernate") ? "Hibernate/Panache" : null,
      };
    }

    if (buildContent.includes("micronaut")) {
      return {
        framework: "micronaut", language: "java", languageVersion: "21",
        hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "decorators", authMethod: "Micronaut Security",
        loggingPattern: "structured", orm: buildContent.includes("jpa") ? "JPA/Hibernate" : null,
      };
    }

    if (buildContent.includes("jakarta") || buildContent.includes("javax.ws.rs")) {
      return {
        framework: "jakarta-ee", language: "java", languageVersion: "21",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "decorators", authMethod: "Jakarta Security",
        loggingPattern: "unstructured", orm: buildContent.includes("jpa") ? "JPA" : null,
      };
    }

    if (buildContent.includes("ktor")) {
      return {
        framework: "ktor", language: "kotlin", languageVersion: "2.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "Ktor Auth",
        loggingPattern: "unstructured", orm: buildContent.includes("exposed") ? "Exposed" : buildContent.includes("hibernate") ? "Hibernate" : null,
      };
    }

    if (buildContent.includes("play")) {
      return {
        framework: "play-framework", language: "scala", languageVersion: "3.x",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "Play Auth",
        loggingPattern: "unstructured", orm: buildContent.includes("slick") ? "Slick" : buildContent.includes("anorm") ? "Anorm" : null,
      };
    }

    // Generic JVM
    return {
      framework: "generic-server", language: "java", languageVersion: "21",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false,
      importStyle: "absolute", rolePattern: "none", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  // ---- Go ----
  if (await fileExists(rootPath, "go.mod")) {
    const goMod = await readFileSafe(rootPath, "go.mod") ?? "";

    if (goMod.includes("gin-gonic/gin")) {
      return {
        framework: "gin", language: "go", languageVersion: "1.22",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: goMod.includes("gorm") ? "GORM" : goMod.includes("sqlx") ? "sqlx" : goMod.includes("ent") ? "Ent" : null,
      };
    }

    if (goMod.includes("labstack/echo")) {
      return {
        framework: "echo", language: "go", languageVersion: "1.22",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: goMod.includes("gorm") ? "GORM" : null,
      };
    }

    if (goMod.includes("gofiber/fiber")) {
      return {
        framework: "fiber", language: "go", languageVersion: "1.22",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: goMod.includes("gorm") ? "GORM" : goMod.includes("ent") ? "Ent" : null,
      };
    }

    if (goMod.includes("go-chi/chi")) {
      return {
        framework: "chi", language: "go", languageVersion: "1.22",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "unstructured", orm: goMod.includes("gorm") ? "GORM" : goMod.includes("sqlx") ? "sqlx" : null,
      };
    }

    // Generic Go
    return {
      framework: "generic-server", language: "go", languageVersion: "1.22",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
      importStyle: "absolute", rolePattern: "middleware", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  // ---- Rust ----
  if (await fileExists(rootPath, "Cargo.toml")) {
    const cargo = await readFileSafe(rootPath, "Cargo.toml") ?? "";

    if (cargo.includes("actix-web")) {
      return {
        framework: "actix-web", language: "rust", languageVersion: "stable",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "structured", orm: cargo.includes("diesel") ? "Diesel" : cargo.includes("sqlx") ? "SQLx" : cargo.includes("sea-orm") ? "SeaORM" : null,
      };
    }

    if (cargo.includes("axum")) {
      return {
        framework: "axum", language: "rust", languageVersion: "stable",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "structured", orm: cargo.includes("sqlx") ? "SQLx" : cargo.includes("diesel") ? "Diesel" : cargo.includes("sea-orm") ? "SeaORM" : null,
      };
    }

    if (cargo.includes("rocket")) {
      return {
        framework: "rocket", language: "rust", languageVersion: "stable",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "session",
        loggingPattern: "unstructured", orm: cargo.includes("diesel") ? "Diesel" : null,
      };
    }

    // Generic Rust
    return {
      framework: "generic-server", language: "rust", languageVersion: "stable",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
      importStyle: "absolute", rolePattern: "none", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  // ---- C# (.NET) ----
  if (await fileExists(rootPath, "**/*.csproj") || await fileExists(rootPath, "**/*.sln")) {
    const csproj = await readFirstFile(rootPath, "**/*.csproj") ?? "";

    if (csproj.includes("Microsoft.NET.Sdk.Web") || csproj.includes("Microsoft.AspNetCore")) {
      const isBlazor = csproj.includes("Blazor");
      return {
        framework: isBlazor ? "blazor-api" : "aspnet-core",
        language: "csharp",
        languageVersion: ".NET 8",
        hasHexagonalArch: false, hasServiceRepo: isBlazor ? false : true,
        usesAPIView: false, usesFunctionViews: false,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "ASP.NET Identity",
        loggingPattern: "structured",
        orm: csproj.includes("EntityFrameworkCore") ? "Entity Framework Core" : csproj.includes("Dapper") ? "Dapper" : null,
      };
    }

    return {
      framework: "generic-server", language: "csharp", languageVersion: ".NET 8",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: false,
      importStyle: "absolute", rolePattern: "none", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  // ---- Swift ----
  if (await fileExists(rootPath, "Package.swift")) {
    const pkgSwift = await readFileSafe(rootPath, "Package.swift") ?? "";
    if (pkgSwift.includes("vapor")) {
      return {
        framework: "vapor", language: "swift", languageVersion: "5.10",
        hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
        importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT",
        loggingPattern: "structured", orm: pkgSwift.includes("fluent") ? "Fluent" : null,
      };
    }
    return {
      framework: "generic-server", language: "swift", languageVersion: "5.10",
      hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true,
      importStyle: "absolute", rolePattern: "none", authMethod: "none",
      loggingPattern: "unstructured", orm: null,
    };
  }

  return null;
}

// ============================================================
// Frontend detection — all frameworks gitnexus supports
// ============================================================

async function detectFrontend(rootPath: string): Promise<FrontendInfo | null> {
  const pkg = await readJson(rootPath, "frontend/package.json")
    ?? await readJson(rootPath, "package.json");

  if (!pkg) {
    // Check for non-npm frontends
    return detectNonNpmFrontend(rootPath);
  }

  const deps = pkgDeps(pkg);
  const hasTS = !!deps.typescript;

  // ---- Vue ecosystem ----
  if (deps.vue) {
    const isVue3 = typeof deps.vue === "string" && (deps.vue.startsWith("^3") || deps.vue.startsWith("3") || deps.vue.startsWith("~3"));
    const hasNuxt = !!(deps.nuxt);

    return {
      framework: hasNuxt ? "nuxt3" : "vue3",
      componentPattern: isVue3 || hasNuxt ? "script-setup" : "options-api",
      uiLibrary: deps.vuetify ? "Vuetify 3" : deps["element-plus"] ? "Element Plus" : deps["ant-design-vue"] ? "Ant Design Vue" : deps["@headlessui/vue"] ? "Headless UI" : deps["primevue"] ? "PrimeVue" : deps["naive-ui"] ? "Naive UI" : null,
      stateManagement: deps.pinia ? "Pinia" : deps.vuex ? "Vuex" : null,
      usesI18n: !!(deps["vue-i18n"]),
      i18nLibrary: deps["vue-i18n"] ? "vue-i18n" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // ---- React ecosystem ----
  if (deps.react) {
    const hasNext = !!(deps.next);
    const hasGatsby = !!(deps.gatsby);
    const hasRemix = !!(deps["@remix-run/react"]);
    const isNative = !!(deps["react-native"]);

    return {
      framework: isNative ? "react-native" : hasNext ? "nextjs" : hasGatsby ? "gatsby" : hasRemix ? "remix-spa" : "react",
      componentPattern: "functional",
      uiLibrary: deps["@mui/material"] ? "MUI" : deps.antd ? "Ant Design" : deps["@shadcn/ui"] || deps["@radix-ui"] ? "shadcn/ui" : deps["@mantine/core"] ? "Mantine" : deps["@chakra-ui/react"] ? "Chakra UI" : deps["@nextui-org/react"] ? "NextUI" : deps["@fluentui/react"] ? "Fluent UI" : deps["@blueprintjs/core"] ? "Blueprint" : null,
      stateManagement: deps["@reduxjs/toolkit"] ? "Redux Toolkit" : deps.redux ? "Redux" : deps.zustand ? "Zustand" : deps.jotai ? "Jotai" : deps["@tanstack/react-query"] ? "TanStack Query" : null,
      usesI18n: !!(deps["react-i18next"] || deps["next-intl"]),
      i18nLibrary: deps["next-intl"] ? "next-intl" : deps["react-i18next"] ? "react-i18next" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // ---- Angular ----
  if (deps["@angular/core"]) {
    return {
      framework: "angular",
      componentPattern: "class-component",
      uiLibrary: deps["@angular/material"] ? "Angular Material" : deps["@ng-bootstrap/ng-bootstrap"] ? "ng-bootstrap" : deps["primeng"] ? "PrimeNG" : null,
      stateManagement: deps["@ngrx/store"] ? "NgRx" : deps["@ngxs/store"] ? "NGXS" : deps["@angular/fire"] ? "AngularFire" : null,
      usesI18n: !!(deps["@angular/localize"] || deps["@ngx-translate/core"]),
      i18nLibrary: deps["@ngx-translate/core"] ? "ngx-translate" : deps["@angular/localize"] ? "@angular/localize" : null,
      usesTypeScript: true,
      roleAwareUI: false,
    };
  }

  // ---- Svelte ----
  if (deps.svelte) {
    const hasKit = !!(deps["@sveltejs/kit"]);
    return {
      framework: hasKit ? "sveltekit" : "svelte",
      componentPattern: "script-setup",
      uiLibrary: deps["@skeletonlabs/skeleton"] ? "Skeleton" : deps["flowbite-svelte"] ? "Flowbite Svelte" : null,
      stateManagement: deps["svelte/store"] ? "Svelte stores" : null,
      usesI18n: !!(deps["svelte-i18n"] || deps["@inlang/paraglide-js"]),
      i18nLibrary: deps["svelte-i18n"] ? "svelte-i18n" : deps["@inlang/paraglide-js"] ? "Paraglide" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // ---- SolidJS ----
  if (deps["solid-js"]) {
    return {
      framework: "solidjs",
      componentPattern: "functional",
      uiLibrary: deps["@kobalte/core"] ? "Kobalte" : deps["@solidjs-material/core"] ? "Solid Material" : null,
      stateManagement: null, // Solid has built-in signals
      usesI18n: !!(deps["@solid-primitives/i18n"]),
      i18nLibrary: deps["@solid-primitives/i18n"] ? "@solid-primitives/i18n" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // ---- Qwik ----
  if (deps["@builder.io/qwik"]) {
    return {
      framework: "qwik",
      componentPattern: "functional",
      uiLibrary: deps["@qwik-ui/core"] ? "Qwik UI" : null,
      stateManagement: null,
      usesI18n: !!(deps["@builder.io/qwik-speak"]),
      i18nLibrary: deps["@builder.io/qwik-speak"] ? "qwik-speak" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // ---- Astro ----
  if (deps.astro) {
    return {
      framework: "astro",
      componentPattern: "functional",
      uiLibrary: deps["@astrojs/react"] ? "React (Astro island)" : deps["@astrojs/vue"] ? "Vue (Astro island)" : deps["@astrojs/svelte"] ? "Svelte (Astro island)" : null,
      stateManagement: null,
      usesI18n: !!(deps["@astrojs/i18n"]),
      i18nLibrary: deps["@astrojs/i18n"] ? "@astrojs/i18n" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  // Generic SPA (has Vite/webpack/esbuild but no known framework)
  if (deps.vite || deps.webpack || deps.esbuild || deps.turbo || deps.snowpack) {
    return {
      framework: "generic-spa",
      componentPattern: "unknown",
      uiLibrary: null,
      stateManagement: null,
      usesI18n: false,
      i18nLibrary: null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    };
  }

  return null;
}

async function detectNonNpmFrontend(rootPath: string): Promise<FrontendInfo | null> {
  // Blazor WASM
  if (await grepFirst(rootPath, "**/*.csproj", "Blazor") || await grepFirst(rootPath, "**/*.razor", "")) {
    return {
      framework: "blazor-wasm", componentPattern: "class-component",
      uiLibrary: "Blazor components", stateManagement: null,
      usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false,
    };
  }

  // HTMX
  if (await grepFirst(rootPath, "**/*.html", "htmx|hx-get|hx-post")) {
    return {
      framework: "htmx", componentPattern: "unknown",
      uiLibrary: null, stateManagement: null,
      usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false,
    };
  }

  // Alpine.js
  if (await grepFirst(rootPath, "**/*.html", "x-data|alpinejs|@click")) {
    return {
      framework: "alpine", componentPattern: "unknown",
      uiLibrary: null, stateManagement: null,
      usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false,
    };
  }

  // Flutter
  if (await fileExists(rootPath, "pubspec.yaml")) {
    const pubspec = await readFileSafe(rootPath, "pubspec.yaml") ?? "";
    if (pubspec.includes("flutter")) {
      return {
        framework: "flutter", componentPattern: "class-component",
        uiLibrary: "Material Design (Flutter)", stateManagement: pubspec.includes("provider") ? "Provider" : pubspec.includes("riverpod") ? "Riverpod" : pubspec.includes("bloc") ? "BLoC" : null,
        usesI18n: pubspec.includes("flutter_localizations"), i18nLibrary: pubspec.includes("flutter_localizations") ? "flutter_localizations" : null,
        usesTypeScript: false, roleAwareUI: false,
      };
    }
  }

  // SwiftUI
  if (await fileExists(rootPath, "**/*.swift")) {
    const swiftFile = await readFirstFile(rootPath, "**/*.swift") ?? "";
    if (swiftFile.includes("SwiftUI") || swiftFile.includes("@main")) {
      return {
        framework: "swiftui", componentPattern: "functional",
        uiLibrary: "SwiftUI", stateManagement: swiftFile.includes("@StateObject") ? "@StateObject" : swiftFile.includes("@Observable") ? "@Observable" : null,
        usesI18n: swiftFile.includes("LocalizedStringKey"), i18nLibrary: swiftFile.includes("LocalizedStringKey") ? "SwiftUI Localization" : null,
        usesTypeScript: false, roleAwareUI: false,
      };
    }
  }

  return null;
}

// ============================================================
// Testing detection
// ============================================================

async function detectTesting(rootPath: string): Promise<TestingInfo> {
  const result: TestingInfo = { backend: null, frontend: null };

  // Python testing
  if (await fileExists(rootPath, "**/pytest.ini") || await fileExists(rootPath, "**/pyproject.toml")) {
    const pyproject = await readFileSafe(rootPath, "pyproject.toml") ?? "";
    const hasPytest = pyproject.includes("[tool.pytest") || pyproject.includes("pytest");
    if (hasPytest) {
      const hasIntegration = pyproject.includes("integration");
      result.backend = { framework: "pytest", command: hasIntegration ? "pytest -m 'not integration'" : "pytest" };
    }
  }
  if (await fileExists(rootPath, "**/conftest.py")) {
    result.backend ??= { framework: "pytest", command: "pytest" };
  }
  // unittest
  if (await grepFirst(rootPath, "**/test_*.py", "unittest")) {
    result.backend ??= { framework: "unittest", command: "python -m unittest" };
  }

  // JS/TS testing
  const pkg = await readJson(rootPath, "package.json");
  if (pkg) {
    const deps = pkgDeps(pkg);
    if (deps.vitest) {
      result.frontend = { framework: "vitest", command: "npx vitest run" };
    } else if (deps.jest) {
      result.frontend = { framework: "jest", command: "npx jest" };
    } else if (deps.mocha) {
      result.frontend = { framework: "mocha", command: "npx mocha" };
    } else if (deps["@playwright/test"]) {
      result.frontend = { framework: "playwright", command: "npx playwright test" };
    } else if (deps.cypress) {
      result.frontend = { framework: "cypress", command: "npx cypress run" };
    }
  }

  // Ruby testing
  if (await grepFirst(rootPath, "Gemfile", "rspec")) {
    result.backend ??= { framework: "RSpec", command: "bundle exec rspec" };
  }

  // Java testing
  if (await grepFirst(rootPath, "**/pom.xml", "junit")) {
    result.backend ??= { framework: "JUnit", command: "mvn test" };
  }

  // Go testing
  if (await fileExists(rootPath, "**/*_test.go")) {
    result.backend ??= { framework: "go test", command: "go test ./..." };
  }

  // Rust testing
  if (await grepFirst(rootPath, "Cargo.toml", "\\[dev-dependencies\\]")) {
    result.backend ??= { framework: "cargo test", command: "cargo test" };
  }

  // PHP testing
  if (await grepFirst(rootPath, "composer.json", "phpunit")) {
    result.backend ??= { framework: "PHPUnit", command: "vendor/bin/phpunit" };
  }

  // .NET testing
  if (await grepFirst(rootPath, "**/*.csproj", "xunit|nunit|MSTest")) {
    result.backend ??= { framework: "xUnit/NUnit", command: "dotnet test" };
  }

  return result;
}

// ============================================================
// Linting detection
// ============================================================

async function detectLinting(rootPath: string): Promise<LintingInfo> {
  const result: LintingInfo = { backend: null, frontend: null };

  // Python
  const pyproject = await readFileSafe(rootPath, "pyproject.toml") ?? "";
  if (pyproject.includes("[tool.ruff")) {
    result.backend = { tool: "ruff", command: "ruff check ." };
  } else if (await fileExists(rootPath, ".flake8")) {
    result.backend = { tool: "flake8", command: "flake8 ." };
  } else if (pyproject.includes("[tool.pylint")) {
    result.backend = { tool: "pylint", command: "pylint ." };
  }

  // JS/TS
  const pkg = await readJson(rootPath, "package.json");
  if (pkg) {
    const deps = pkgDeps(pkg);
    if (deps.eslint) {
      result.frontend = { tool: "eslint", command: "npx eslint src --ext .ts,.vue" };
    } else if (deps.biome) {
      result.frontend = { tool: "biome", command: "npx biome check ." };
    }
  }

  // Rust
  if (await grepFirst(rootPath, "Cargo.toml", "clippy")) {
    result.backend ??= { tool: "clippy", command: "cargo clippy" };
  }

  // Go
  if (await fileExists(rootPath, "**/golangci.yml") || await fileExists(rootPath, "**/.golangci.yml")) {
    result.backend ??= { tool: "golangci-lint", command: "golangci-lint run" };
  }

  // PHP
  if (await grepFirst(rootPath, "composer.json", "phpstan|pint|php-cs-fixer")) {
    result.backend ??= { tool: "phpstan/pint", command: "vendor/bin/phpstan analyse" };
  }

  return result;
}

// ============================================================
// CI/CD, Monorepo, Database detection (unchanged patterns)
// ============================================================

async function detectCICD(rootPath: string): Promise<CICDInfo | null> {
  if (await dirExists(path.join(rootPath, ".github", "workflows"))) {
    return { provider: "github-actions", configPath: ".github/workflows/" };
  }
  if (await fileExists(rootPath, ".gitlab-ci.yml")) {
    return { provider: "gitlab-ci", configPath: ".gitlab-ci.yml" };
  }
  if (await dirExists(path.join(rootPath, ".circleci"))) {
    return { provider: "circleci", configPath: ".circleci/" };
  }
  if (await fileExists(rootPath, "Jenkinsfile")) {
    return { provider: "jenkins", configPath: "Jenkinsfile" };
  }
  return null;
}

async function detectMonorepo(rootPath: string): Promise<MonorepoInfo | null> {
  const pkg = await readJson(rootPath, "package.json");
  if (pkg?.workspaces) {
    return {
      tool: "yarn-workspaces",
      packages: Array.isArray(pkg.workspaces) ? pkg.workspaces as string[] : (pkg.workspaces as Record<string, unknown>)?.packages as string[] ?? [],
    };
  }
  if (await fileExists(rootPath, "nx.json")) return { tool: "nx", packages: [] };
  if (await fileExists(rootPath, "turbo.json")) return { tool: "turborepo", packages: [] };
  if (await fileExists(rootPath, "lerna.json")) return { tool: "lerna", packages: [] };
  if (await fileExists(rootPath, "pnpm-workspace.yaml")) return { tool: "pnpm-workspaces", packages: [] };
  return null;
}

async function detectDatabase(rootPath: string, backend: BackendInfo | null): Promise<DatabaseInfo | null> {
  if (!backend) return null;

  // Python
  if (backend.language === "python") {
    const settings = await readFileSafe(rootPath, "**/settings.py") ?? await readFileSafe(rootPath, "**/config.py") ?? "";
    if (settings.includes("sqlite")) return { engine: "sqlite", orm: backend.orm };
    if (settings.includes("postgresql") || settings.includes("postgres")) return { engine: "postgresql", orm: backend.orm };
    if (settings.includes("mysql")) return { engine: "mysql", orm: backend.orm };
    if (settings.includes("mssql") || settings.includes("sql_server")) return { engine: "mssql", orm: backend.orm };
    if (settings.includes("mongodb") || settings.includes("mongo")) return { engine: "mongodb", orm: backend.orm };
  }

  // Ruby
  if (backend.language === "ruby") {
    const dbYml = await readFileSafe(rootPath, "config/database.yml") ?? "";
    if (dbYml.includes("postgresql")) return { engine: "postgresql", orm: "ActiveRecord" };
    if (dbYml.includes("mysql")) return { engine: "mysql", orm: "ActiveRecord" };
    if (dbYml.includes("sqlite")) return { engine: "sqlite", orm: "ActiveRecord" };
  }

  // Go
  if (backend.language === "go") {
    if (backend.orm === "GORM" || backend.orm === "Ent" || backend.orm === "sqlx") {
      return { engine: "postgresql", orm: backend.orm };
    }
  }

  // Java
  if (backend.language === "java" || backend.language === "kotlin") {
    if (backend.orm?.includes("JPA") || backend.orm?.includes("Hibernate")) {
      return { engine: "postgresql", orm: backend.orm };
    }
  }

  return null;
}

// ============================================================
// Helpers
// ============================================================

function buildBackendInfo(
  framework: BackendFramework, language: BackendInfo["language"], langVersion: string,
  orm: string | null, hasServiceRepo: boolean,
): BackendInfo {
  return {
    framework, language, languageVersion: langVersion,
    hasHexagonalArch: framework === "django" ? hasServiceRepo : false,
    hasServiceRepo,
    usesAPIView: framework === "django",
    usesFunctionViews: framework !== "django",
    importStyle: "absolute",
    rolePattern: framework === "django" ? "decorators" : framework === "fastapi" ? "middleware" : "none",
    authMethod: "JWT",
    loggingPattern: framework === "django" || framework === "fastapi" ? "structured" : "unstructured",
    orm,
  };
}

function pkgDeps(pkg: Record<string, unknown>): Record<string, unknown> {
  return { ...(pkg.dependencies as Record<string, unknown> ?? {}), ...(pkg.devDependencies as Record<string, unknown> ?? {}) };
}

function nodeORM(deps: Record<string, unknown>): string | null {
  if (deps["@prisma/client"] || deps.prisma) return "Prisma";
  if (deps.drizzle || deps["drizzle-orm"]) return "Drizzle";
  if (deps.typeorm) return "TypeORM";
  if (deps.mikroorm || deps["@mikro-orm/core"]) return "MikroORM";
  if (deps.knex) return "Knex";
  if (deps.mongoose) return "Mongoose";
  if (deps.sequelize) return "Sequelize";
  if (deps["better-sqlite3"]) return "better-sqlite3";
  return null;
}

async function detectPythonORM(rootPath: string): Promise<string | null> {
  const content = await readFileSafe(rootPath, "requirements.txt") ?? "";
  if (content.includes("django")) return "Django ORM";
  if (content.includes("sqlalchemy")) return "SQLAlchemy";
  if (content.includes("tortoise-orm")) return "Tortoise ORM";
  if (content.includes("pony")) return "Pony ORM";
  if (content.includes("peewee")) return "Peewee";
  return null;
}

async function pyVersion(rootPath: string): Promise<string> {
  const setupCfg = await readFileSafe(rootPath, "setup.cfg") ?? "";
  const match = setupCfg.match(/python_requires\s*=\s*[>]=\s*(\d+\.\d+)/);
  if (match) return match[1];
  const pyproject = await readFileSafe(rootPath, "pyproject.toml") ?? "";
  const m2 = pyproject.match(/requires-python\s*=\s*"[>=]+\s*(\d+\.\d+)/);
  if (m2) return m2[1];
  return "3.12";
}

// ---- Generic file/dir operations ----

async function fileExists(root: string, pattern: string): Promise<boolean> {
  // For simple filenames (no glob chars), try direct path first
  if (!pattern.includes("*") && !pattern.includes("?")) {
    const simple = pattern.replace(/^\*\*\//, ""); // strip **/ prefix for direct check
    try { if (await fs.pathExists(path.join(root, simple))) return true; } catch {}
  }
  // Then try glob
  return (await findFile(root, pattern)) !== null;
}

async function findFile(root: string, pattern: string): Promise<string | null> {
  try {
    const { glob } = await import("tinyglobby");
    const patterns = [pattern];
    // If pattern uses **/ prefix, also try without it (for root-level files)
    if (pattern.startsWith("**/")) {
      patterns.push(pattern.slice(3)); // "**/main.py" -> "main.py"
    }
    const matches = await glob(patterns, {
      cwd: root, absolute: true,
      ignore: ["node_modules/**", ".git/**", "**/vendor/**"],
    });
    return matches.length > 0 ? matches[0] : null;
  } catch { return null; }
}

async function readFirstFile(root: string, pattern: string): Promise<string | null> {
  const f = await findFile(root, pattern);
  if (!f) return null;
  try { return await fs.readFile(f, "utf-8"); } catch { return null; }
}

function contentMatches(content: string, pattern: string): boolean {
  if (!pattern) return true;
  // Support pipe-separated alternation: "FastAPI|fastapi" matches either
  const alternates = pattern.split("|");
  return alternates.some((alt) => content.includes(alt));
}

async function grepFirst(root: string, filePattern: string, contentPattern: string): Promise<boolean> {
  try {
    const { glob } = await import("tinyglobby");
    // Try both the glob pattern and the plain filename (for root-level files)
    const patterns = [filePattern];
    if (filePattern.startsWith("**/")) {
      patterns.push(filePattern.slice(3));
    }
    const matches = await glob(patterns, {
      cwd: root, absolute: true,
      ignore: ["node_modules/**", ".git/**", "**/vendor/**"],
    });
    for (const file of matches.slice(0, 5)) {
      try {
        const content = await fs.readFile(file, "utf-8");
        if (contentMatches(content, contentPattern)) return true;
      } catch {}
    }
  } catch {}
  return false;
}

async function dirExists(dirPath: string): Promise<boolean> {
  try { return (await fs.stat(dirPath)).isDirectory(); } catch { return false; }
}

async function readJson(root: string, relativePath: string): Promise<Record<string, unknown> | null> {
  try { return (await fs.readJson(path.join(root, relativePath))) as Record<string, unknown>; } catch { return null; }
}

async function readFileSafe(root: string, relativePath: string): Promise<string | null> {
  // If path contains glob wildcards, use findFile to locate it first
  if (relativePath.includes("*") || relativePath.includes("?")) {
    return await readFirstFile(root, relativePath);
  }
  try { return await fs.readFile(path.join(root, relativePath), "utf-8"); } catch { return null; }
}
