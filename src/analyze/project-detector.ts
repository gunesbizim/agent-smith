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
import {
  type FsCache,
  createFsCache,
  fileExists,
  findFile,
  readFirstFile,
  readFileSafe,
  readJson,
  grepFirst,
  dirExists,
  pkgDeps,
  findSubPackages,
  findAllPackageJsons,
} from "./fs-helpers.js";
import {
  detectBackendFromRegistry,
  manifestEvidence,
  nodeEvidence,
  phpEvidence,
  goModVersion,
  goORM,
  goAuth,
  tsVersion,
  rustVersion,
  GO_ROWS,
  RUST_ROWS,
  NODE_ROWS,
  RUBY_ROWS,
  PHP_ROWS,
  JVM_ROWS,
  DOTNET_ROWS,
  SWIFT_ROWS,
} from "./detector-registry.js";

// ============================================================
// Main entry
// ============================================================

export async function detectProject(rootPath: string): Promise<DetectedProject> {
  const project: DetectedProject = {
    rootPath,
    projectType: "unknown",
    backend: null,
    frontend: null,
    testing: { backend: null, frontend: null },
    linting: { backend: null, frontend: null },
    cicd: null,
    monorepo: null,
    database: null,
  };

  // Detect monorepo first — affects where we search
  project.monorepo = await detectMonorepo(rootPath);
  if (project.monorepo) project.projectType = "monorepo";

  project.backend = await detectBackend(rootPath, project);
  project.frontend = await detectFrontend(rootPath, project);

  // Detect CLI tool or library if no backend/frontend
  if (!project.backend && !project.frontend) {
    const toolType = await detectToolType(rootPath);
    if (toolType) project.projectType = toolType;
  } else if (project.backend || project.frontend) {
    project.projectType = "web-app";
  }

  project.testing = await detectTesting(rootPath);
  project.linting = await detectLinting(rootPath);
  project.cicd = await detectCICD(rootPath);
  project.database = await detectDatabase(rootPath, project.backend);

  return project;
}

// Detect CLI tools and libraries (no web backend/frontend)
async function detectToolType(rootPath: string): Promise<"cli-tool" | "library" | null> {
  const pkg = await readJson(rootPath, "package.json");
  if (!pkg) return null;

  const deps = pkgDeps(pkg);
  const hasBin = !!(pkg.bin);
  const hasCliDep = !!(deps.commander || deps.yargs || deps.oclif || deps["@oclif/core"] || deps.cac || deps.clipanion || deps.meow);

  if (hasBin || hasCliDep) return "cli-tool";

  const hasMain = !!(pkg.main || pkg.module || pkg.exports);
  if (hasMain && !pkg.private) return "library";

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (scripts?.build && await fileExists(rootPath, "src")) {
    return hasBin ? "cli-tool" : "library";
  }

  return null;
}

// Get all search roots: the project root plus any workspace packages
function getSearchRoots(rootPath: string, project: DetectedProject): string[] {
  const roots = [rootPath];
  if (project.monorepo) {
    // Add common monorepo subdirs
    for (const subdir of ["apps", "packages", "services", "libs"]) {
      const subPath = path.join(rootPath, subdir);
      if (fs.existsSync(subPath)) {
        roots.push(subPath);
      }
    }
  }
  return roots;
}

// ============================================================
// Backend detection — all languages gitnexus supports
// ============================================================

