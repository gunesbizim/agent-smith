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
  fileExists,
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
  const CLI_DEPS = ["commander", "yargs", "oclif", "@oclif/core", "cac", "clipanion", "meow"] as const;

  const hasBin = !!(pkg.bin);
  const hasCliDep = CLI_DEPS.some((d) => !!deps[d]);

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

// Each probe: async test returns manifest/content string if present, null if absent.
// The registry call happens only when the probe succeeds.
type BackendProbe = {
  test: (rootPath: string) => Promise<string | null>;
  detect: (rootPath: string, content: string) => Promise<BackendInfo | null> | BackendInfo | null;
};

async function hasPyFiles(rootPath: string): Promise<string | null> {
  if (await fileExists(rootPath, "**/pyproject.toml") ||
      await fileExists(rootPath, "requirements.txt") ||
      await fileExists(rootPath, "**/setup.py")) return "";
  return null;
}

const BACKEND_PROBES: BackendProbe[] = [
  {
    test: hasPyFiles,
    detect: (rootPath) => detectPythonBackend(rootPath),
  },
  {
    test: async (rootPath) => {
      const backendPkg = await readJson(rootPath, "backend/package.json")
        ?? await readJson(rootPath, "server/package.json")
        ?? await readJson(rootPath, "api/package.json")
        ?? await readJson(rootPath, "package.json");
      return backendPkg ? JSON.stringify(backendPkg) : null;
    },
    detect: async (rootPath, content) => {
      const pkg = JSON.parse(content) as Record<string, unknown>;
      return detectBackendFromRegistry(NODE_ROWS, nodeEvidence(pkgDeps(pkg)));
    },
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "Gemfile")) return null;
      return await readFileSafe(rootPath, "Gemfile") ?? "";
    },
    detect: (_rootPath, gemfile) => detectBackendFromRegistry(RUBY_ROWS, manifestEvidence(gemfile)),
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "composer.json")) return null;
      const c = await readJson(rootPath, "composer.json");
      return c ? JSON.stringify(c) : null;
    },
    detect: (_rootPath, content) => {
      const composer = JSON.parse(content) as Record<string, unknown>;
      const require = (composer.require as Record<string, string>) ?? {};
      return detectBackendFromRegistry(PHP_ROWS, phpEvidence(require));
    },
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "**/pom.xml") &&
          !await fileExists(rootPath, "**/build.gradle") &&
          !await fileExists(rootPath, "**/build.gradle.kts")) return null;
      const pom = await readFileSafe(rootPath, "**/pom.xml") ?? "";
      const gradle = (await readFileSafe(rootPath, "**/build.gradle") ?? "")
        + (await readFileSafe(rootPath, "**/build.gradle.kts") ?? "");
      return pom + gradle;
    },
    detect: (_rootPath, content) => detectBackendFromRegistry(JVM_ROWS, manifestEvidence(content)),
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "go.mod")) return null;
      return await readFileSafe(rootPath, "go.mod") ?? "";
    },
    detect: (_rootPath, content) => detectBackendFromRegistry(GO_ROWS, manifestEvidence(content)),
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "Cargo.toml")) return null;
      return await readFileSafe(rootPath, "Cargo.toml") ?? "";
    },
    detect: (_rootPath, content) => detectBackendFromRegistry(RUST_ROWS, manifestEvidence(content)),
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "**/*.csproj") && !await fileExists(rootPath, "**/*.sln")) return null;
      return await readFirstFile(rootPath, "**/*.csproj") ?? "";
    },
    detect: (_rootPath, content) => detectBackendFromRegistry(DOTNET_ROWS, manifestEvidence(content)),
  },
  {
    test: async (rootPath) => {
      if (!await fileExists(rootPath, "Package.swift")) return null;
      return await readFileSafe(rootPath, "Package.swift") ?? "";
    },
    detect: (_rootPath, content) => detectBackendFromRegistry(SWIFT_ROWS, manifestEvidence(content)),
  },
];

async function detectBackend(rootPath: string, project?: DetectedProject): Promise<BackendInfo | null> {
  for (const probe of BACKEND_PROBES) {
    const content = await probe.test(rootPath);
    if (content !== null) {
      const result = await probe.detect(rootPath, content);
      if (result) return result;
    }
  }

  // ---- Monorepo subdirectory search (go, rust, typescript) ----
  if (project?.monorepo) {
    return detectMonorepoSubdirBackend(rootPath);
  }

  return null;
}