async function detectBackend(rootPath: string, project?: DetectedProject): Promise<BackendInfo | null> {
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
  // The registry holds the framework facts; this resolves WHICH package.json to read.
  const rootPkg = await readJson(rootPath, "package.json");
  const backendPkg = await readJson(rootPath, "backend/package.json") ?? await readJson(rootPath, "server/package.json") ?? await readJson(rootPath, "api/package.json");
  const pkg = backendPkg ?? rootPkg;

  if (pkg) {
    const result = detectBackendFromRegistry(NODE_ROWS, nodeEvidence(pkgDeps(pkg)));
    if (result) return result;
  }

  // ---- Ruby ----
  if (await fileExists(rootPath, "Gemfile")) {
    const gemfile = await readFileSafe(rootPath, "Gemfile") ?? "";
    return detectBackendFromRegistry(RUBY_ROWS, manifestEvidence(gemfile));
  }

  // ---- PHP ----
  if (await fileExists(rootPath, "composer.json")) {
    const composer = await readJson(rootPath, "composer.json");
    if (composer) {
      const require = (composer.require as Record<string, string>) ?? {};
      return detectBackendFromRegistry(PHP_ROWS, phpEvidence(require));
    }
  }

  // ---- Java / Kotlin / Scala (JVM) ----
  if (await fileExists(rootPath, "**/pom.xml") || await fileExists(rootPath, "**/build.gradle") || await fileExists(rootPath, "**/build.gradle.kts")) {
    const pom = await readFileSafe(rootPath, "**/pom.xml") ?? "";
    const gradle = (await readFileSafe(rootPath, "**/build.gradle") ?? "") + (await readFileSafe(rootPath, "**/build.gradle.kts") ?? "");
    const buildContent = pom + gradle;
    return detectBackendFromRegistry(JVM_ROWS, manifestEvidence(buildContent));
  }

  // ---- Go ----
  if (await fileExists(rootPath, "go.mod")) {
    const goMod = await readFileSafe(rootPath, "go.mod") ?? "";
    return detectBackendFromRegistry(GO_ROWS, manifestEvidence(goMod));
  }

  // ---- Rust ----
  if (await fileExists(rootPath, "Cargo.toml")) {
    const cargo = await readFileSafe(rootPath, "Cargo.toml") ?? "";
    return detectBackendFromRegistry(RUST_ROWS, manifestEvidence(cargo));
  }

  // ---- C# (.NET) ----
  if (await fileExists(rootPath, "**/*.csproj") || await fileExists(rootPath, "**/*.sln")) {
    const csproj = await readFirstFile(rootPath, "**/*.csproj") ?? "";
    return detectBackendFromRegistry(DOTNET_ROWS, manifestEvidence(csproj));
  }

  // ---- Swift ----
  if (await fileExists(rootPath, "Package.swift")) {
    const pkgSwift = await readFileSafe(rootPath, "Package.swift") ?? "";
    return detectBackendFromRegistry(SWIFT_ROWS, manifestEvidence(pkgSwift));
  }

  // ---- Monorepo subdirectory search (go, rust, typescript) ----
  if (project?.monorepo) {
    const subDirs = await findSubPackages(rootPath);
    for (const subDir of subDirs) {
      // Go backends in subdirs
      if (await fileExists(subDir, "go.mod")) {
        const goMod = await readFileSafe(subDir, "go.mod") ?? "";
        const result = detectGoBackend(subDir, goMod);
        if (result) return result;
      }
      // Rust backends in subdirs
      if (await fileExists(subDir, "Cargo.toml")) {
        const cargo = await readFileSafe(subDir, "Cargo.toml") ?? "";
        const toolchain = (await readFileSafe(subDir, "rust-toolchain.toml")) ?? (await readFileSafe(subDir, "rust-toolchain")) ?? "";
        const result = detectRustBackend(subDir, cargo, toolchain);
        if (result) return result;
      }
      // TypeScript backends in subdirs (Hono, Express, NestJS, etc.)
      const subPkg = await readJson(subDir, "package.json");
      if (subPkg) {
        const deps = pkgDeps(subPkg);
        const tsv = tsVersion(deps); // B1: real typescript version, "" when unknown (never "5.x")
        if (deps.hono) {
          return { framework: "hono", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null };
        }
        if (deps.express) {
          return { framework: "express", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: nodeORM(deps) };
        }
        if (deps.fastify) {
          return { framework: "fastify", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: nodeORM(deps) };
        }
        if (deps["@nestjs/core"]) {
          return { framework: "nestjs", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "decorators", authMethod: "JWT", loggingPattern: "structured", orm: deps["@prisma/client"] ? "Prisma" : null };
        }
      }
    }
  }

  return null;
}

// Monorepo subpackage Go detection. NOTE: deliberately distinct from the root GO_ROWS
// registry path — here auth defaults to a hardcoded "JWT" for the named frameworks and
// the ORM scan omits sqlc, matching the original behavior for sub-package discovery.
function detectGoBackend(subDir: string, goMod: string): BackendInfo | null {
  if (goMod.includes("gin-gonic/gin")) return { framework: "gin", language: "go", languageVersion: goModVersion(goMod), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: goMod.includes("gorm") ? "GORM" : goMod.includes("sqlx") ? "sqlx" : goMod.includes("ent") ? "Ent" : null };
  if (goMod.includes("labstack/echo")) return { framework: "echo", language: "go", languageVersion: goModVersion(goMod), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null };
  if (goMod.includes("gofiber/fiber")) return { framework: "fiber", language: "go", languageVersion: goModVersion(goMod), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null };
  if (goMod.includes("go-chi/chi")) return { framework: "chi", language: "go", languageVersion: goModVersion(goMod), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null };
  if (goMod.includes("github.com/") || goMod.includes("module ")) {
    return { framework: "generic-server", language: "go", languageVersion: goModVersion(goMod), hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: goMod.includes("jwt") ? "JWT" : "none", loggingPattern: goMod.includes("pino") || goMod.includes("logrus") || goMod.includes("zap") ? "structured" : "unstructured", orm: goMod.includes("gorm") ? "GORM" : goMod.includes("sqlx") ? "sqlx" : goMod.includes("ent") ? "Ent" : null };
  }
  return null;
}

function detectRustBackend(subDir: string, cargo: string, toolchain = ""): BackendInfo | null {
  const rv = rustVersion(toolchain); // B1: real toolchain version when pinned, else "" (never "stable")
  if (cargo.includes("actix-web")) return { framework: "actix-web", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: cargo.includes("diesel") ? "Diesel" : cargo.includes("sqlx") ? "SQLx" : null };
  if (cargo.includes("axum")) return { framework: "axum", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: cargo.includes("sqlx") ? "SQLx" : null };
  if (cargo.includes("rocket")) return { framework: "rocket", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "session", loggingPattern: "unstructured", orm: cargo.includes("diesel") ? "Diesel" : null };
  if (cargo.includes("[package]")) return { framework: "generic-server", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "none", authMethod: "none", loggingPattern: "unstructured", orm: null };
  return null;
}

// ============================================================
// Frontend detection — all frameworks gitnexus supports
// ============================================================

async function detectFrontend(rootPath: string, project?: DetectedProject): Promise<FrontendInfo | null> {
  // First, check common frontend directories
  let pkg = await readJson(rootPath, "frontend/package.json");

  // Then search monorepo subdirectories for frontend packages (before root package.json)
  if (!pkg && project?.monorepo) {
    const subDirs = await findSubPackages(rootPath);
    for (const subDir of subDirs) {
      const subPkg = await readJson(subDir, "package.json");
      if (subPkg) {
        const deps = pkgDeps(subPkg);
        if (deps.react || deps.vue || deps.svelte || deps["@angular/core"] || deps["solid-js"] || deps["@builder.io/qwik"] || deps.astro) {
          pkg = subPkg;
          break;
        }
      }
    }
    // Also check client/web/ui subdirs at root
    for (const dir of ["client", "web", "ui"]) {
      const subPkg = await readJson(rootPath, `${dir}/package.json`);
      if (subPkg) {
        const deps = pkgDeps(subPkg);
        if (deps.react || deps.vue || deps.svelte) { pkg = subPkg; break; }
      }
    }
  }

  // Fall back to root package.json only if it has UI framework deps (not just build tools)
  if (!pkg) {
    const rootPkg = await readJson(rootPath, "package.json");
    if (rootPkg) {
      const deps = pkgDeps(rootPkg);
      if (deps.react || deps.vue || deps.svelte || deps["@angular/core"] || deps["solid-js"] || deps["@builder.io/qwik"] || deps.astro) {
        pkg = rootPkg;
      }
    }
  }

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

  // JS/TS testing — check root + monorepo subdirs
  let pkg = await readJson(rootPath, "package.json");
  // Also check monorepo subdirs for test frameworks
  const subDirs = await findSubPackages(rootPath);
  const allPkgs: Record<string, unknown>[] = pkg ? [pkg] : [];
  for (const subDir of subDirs) {
    const sp = await readJson(subDir, "package.json");
    if (sp) allPkgs.push(sp);
  }
  // Also check client/web/frontend at root
  for (const dir of ["client", "web", "frontend"]) {
    const sp = await readJson(rootPath, `${dir}/package.json`);
    if (sp) allPkgs.push(sp);
  }

  for (const aPkg of allPkgs) {
    const deps = pkgDeps(aPkg);
    if (!result.frontend && deps.vitest) {
      result.frontend = { framework: "vitest", command: "npx vitest run" };
    } else if (!result.frontend && deps.jest) {
      result.frontend = { framework: "jest", command: "npx jest" };
    } else if (!result.frontend && deps.mocha) {
      result.frontend = { framework: "mocha", command: "npx mocha" };
    } else if (!result.frontend && deps["@playwright/test"]) {
      result.frontend = { framework: "playwright", command: "npx playwright test" };
    } else if (!result.frontend && deps.cypress) {
      result.frontend = { framework: "cypress", command: "npx cypress run" };
    }
  }
  // Keep pkg for the old detection path below
  pkg = allPkgs[0] ?? null;

  // Old JS/TS test detection (for projects with single package.json)
  if (pkg && !result.frontend) {
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
    result.backend ??= { framework: "PHPUnit", command: process.platform === "win32" ? "vendor\\bin\\phpunit.bat" : "vendor/bin/phpunit" };
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

  // JS/TS — check root + monorepo subdirs
  const lintPkgs: Record<string, unknown>[] = [];
  const rootLintPkg = await readJson(rootPath, "package.json");
  if (rootLintPkg) lintPkgs.push(rootLintPkg);
  const lintSubDirs = await findSubPackages(rootPath);
  for (const subDir of lintSubDirs) {
    const sp = await readJson(subDir, "package.json");
    if (sp) lintPkgs.push(sp);
  }
  // Also root-level client/web/frontend
  for (const dir of ["client", "web", "frontend"]) {
    const sp = await readJson(rootPath, `${dir}/package.json`);
    if (sp) lintPkgs.push(sp);
  }
  for (const lp of lintPkgs) {
    const deps = pkgDeps(lp);
    if (!result.frontend && (deps.eslint || deps["@eslint/config"])) {
      result.frontend = { tool: "eslint", command: "npx eslint src --ext .ts,.vue" };
    }
    if (!result.frontend && (deps.biome || deps["@biomejs/biome"])) {
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
    result.backend ??= { tool: "phpstan/pint", command: process.platform === "win32" ? "vendor\\bin\\phpstan analyse" : "vendor/bin/phpstan analyse" };
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

  // Go — check go.mod for database drivers. Drivers prove the engine; the ORM is
  // taken from the framework's facts-only scan, never fabricated from a driver (B3).
  if (backend.language === "go") {
    const goMods = await findSubPackageGoMods(rootPath);
    const joined = goMods.join("\n");
    // sqlc is configured by a file (sqlc.yaml/json), not a go.mod require.
    const hasSqlc = await fileExists(rootPath, "sqlc.yaml") || await fileExists(rootPath, "sqlc.yml") || await fileExists(rootPath, "sqlc.json");
    // Single source of truth for the ORM: prefer the framework finding, then a
    // go.mod scan, then sqlc-by-config. Drivers alone yield null.
    const orm = backend.orm ?? goORM(joined) ?? (hasSqlc ? "sqlc" : null);
    if (joined.includes("pgx") || joined.includes("lib/pq")) return { engine: "postgresql", orm };
    if (joined.includes("go-sqlite3") || joined.includes("sqlite")) return { engine: "sqlite", orm };
    if (joined.includes("clickhouse-go")) return { engine: "clickhouse", orm };
    if (joined.includes("go-mysql") || joined.includes("mysql-driver")) return { engine: "mysql", orm };
    if (joined.includes("mongo-driver") || joined.includes("mongo")) return { engine: "mongodb", orm };
    // ORM present but no driver evidence: report the ORM honestly, engine unknown.
    if (orm) return { engine: "unknown", orm };
  }

  // TypeScript — check package.json for database drivers
  if (backend.language === "typescript" || backend.language === "javascript") {
    const allPkgs = await findAllPackageJsons(rootPath);
    for (const pkg of allPkgs) {
      const deps = pkgDeps(pkg);
      if (deps.postgres || deps["pg"] || deps["pgx"]) return { engine: "postgresql", orm: deps.drizzle ? "Drizzle" : deps.prisma ? "Prisma" : null };
      if (deps.mysql || deps["mysql2"]) return { engine: "mysql", orm: deps.drizzle ? "Drizzle" : deps.prisma ? "Prisma" : null };
      if (deps["better-sqlite3"] || deps["sqlite3"]) return { engine: "sqlite", orm: null };
      if (deps.mongoose || deps.mongodb) return { engine: "mongodb", orm: "Mongoose" };
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
// fs helpers (readJson/readFileSafe/fileExists/grepFirst/findFile/readFirstFile/
// dirExists/pkgDeps/findSubPackages/findAllPackageJsons) live in ./fs-helpers.
// goORM/goAuth/goModVersion live in ./detector-registry (shared with the registry).

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

// Collect go.mod contents from all monorepo subdirs
async function findSubPackageGoMods(rootPath: string): Promise<string[]> {
  const mods: string[] = [];
  // Try root-first
  const rootMod = await readFileSafe(rootPath, "go.mod");
  if (rootMod) mods.push(rootMod);
  // Then subdirs
  const subDirs = await findSubPackages(rootPath);
  for (const subDir of subDirs) {
    const mod = await readFileSafe(subDir, "go.mod");
    if (mod) mods.push(mod);
  }
  return mods;
}