async function detectPythonBackend(rootPath: string): Promise<BackendInfo | null> {
  const langVersion = await pyVersion(rootPath);

  const PYTHON_PROBES: Array<{
    test: () => Promise<boolean>;
    build: () => Promise<BackendInfo>;
  }> = [
    {
      test: () => fileExists(rootPath, "manage.py"),
      build: async () => buildBackendInfo("django", "python", langVersion, "Django ORM", true),
    },
    {
      test: () => grepFirst(rootPath, "**/main.py", "FastAPI|fastapi").then(Boolean),
      build: async () => ({ framework: "fastapi", language: "python", languageVersion: langVersion, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null }),
    },
    {
      test: () => grepFirst(rootPath, "**/*.py", "flask|Flask").then(Boolean),
      build: async () => ({ framework: "flask", language: "python", languageVersion: langVersion, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "manual", authMethod: "session", loggingPattern: "unstructured", orm: await detectPythonORM(rootPath) }),
    },
  ];

  for (const { test, build } of PYTHON_PROBES) {
    if (await test()) return build();
  }
  return buildBackendInfo("generic-server", "python", langVersion, await detectPythonORM(rootPath), false);
}

async function detectMonorepoSubdirBackend(rootPath: string): Promise<BackendInfo | null> {
  const subDirs = await findSubPackages(rootPath);
  for (const subDir of subDirs) {
    const result = await detectSubdirBackend(subDir);
    if (result) return result;
  }
  return null;
}

async function detectSubdirBackend(subDir: string): Promise<BackendInfo | null> {
  if (await fileExists(subDir, "go.mod")) {
    const goMod = await readFileSafe(subDir, "go.mod") ?? "";
    const result = detectGoBackend(subDir, goMod);
    if (result) return result;
  }
  if (await fileExists(subDir, "Cargo.toml")) {
    const cargo = await readFileSafe(subDir, "Cargo.toml") ?? "";
    const toolchain = (await readFileSafe(subDir, "rust-toolchain.toml"))
      ?? (await readFileSafe(subDir, "rust-toolchain")) ?? "";
    const result = detectRustBackend(subDir, cargo, toolchain);
    if (result) return result;
  }
  const subPkg = await readJson(subDir, "package.json");
  if (subPkg) return detectNodeSubdirBackend(subPkg);
  return null;
}

function detectNodeSubdirBackend(subPkg: Record<string, unknown>): BackendInfo | null {
  const deps = pkgDeps(subPkg);
  const tsv = tsVersion(deps); // B1: real typescript version, "" when unknown (never "5.x")

  const NODE_SUBDIR_FRAMEWORKS: Array<{ key: string; build: () => BackendInfo }> = [
    { key: "hono", build: () => ({ framework: "hono", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: null }) },
    { key: "express", build: () => ({ framework: "express", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: nodeORM(deps) }) },
    { key: "fastify", build: () => ({ framework: "fastify", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: nodeORM(deps) }) },
    { key: "@nestjs/core", build: () => ({ framework: "nestjs", language: "typescript", languageVersion: tsv, hasHexagonalArch: false, hasServiceRepo: true, usesAPIView: false, usesFunctionViews: false, importStyle: "absolute", rolePattern: "decorators", authMethod: "JWT", loggingPattern: "structured", orm: deps["@prisma/client"] ? "Prisma" : null }) },
  ] as const;

  for (const { key, build } of NODE_SUBDIR_FRAMEWORKS) {
    if (deps[key]) return build();
  }
  return null;
}

// Monorepo subpackage Go detection. NOTE: deliberately distinct from the root GO_ROWS
// registry path — here auth defaults to a hardcoded "JWT" for the named frameworks and
// the ORM scan omits sqlc, matching the original behavior for sub-package discovery.
function goSubORM(goMod: string): string | null {
  const ORM_MARKERS: Array<{ marker: string; name: string }> = [
    { marker: "gorm", name: "GORM" },
    { marker: "sqlx", name: "sqlx" },
    { marker: "ent", name: "Ent" },
  ];
  for (const { marker, name } of ORM_MARKERS) {
    if (goMod.includes(marker)) return name;
  }
  return null;
}

const GO_FRAMEWORK_MARKERS: Array<{ marker: string; framework: BackendInfo["framework"] }> = [
  { marker: "gin-gonic/gin", framework: "gin" },
  { marker: "labstack/echo", framework: "echo" },
  { marker: "gofiber/fiber", framework: "fiber" },
  { marker: "go-chi/chi", framework: "chi" },
];

function detectGoBackend(subDir: string, goMod: string): BackendInfo | null {
  const version = goModVersion(goMod);
  const orm = goSubORM(goMod);

  for (const { marker, framework } of GO_FRAMEWORK_MARKERS) {
    if (goMod.includes(marker)) {
      return { framework, language: "go", languageVersion: version, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "unstructured", orm: framework === "gin" ? orm : null };
    }
  }

  if (goMod.includes("github.com/") || goMod.includes("module ")) {
    const authMethod = goMod.includes("jwt") ? "JWT" : "none";
    const hasStructuredLog = goMod.includes("pino") || goMod.includes("logrus") || goMod.includes("zap");
    const loggingPattern = hasStructuredLog ? "structured" : "unstructured";
    return { framework: "generic-server", language: "go", languageVersion: version, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod, loggingPattern, orm };
  }
  return null;
}

const RUST_FRAMEWORK_MARKERS: Array<{ marker: string; build: (rv: string, cargo: string) => BackendInfo }> = [
  {
    marker: "actix-web",
    build: (rv, cargo) => {
      let orm: string | null;
      if (cargo.includes("diesel")) {
        orm = "Diesel";
      } else if (cargo.includes("sqlx")) {
        orm = "SQLx";
      } else {
        orm = null;
      }
      return { framework: "actix-web", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm };
    },
  },
  {
    marker: "axum",
    build: (rv, cargo) => ({ framework: "axum", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", orm: cargo.includes("sqlx") ? "SQLx" : null }),
  },
  {
    marker: "rocket",
    build: (rv, cargo) => ({ framework: "rocket", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "middleware", authMethod: "session", loggingPattern: "unstructured", orm: cargo.includes("diesel") ? "Diesel" : null }),
  },
  {
    marker: "[package]",
    build: (rv, _cargo) => ({ framework: "generic-server", language: "rust", languageVersion: rv, hasHexagonalArch: false, hasServiceRepo: false, usesAPIView: false, usesFunctionViews: true, importStyle: "absolute", rolePattern: "none", authMethod: "none", loggingPattern: "unstructured", orm: null }),
  },
];

function detectRustBackend(subDir: string, cargo: string, toolchain = ""): BackendInfo | null {
  const rv = rustVersion(toolchain); // B1: real toolchain version when pinned, else "" (never "stable")
  for (const { marker, build } of RUST_FRAMEWORK_MARKERS) {
    if (cargo.includes(marker)) return build(rv, cargo);
  }
  return null;
}

// ============================================================
// Frontend detection — all frameworks gitnexus supports
// ============================================================

// UI library lookup tables — ordered by priority (first match wins)
const VUE_UI_LIBRARIES: Array<{ dep: string; name: string }> = [
  { dep: "vuetify", name: "Vuetify 3" },
  { dep: "element-plus", name: "Element Plus" },
  { dep: "ant-design-vue", name: "Ant Design Vue" },
  { dep: "@headlessui/vue", name: "Headless UI" },
  { dep: "primevue", name: "PrimeVue" },
  { dep: "naive-ui", name: "Naive UI" },
];

const REACT_UI_LIBRARIES: Array<{ dep: string; name: string }> = [
  { dep: "@mui/material", name: "MUI" },
  { dep: "antd", name: "Ant Design" },
  { dep: "@shadcn/ui", name: "shadcn/ui" },
  { dep: "@radix-ui", name: "shadcn/ui" },
  { dep: "@mantine/core", name: "Mantine" },
  { dep: "@chakra-ui/react", name: "Chakra UI" },
  { dep: "@nextui-org/react", name: "NextUI" },
  { dep: "@fluentui/react", name: "Fluent UI" },
  { dep: "@blueprintjs/core", name: "Blueprint" },
];

const ANGULAR_UI_LIBRARIES: Array<{ dep: string; name: string }> = [
  { dep: "@angular/material", name: "Angular Material" },
  { dep: "@ng-bootstrap/ng-bootstrap", name: "ng-bootstrap" },
  { dep: "primeng", name: "PrimeNG" },
];

const REACT_STATE_MANAGERS: Array<{ dep: string; name: string }> = [
  { dep: "@reduxjs/toolkit", name: "Redux Toolkit" },
  { dep: "redux", name: "Redux" },
  { dep: "zustand", name: "Zustand" },
  { dep: "jotai", name: "Jotai" },
  { dep: "@tanstack/react-query", name: "TanStack Query" },
];

const ANGULAR_STATE_MANAGERS: Array<{ dep: string; name: string }> = [
  { dep: "@ngrx/store", name: "NgRx" },
  { dep: "@ngxs/store", name: "NGXS" },
  { dep: "@angular/fire", name: "AngularFire" },
];

function pickFirst(deps: Record<string, unknown>, table: Array<{ dep: string; name: string }>): string | null {
  for (const { dep, name } of table) {
    if (deps[dep]) return name;
  }
  return null;
}

// UI framework dep keys used to decide if a package.json "looks like a frontend"
const UI_FRAMEWORK_KEYS = ["react", "vue", "svelte", "@angular/core", "solid-js", "@builder.io/qwik", "astro"] as const;

function hasFrontendDep(deps: Record<string, unknown>): boolean {
  return UI_FRAMEWORK_KEYS.some((k) => !!deps[k]);
}

/** Search monorepo sub-packages and common root subdirs for a frontend package.json. */
async function resolveMonorepoFrontendPkg(rootPath: string): Promise<Record<string, unknown> | null> {
  const subDirs = await findSubPackages(rootPath);
  for (const subDir of subDirs) {
    const subPkg = await readJson(subDir, "package.json");
    if (subPkg && hasFrontendDep(pkgDeps(subPkg))) return subPkg;
  }
  // Also check client/web/ui subdirs at root (simple React/Vue/Svelte check)
  for (const dir of ["client", "web", "ui"]) {
    const subPkg = await readJson(rootPath, `${dir}/package.json`);
    if (subPkg) {
      const deps = pkgDeps(subPkg);
      if (deps.react || deps.vue || deps.svelte) return subPkg;
    }
  }
  return null;
}

async function resolveFrontendPkg(rootPath: string, project?: DetectedProject): Promise<Record<string, unknown> | null> {
  // 1. Dedicated frontend/ dir
  const frontendDirPkg = await readJson(rootPath, "frontend/package.json");
  if (frontendDirPkg) return frontendDirPkg;

  // 2. Monorepo subdir packages
  if (project?.monorepo) {
    const monorepoResult = await resolveMonorepoFrontendPkg(rootPath);
    if (monorepoResult) return monorepoResult;
  }

  // 3. Root package.json with UI framework deps
  const rootPkg = await readJson(rootPath, "package.json");
  if (rootPkg && hasFrontendDep(pkgDeps(rootPkg))) return rootPkg;

  return null;
}

async function detectFrontend(rootPath: string, project?: DetectedProject): Promise<FrontendInfo | null> {
  const pkg = await resolveFrontendPkg(rootPath, project);
  if (!pkg) return detectNonNpmFrontend(rootPath);
  return detectNpmFrontend(pkg);
}

// Each row: the dep key that identifies the framework, and a builder that reads deps
// and produces the FrontendInfo. Order = detection precedence.
type NpmFrontendRow = {
  key: string;
  build: (deps: Record<string, unknown>, hasTS: boolean) => FrontendInfo;
};

const NPM_FRONTEND_ROWS: NpmFrontendRow[] = [
  {
    key: "vue",
    build: (deps, hasTS) => {
      const isVue3 = typeof deps.vue === "string" && /^[~^]?3/.test(deps.vue as string);
      const hasNuxt = !!deps.nuxt;
      return {
        framework: hasNuxt ? "nuxt3" : "vue3",
        componentPattern: isVue3 || hasNuxt ? "script-setup" : "options-api",
        uiLibrary: pickFirst(deps, VUE_UI_LIBRARIES),
        stateManagement: deps.pinia ? "Pinia" : deps.vuex ? "Vuex" : null,
        usesI18n: !!deps["vue-i18n"],
        i18nLibrary: deps["vue-i18n"] ? "vue-i18n" : null,
        usesTypeScript: hasTS,
        roleAwareUI: false,
      };
    },
  },
  {
    key: "react",
    build: (deps, hasTS) => {
      const REACT_VARIANTS: Array<{ dep: string; fw: FrontendFramework }> = [
        { dep: "react-native", fw: "react-native" },
        { dep: "next", fw: "nextjs" },
        { dep: "gatsby", fw: "gatsby" },
        { dep: "@remix-run/react", fw: "remix-spa" },
      ];
      const fw = REACT_VARIANTS.find((v) => !!deps[v.dep])?.fw ?? "react";
      return {
        framework: fw,
        componentPattern: "functional",
        uiLibrary: pickFirst(deps, REACT_UI_LIBRARIES),
        stateManagement: pickFirst(deps, REACT_STATE_MANAGERS),
        usesI18n: !!(deps["react-i18next"] || deps["next-intl"]),
        i18nLibrary: deps["next-intl"] ? "next-intl" : deps["react-i18next"] ? "react-i18next" : null,
        usesTypeScript: hasTS,
        roleAwareUI: false,
      };
    },
  },
  {
    key: "@angular/core",
    build: (deps, _hasTS) => ({
      framework: "angular",
      componentPattern: "class-component",
      uiLibrary: pickFirst(deps, ANGULAR_UI_LIBRARIES),
      stateManagement: pickFirst(deps, ANGULAR_STATE_MANAGERS),
      usesI18n: !!(deps["@angular/localize"] || deps["@ngx-translate/core"]),
      i18nLibrary: deps["@ngx-translate/core"] ? "ngx-translate" : deps["@angular/localize"] ? "@angular/localize" : null,
      usesTypeScript: true,
      roleAwareUI: false,
    }),
  },
  {
    key: "svelte",
    build: (deps, hasTS) => ({
      framework: deps["@sveltejs/kit"] ? "sveltekit" : "svelte",
      componentPattern: "script-setup",
      uiLibrary: deps["@skeletonlabs/skeleton"] ? "Skeleton" : deps["flowbite-svelte"] ? "Flowbite Svelte" : null,
      stateManagement: deps["svelte/store"] ? "Svelte stores" : null,
      usesI18n: !!(deps["svelte-i18n"] || deps["@inlang/paraglide-js"]),
      i18nLibrary: deps["svelte-i18n"] ? "svelte-i18n" : deps["@inlang/paraglide-js"] ? "Paraglide" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    }),
  },
  {
    key: "solid-js",
    build: (deps, hasTS) => ({
      framework: "solidjs",
      componentPattern: "functional",
      uiLibrary: deps["@kobalte/core"] ? "Kobalte" : deps["@solidjs-material/core"] ? "Solid Material" : null,
      stateManagement: null, // Solid has built-in signals
      usesI18n: !!deps["@solid-primitives/i18n"],
      i18nLibrary: deps["@solid-primitives/i18n"] ? "@solid-primitives/i18n" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    }),
  },
  {
    key: "@builder.io/qwik",
    build: (deps, hasTS) => ({
      framework: "qwik",
      componentPattern: "functional",
      uiLibrary: deps["@qwik-ui/core"] ? "Qwik UI" : null,
      stateManagement: null,
      usesI18n: !!deps["@builder.io/qwik-speak"],
      i18nLibrary: deps["@builder.io/qwik-speak"] ? "qwik-speak" : null,
      usesTypeScript: hasTS,
      roleAwareUI: false,
    }),
  },
  {
    key: "astro",
    build: (deps, hasTS) => {
      let uiLibrary: string | null;
      if (deps["@astrojs/react"]) {
        uiLibrary = "React (Astro island)";
      } else if (deps["@astrojs/vue"]) {
        uiLibrary = "Vue (Astro island)";
      } else if (deps["@astrojs/svelte"]) {
        uiLibrary = "Svelte (Astro island)";
      } else {
        uiLibrary = null;
      }
      return {
        framework: "astro",
        componentPattern: "functional",
        uiLibrary,
        stateManagement: null,
        usesI18n: !!deps["@astrojs/i18n"],
        i18nLibrary: deps["@astrojs/i18n"] ? "@astrojs/i18n" : null,
        usesTypeScript: hasTS,
        roleAwareUI: false,
      };
    },
  },
];

const BUNDLER_DEPS = ["vite", "webpack", "esbuild", "turbo", "snowpack"] as const;

function detectNpmFrontend(pkg: Record<string, unknown>): FrontendInfo | null {
  const deps = pkgDeps(pkg);
  const hasTS = !!deps.typescript;

  for (const row of NPM_FRONTEND_ROWS) {
    if (deps[row.key]) return row.build(deps, hasTS);
  }

  // Generic SPA (has Vite/webpack/esbuild but no known framework)
  if (BUNDLER_DEPS.some((d) => !!deps[d])) {
    return { framework: "generic-spa", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: hasTS, roleAwareUI: false };
  }

  return null;
}

async function detectNonNpmFrontend(rootPath: string): Promise<FrontendInfo | null> {
  // Blazor WASM
  if (await grepFirst(rootPath, "**/*.csproj", "Blazor") || await grepFirst(rootPath, "**/*.razor", "")) {
    return { framework: "blazor-wasm", componentPattern: "class-component", uiLibrary: "Blazor components", stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false };
  }

  // HTMX
  if (await grepFirst(rootPath, "**/*.html", "htmx|hx-get|hx-post")) {
    return { framework: "htmx", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false };
  }

  // Alpine.js
  if (await grepFirst(rootPath, "**/*.html", "x-data|alpinejs|@click")) {
    return { framework: "alpine", componentPattern: "unknown", uiLibrary: null, stateManagement: null, usesI18n: false, i18nLibrary: null, usesTypeScript: false, roleAwareUI: false };
  }

  // Flutter
  if (await fileExists(rootPath, "pubspec.yaml")) {
    const pubspec = await readFileSafe(rootPath, "pubspec.yaml") ?? "";
    if (pubspec.includes("flutter")) {
      const FLUTTER_STATE: Array<{ marker: string; name: string }> = [
        { marker: "provider", name: "Provider" },
        { marker: "riverpod", name: "Riverpod" },
        { marker: "bloc", name: "BLoC" },
      ];
      const stateManagement = FLUTTER_STATE.find((s) => pubspec.includes(s.marker))?.name ?? null;
      const usesI18n = pubspec.includes("flutter_localizations");
      return { framework: "flutter", componentPattern: "class-component", uiLibrary: "Material Design (Flutter)", stateManagement, usesI18n, i18nLibrary: usesI18n ? "flutter_localizations" : null, usesTypeScript: false, roleAwareUI: false };
    }
  }

  // SwiftUI
  if (await fileExists(rootPath, "**/*.swift")) {
    const swiftFile = await readFirstFile(rootPath, "**/*.swift") ?? "";
    if (swiftFile.includes("SwiftUI") || swiftFile.includes("@main")) {
      const SWIFT_STATE = [{ marker: "@StateObject", name: "@StateObject" }, { marker: "@Observable", name: "@Observable" }];
      const stateManagement = SWIFT_STATE.find((s) => swiftFile.includes(s.marker))?.name ?? null;
      const usesI18n = swiftFile.includes("LocalizedStringKey");
      return { framework: "swiftui", componentPattern: "functional", uiLibrary: "SwiftUI", stateManagement, usesI18n, i18nLibrary: usesI18n ? "SwiftUI Localization" : null, usesTypeScript: false, roleAwareUI: false };
    }
  }

  return null;
}

// ============================================================
// Testing detection
// ============================================================

const JS_TEST_FRAMEWORKS: Array<{ dep: string; framework: string; command: string }> = [
  { dep: "vitest", framework: "vitest", command: "npx vitest run" },
  { dep: "jest", framework: "jest", command: "npx jest" },
  { dep: "mocha", framework: "mocha", command: "npx mocha" },
  { dep: "@playwright/test", framework: "playwright", command: "npx playwright test" },
  { dep: "cypress", framework: "cypress", command: "npx cypress run" },
];

// Backend test probes: each is a simple async check + the framework+command to use
type BackendTestProbe = { test: (rootPath: string) => Promise<boolean>; framework: string; commandFn: () => string };

const BACKEND_TEST_PROBES: BackendTestProbe[] = [
  { test: (r) => grepFirst(r, "Gemfile", "rspec").then(Boolean), framework: "RSpec", commandFn: () => "bundle exec rspec" },
  { test: (r) => grepFirst(r, "**/pom.xml", "junit").then(Boolean), framework: "JUnit", commandFn: () => "mvn test" },
  { test: (r) => fileExists(r, "**/*_test.go"), framework: "go test", commandFn: () => "go test ./..." },
  { test: (r) => grepFirst(r, "Cargo.toml", "\\[dev-dependencies\\]").then(Boolean), framework: "cargo test", commandFn: () => "cargo test" },
  { test: (r) => grepFirst(r, "composer.json", "phpunit").then(Boolean), framework: "PHPUnit", commandFn: () => process.platform === "win32" ? String.raw`vendor\bin\phpunit.bat` : "vendor/bin/phpunit" },
  { test: (r) => grepFirst(r, "**/*.csproj", "xunit|nunit|MSTest").then(Boolean), framework: "xUnit/NUnit", commandFn: () => "dotnet test" },
];

async function detectTesting(rootPath: string): Promise<TestingInfo> {
  const result: TestingInfo = { backend: null, frontend: null };

  // Python testing
  result.backend = await detectPythonTesting(rootPath);

  // JS/TS testing — collect all package.jsons (root + monorepo subdirs + named dirs)
  const allPkgs = await collectAllPackageJsons(rootPath, ["client", "web", "frontend"]);

  // Pick first matching test framework across all packages
  for (const aPkg of allPkgs) {
    const deps = pkgDeps(aPkg);
    const found = JS_TEST_FRAMEWORKS.find(({ dep }) => !!deps[dep]);
    if (found) { result.frontend = { framework: found.framework, command: found.command }; break; }
  }

  // Other backend test frameworks (Ruby, Java, Go, Rust, PHP, .NET)
  for (const probe of BACKEND_TEST_PROBES) {
    if (!result.backend && await probe.test(rootPath)) {
      result.backend = { framework: probe.framework, command: probe.commandFn() };
    }
  }

  return result;
}

async function detectPythonTesting(rootPath: string): Promise<TestingInfo["backend"]> {
  if (await fileExists(rootPath, "**/pytest.ini") || await fileExists(rootPath, "**/pyproject.toml")) {
    const pyproject = await readFileSafe(rootPath, "pyproject.toml") ?? "";
    if (pyproject.includes("[tool.pytest") || pyproject.includes("pytest")) {
      return { framework: "pytest", command: pyproject.includes("integration") ? "pytest -m 'not integration'" : "pytest" };
    }
  }
  if (await fileExists(rootPath, "**/conftest.py")) return { framework: "pytest", command: "pytest" };
  if (await grepFirst(rootPath, "**/test_*.py", "unittest")) return { framework: "unittest", command: "python -m unittest" };
  return null;
}

// ============================================================
// Linting detection
// ============================================================

const JS_LINTERS: Array<{ deps: string[]; tool: string; command: string }> = [
  { deps: ["eslint", "@eslint/config"], tool: "eslint", command: "npx eslint src --ext .ts,.vue" },
  { deps: ["biome", "@biomejs/biome"], tool: "biome", command: "npx biome check ." },
];

// Backend lint probes
type BackendLintProbe = { test: (rootPath: string) => Promise<boolean>; tool: string; commandFn: () => string };

const BACKEND_LINT_PROBES: BackendLintProbe[] = [
  { test: (r) => grepFirst(r, "Cargo.toml", "clippy").then(Boolean), tool: "clippy", commandFn: () => "cargo clippy" },
  {
    test: async (r) => (await fileExists(r, "**/golangci.yml")) || (await fileExists(r, "**/.golangci.yml")),
    tool: "golangci-lint", commandFn: () => "golangci-lint run",
  },
  {
    test: (r) => grepFirst(r, "composer.json", "phpstan|pint|php-cs-fixer").then(Boolean),
    tool: "phpstan/pint", commandFn: () => process.platform === "win32" ? String.raw`vendor\bin\phpstan analyse` : "vendor/bin/phpstan analyse",
  },
];

async function detectLinting(rootPath: string): Promise<LintingInfo> {
  const result: LintingInfo = { backend: null, frontend: null };

  // Python — ordered by priority
  result.backend = await detectPythonLinting(rootPath);

  // JS/TS — collect all package.jsons
  const lintPkgs = await collectAllPackageJsons(rootPath, ["client", "web", "frontend"]);

  for (const lp of lintPkgs) {
    const deps = pkgDeps(lp);
    const found = JS_LINTERS.find(({ deps: ds }) => ds.some((d) => !!deps[d]));
    if (found) { result.frontend = { tool: found.tool, command: found.command }; break; }
  }

  // Other backend linters (Rust, Go, PHP)
  for (const probe of BACKEND_LINT_PROBES) {
    if (!result.backend && await probe.test(rootPath)) {
      result.backend = { tool: probe.tool, command: probe.commandFn() };
    }
  }

  return result;
}

async function detectPythonLinting(rootPath: string): Promise<LintingInfo["backend"]> {
  const pyproject = await readFileSafe(rootPath, "pyproject.toml") ?? "";
  if (pyproject.includes("[tool.ruff")) return { tool: "ruff", command: "ruff check ." };
  if (await fileExists(rootPath, ".flake8")) return { tool: "flake8", command: "flake8 ." };
  if (pyproject.includes("[tool.pylint")) return { tool: "pylint", command: "pylint ." };
  return null;
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

// ============================================================
// Database detection — per-language helpers
// ============================================================

const PYTHON_DB_MARKERS: Array<{ markers: string[]; engine: DatabaseInfo["engine"] }> = [
  { markers: ["sqlite"], engine: "sqlite" },
  { markers: ["postgresql", "postgres"], engine: "postgresql" },
  { markers: ["mysql"], engine: "mysql" },
  { markers: ["mssql", "sql_server"], engine: "mssql" },
  { markers: ["mongodb", "mongo"], engine: "mongodb" },
];

const RUBY_DB_MARKERS: Array<{ marker: string; engine: DatabaseInfo["engine"] }> = [
  { marker: "postgresql", engine: "postgresql" },
  { marker: "mysql", engine: "mysql" },
  { marker: "sqlite", engine: "sqlite" },
];

const GO_DB_MARKERS: Array<{ markers: string[]; engine: DatabaseInfo["engine"] }> = [
  { markers: ["pgx", "lib/pq"], engine: "postgresql" },
  { markers: ["go-sqlite3", "sqlite"], engine: "sqlite" },
  { markers: ["clickhouse-go"], engine: "clickhouse" },
  { markers: ["go-mysql", "mysql-driver"], engine: "mysql" },
  { markers: ["mongo-driver", "mongo"], engine: "mongodb" },
];

const TS_DB_ENTRIES: Array<{
  deps: string[];
  engine: DatabaseInfo["engine"];
  orm: (deps: Record<string, unknown>) => string | null;
}> = [
  { deps: ["postgres", "pg", "pgx"], engine: "postgresql", orm: (d) => { if (d.drizzle) { return "Drizzle"; } if (d.prisma) { return "Prisma"; } return null; } },
  { deps: ["mysql", "mysql2"], engine: "mysql", orm: (d) => { if (d.drizzle) { return "Drizzle"; } if (d.prisma) { return "Prisma"; } return null; } },
  { deps: ["better-sqlite3", "sqlite3"], engine: "sqlite", orm: () => null },
  { deps: ["mongoose", "mongodb"], engine: "mongodb", orm: () => "Mongoose" },
];

async function detectDatabaseForPython(rootPath: string, backend: BackendInfo): Promise<DatabaseInfo | null> {
  const settings = await readFileSafe(rootPath, "**/settings.py") ?? await readFileSafe(rootPath, "**/config.py") ?? "";
  for (const { markers, engine } of PYTHON_DB_MARKERS) {
    if (markers.some((m) => settings.includes(m))) return { engine, orm: backend.orm };
  }
  return null;
}

async function detectDatabaseForRuby(rootPath: string): Promise<DatabaseInfo | null> {
  const dbYml = await readFileSafe(rootPath, "config/database.yml") ?? "";
  for (const { marker, engine } of RUBY_DB_MARKERS) {
    if (dbYml.includes(marker)) return { engine, orm: "ActiveRecord" };
  }
  return null;
}

async function detectDatabaseForGo(rootPath: string, backend: BackendInfo): Promise<DatabaseInfo | null> {
  const goMods = await findSubPackageGoMods(rootPath);
  const joined = goMods.join("\n");
  const hasSqlc = await fileExists(rootPath, "sqlc.yaml") || await fileExists(rootPath, "sqlc.yml") || await fileExists(rootPath, "sqlc.json");
  const orm = backend.orm ?? goORM(joined) ?? (hasSqlc ? "sqlc" : null);
  for (const { markers, engine } of GO_DB_MARKERS) {
    if (markers.some((m) => joined.includes(m))) return { engine, orm };
  }
  if (orm) return { engine: "unknown", orm };
  return null;
}

async function detectDatabaseForTypeScript(rootPath: string): Promise<DatabaseInfo | null> {
  const allPkgs = await findAllPackageJsons(rootPath);
  for (const pkg of allPkgs) {
    const deps = pkgDeps(pkg);
    for (const entry of TS_DB_ENTRIES) {
      if (entry.deps.some((d) => !!deps[d])) return { engine: entry.engine, orm: entry.orm(deps) };
    }
  }
  return null;
}

type DbLanguageProbe = {
  languages: string[];
  detect: (rootPath: string, backend: BackendInfo) => Promise<DatabaseInfo | null>;
};

const DB_LANGUAGE_PROBES: DbLanguageProbe[] = [
  { languages: ["python"], detect: detectDatabaseForPython },
  { languages: ["ruby"], detect: (_r, _b) => detectDatabaseForRuby(_r) },
  { languages: ["go"], detect: detectDatabaseForGo },
  { languages: ["typescript", "javascript"], detect: (r, _b) => detectDatabaseForTypeScript(r) },
  {
    languages: ["java", "kotlin"],
    detect: async (_r, b) => {
      if (b.orm?.includes("JPA") || b.orm?.includes("Hibernate")) return { engine: "postgresql", orm: b.orm };
      return null;
    },
  },
];

async function detectDatabase(rootPath: string, backend: BackendInfo | null): Promise<DatabaseInfo | null> {
  if (!backend) return null;
  for (const probe of DB_LANGUAGE_PROBES) {
    if (probe.languages.includes(backend.language)) return probe.detect(rootPath, backend);
  }
  return null;
}

// ============================================================
// Shared helpers
// ============================================================

async function collectAllPackageJsons(rootPath: string, extraDirs: string[]): Promise<Record<string, unknown>[]> {
  const pkgs: Record<string, unknown>[] = [];
  const rootPkg = await readJson(rootPath, "package.json");
  if (rootPkg) pkgs.push(rootPkg);
  const subDirs = await findSubPackages(rootPath);
  for (const subDir of subDirs) {
    const sp = await readJson(subDir, "package.json");
    if (sp) pkgs.push(sp);
  }
  for (const dir of extraDirs) {
    const sp = await readJson(rootPath, `${dir}/package.json`);
    if (sp) pkgs.push(sp);
  }
  return pkgs;
}

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
  const NODE_ORM_TABLE: Array<{ deps: string[]; name: string }> = [
    { deps: ["@prisma/client", "prisma"], name: "Prisma" },
    { deps: ["drizzle", "drizzle-orm"], name: "Drizzle" },
    { deps: ["typeorm"], name: "TypeORM" },
    { deps: ["mikroorm", "@mikro-orm/core"], name: "MikroORM" },
    { deps: ["knex"], name: "Knex" },
    { deps: ["mongoose"], name: "Mongoose" },
    { deps: ["sequelize"], name: "Sequelize" },
    { deps: ["better-sqlite3"], name: "better-sqlite3" },
  ];
  for (const { deps: ormDeps, name } of NODE_ORM_TABLE) {
    if (ormDeps.some((d) => !!deps[d])) return name;
  }
  return null;
}

async function detectPythonORM(rootPath: string): Promise<string | null> {
  const content = await readFileSafe(rootPath, "requirements.txt") ?? "";
  const PYTHON_ORM_TABLE: Array<{ marker: string; name: string }> = [
    { marker: "django", name: "Django ORM" },
    { marker: "sqlalchemy", name: "SQLAlchemy" },
    { marker: "tortoise-orm", name: "Tortoise ORM" },
    { marker: "pony", name: "Pony ORM" },
    { marker: "peewee", name: "Peewee" },
  ];
  for (const { marker, name } of PYTHON_ORM_TABLE) {
    if (content.includes(marker)) return name;
  }
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
