// Package scanner — reads lock files, categorizes deps, confirms usage via imports
import path from "node:path";
import fs from "fs-extra";
import { readFileSafe, readJson } from "./fs-helpers.js";

// ---- Types ----

export interface PackageUsage {
  // Backend packages
  httpFramework: string | null;        // echo, gin, express, hono, fastapi, etc.
  httpFrameworkVersion: string | null;
  orm: string | null;                   // Prisma, Drizzle, GORM, SQLAlchemy, etc.
  ormVersion: string | null;
  authLibrary: string | null;           // jwt, jose, next-auth, passport, etc.
  authLibraryVersion: string | null;
  validationLibrary: string | null;     // zod, yup, class-validator, go-playground/validator
  validationLibraryVersion: string | null;
  loggingLibrary: string | null;        // pino, winston, logrus, zap, etc.
  loggingLibraryVersion: string | null;
  dbDriver: string | null;              // pg, pgx, mysql2, go-sqlite3, redis, etc.
  dbDriverVersion: string | null;
  cacheDriver: string | null;           // redis, ioredis, go-redis, etc.
  cacheDriverVersion: string | null;

  // Frontend packages
  uiLibrary: string | null;             // radix-ui, shadcn, mui, vuetify, etc.
  uiLibraryVersion: string | null;
  stateManagement: string | null;       // zustand, redux, pinia, jotai, etc.
  stateManagementVersion: string | null;
  formLibrary: string | null;           // react-hook-form, formik, vee-validate, etc.
  formLibraryVersion: string | null;
  routerLibrary: string | null;         // react-router, vue-router, tanstack-router, etc.
  routerLibraryVersion: string | null;
  renderingLibrary: string | null;      // pixi.js, three.js, d3, chart.js, etc.
  renderingLibraryVersion: string | null;

  // Testing packages
  testFramework: string | null;         // vitest, jest, pytest, go test, etc.
  testFrameworkVersion: string | null;
  e2eFramework: string | null;          // playwright, cypress, selenium
  e2eFrameworkVersion: string | null;
  mockingLibrary: string | null;        // msw, nock, testify, etc.
  mockingLibraryVersion: string | null;

  // Raw package maps (name -> version)
  allDependencies: Record<string, string>;
  allDevDependencies: Record<string, string>;
}

// Package categorization maps — name patterns → category + canonical name
type CategoryMap = Array<{ patterns: string[]; category: string; canonical: string }>;

const BACKEND_CATEGORIES: CategoryMap = [
  // ORMs
  { patterns: ["prisma", "@prisma/client"], category: "orm", canonical: "Prisma" },
  { patterns: ["drizzle-orm", "drizzle"], category: "orm", canonical: "Drizzle" },
  { patterns: ["typeorm"], category: "orm", canonical: "TypeORM" },
  { patterns: ["mikro-orm", "@mikro-orm"], category: "orm", canonical: "MikroORM" },
  { patterns: ["knex"], category: "orm", canonical: "Knex" },
  { patterns: ["sequelize"], category: "orm", canonical: "Sequelize" },
  { patterns: ["mongoose"], category: "orm", canonical: "Mongoose" },
  { patterns: ["sqlalchemy"], category: "orm", canonical: "SQLAlchemy" },
  { patterns: ["gorm.io/gorm", "gorm"], category: "orm", canonical: "GORM" },
  { patterns: ["entgo.io/ent"], category: "orm", canonical: "Ent" },
  { patterns: ["diesel"], category: "orm", canonical: "Diesel" },
  { patterns: ["sea-orm", "sea_orm"], category: "orm", canonical: "SeaORM" },
  { patterns: ["sqlc-dev"], category: "orm", canonical: "sqlc" },
  { patterns: ["doctrine/orm"], category: "orm", canonical: "Doctrine" },
  { patterns: ["eloquent", "illuminate/database"], category: "orm", canonical: "Eloquent" },
  { patterns: ["activerecord"], category: "orm", canonical: "ActiveRecord" },
  // Auth
  { patterns: ["next-auth", "@auth/core"], category: "auth", canonical: "NextAuth/Auth.js" },
  { patterns: ["passport"], category: "auth", canonical: "Passport" },
  { patterns: ["jose"], category: "auth", canonical: "jose" },
  { patterns: ["jsonwebtoken", "json-web-token"], category: "auth", canonical: "jsonwebtoken" },
  { patterns: ["golang-jwt/jwt"], category: "auth", canonical: "golang-jwt" },
  { patterns: ["lucia-auth", "lucia"], category: "auth", canonical: "Lucia" },
  { patterns: ["clerk"], category: "auth", canonical: "Clerk" },
  { patterns: ["@clerk"], category: "auth", canonical: "Clerk" },
  { patterns: ["arctic"], category: "auth", canonical: "Arctic" },
  { patterns: ["devise"], category: "auth", canonical: "Devise" },
  { patterns: ["sanctum"], category: "auth", canonical: "Sanctum" },
  { patterns: ["spring-security"], category: "auth", canonical: "Spring Security" },
  // Validation
  { patterns: ["zod"], category: "validation", canonical: "Zod" },
  { patterns: ["yup"], category: "validation", canonical: "Yup" },
  { patterns: ["class-validator"], category: "validation", canonical: "class-validator" },
  { patterns: ["joi"], category: "validation", canonical: "Joi" },
  { patterns: ["valibot"], category: "validation", canonical: "Valibot" },
  { patterns: ["go-playground/validator"], category: "validation", canonical: "go-playground/validator" },
  { patterns: ["ozzo-validation"], category: "validation", canonical: "ozzo-validation" },
  { patterns: ["marshmallow"], category: "validation", canonical: "Marshmallow" },
  { patterns: ["pydantic"], category: "validation", canonical: "Pydantic" },
  // Logging
  { patterns: ["pino"], category: "logging", canonical: "Pino" },
  { patterns: ["winston"], category: "logging", canonical: "Winston" },
  { patterns: ["bunyan"], category: "logging", canonical: "Bunyan" },
  { patterns: ["logrus", "logrus"], category: "logging", canonical: "Logrus" },
  { patterns: ["uber-go/zap", "go.uber.org/zap"], category: "logging", canonical: "Zap" },
  { patterns: ["zerolog", "rs/zerolog"], category: "logging", canonical: "Zerolog" },
  { patterns: ["slog"], category: "logging", canonical: "slog" },
  { patterns: ["monolog/monolog"], category: "logging", canonical: "Monolog" },
  // DB drivers
  { patterns: ["pgx"], category: "db-driver", canonical: "pgx" },
  { patterns: ["postgres", "pg"], category: "db-driver", canonical: "pg" },
  { patterns: ["mysql2", "mysql"], category: "db-driver", canonical: "mysql2" },
  { patterns: ["better-sqlite3"], category: "db-driver", canonical: "better-sqlite3" },
  { patterns: ["lib/pq"], category: "db-driver", canonical: "lib/pq" },
  { patterns: ["go-sqlite3"], category: "db-driver", canonical: "go-sqlite3" },
  { patterns: ["clickhouse-go"], category: "db-driver", canonical: "clickhouse-go" },
  // Cache
  { patterns: ["go-redis"], category: "cache", canonical: "go-redis" },
  { patterns: ["ioredis"], category: "cache", canonical: "ioredis" },
  { patterns: ["redis"], category: "cache", canonical: "redis" },
  { patterns: ["@keyv/redis", "keyv"], category: "cache", canonical: "Keyv" },
];

const FRONTEND_CATEGORIES: CategoryMap = [
  // UI libraries
  { patterns: ["@radix-ui"], category: "ui", canonical: "Radix UI" },
  { patterns: ["@shadcn/ui", "shadcn"], category: "ui", canonical: "shadcn/ui" },
  { patterns: ["@mui/material", "@mui"], category: "ui", canonical: "MUI" },
  { patterns: ["@mantine/core", "@mantine"], category: "ui", canonical: "Mantine" },
  { patterns: ["@chakra-ui/react", "@chakra-ui"], category: "ui", canonical: "Chakra UI" },
  { patterns: ["antd"], category: "ui", canonical: "Ant Design" },
  { patterns: ["vuetify"], category: "ui", canonical: "Vuetify" },
  { patterns: ["element-plus"], category: "ui", canonical: "Element Plus" },
  { patterns: ["@nextui-org/react"], category: "ui", canonical: "NextUI" },
  { patterns: ["@blueprintjs/core"], category: "ui", canonical: "Blueprint" },
  { patterns: ["@headlessui"], category: "ui", canonical: "Headless UI" },
  { patterns: ["tailwindcss", "tailwind"], category: "ui", canonical: "Tailwind CSS" },
  // State management
  { patterns: ["zustand"], category: "state", canonical: "Zustand" },
  { patterns: ["@reduxjs/toolkit", "redux"], category: "state", canonical: "Redux Toolkit" },
  { patterns: ["jotai"], category: "state", canonical: "Jotai" },
  { patterns: ["pinia"], category: "state", canonical: "Pinia" },
  { patterns: ["vuex"], category: "state", canonical: "Vuex" },
  { patterns: ["recoil"], category: "state", canonical: "Recoil" },
  { patterns: ["mobx"], category: "state", canonical: "MobX" },
  { patterns: ["@tanstack/react-query", "react-query"], category: "state", canonical: "TanStack Query" },
  { patterns: ["xstate"], category: "state", canonical: "XState" },
  // Form libraries
  { patterns: ["react-hook-form"], category: "form", canonical: "react-hook-form" },
  { patterns: ["formik"], category: "form", canonical: "Formik" },
  { patterns: ["vee-validate"], category: "form", canonical: "vee-validate" },
  { patterns: ["@hookform/resolvers"], category: "form", canonical: "hookform resolvers" },
  { patterns: ["@tanstack/react-form"], category: "form", canonical: "TanStack Form" },
  // Routers
  { patterns: ["react-router-dom", "react-router"], category: "router", canonical: "React Router" },
  { patterns: ["@tanstack/react-router"], category: "router", canonical: "TanStack Router" },
  { patterns: ["vue-router"], category: "router", canonical: "Vue Router" },
  { patterns: ["@angular/router"], category: "router", canonical: "Angular Router" },
  // Rendering/specialized
  { patterns: ["pixi.js", "pixi"], category: "rendering", canonical: "PixiJS" },
  { patterns: ["three", "three.js"], category: "rendering", canonical: "Three.js" },
  { patterns: ["@react-three"], category: "rendering", canonical: "React Three Fiber" },
  { patterns: ["d3"], category: "rendering", canonical: "D3.js" },
  { patterns: ["chart.js"], category: "rendering", canonical: "Chart.js" },
  { patterns: ["echarts"], category: "rendering", canonical: "ECharts" },
  { patterns: ["babylonjs", "@babylonjs"], category: "rendering", canonical: "Babylon.js" },
  { patterns: ["@tauri-apps/api", "tauri"], category: "rendering", canonical: "Tauri" },
];

const TEST_CATEGORIES: CategoryMap = [
  { patterns: ["vitest"], category: "test", canonical: "Vitest" },
  { patterns: ["jest"], category: "test", canonical: "Jest" },
  { patterns: ["mocha"], category: "test", canonical: "Mocha" },
  { patterns: ["@playwright/test", "playwright"], category: "e2e", canonical: "Playwright" },
  { patterns: ["cypress"], category: "e2e", canonical: "Cypress" },
  { patterns: ["pytest"], category: "test", canonical: "pytest" },
  { patterns: ["rspec"], category: "test", canonical: "RSpec" },
  { patterns: ["junit"], category: "test", canonical: "JUnit" },
  { patterns: ["testify"], category: "test", canonical: "Testify" },
  { patterns: ["msw"], category: "mock", canonical: "MSW" },
  { patterns: ["nock"], category: "mock", canonical: "Nock" },
  { patterns: ["mock-socket"], category: "mock", canonical: "mock-socket" },
  { patterns: ["@testing-library"], category: "test", canonical: "Testing Library" },
];

// ---- Main Scanner ----

export async function scanPackages(rootPath: string): Promise<PackageUsage> {
  const pkg: PackageUsage = createEmptyUsage();

  // Scan each package manager
  const allDeps: Record<string, string> = {};
  const allDevDeps: Record<string, string> = {};

  // npm / pnpm / yarn
  await mergeNpmDeps(rootPath, allDeps, allDevDeps);

  // Go
  await mergeGoDeps(rootPath, allDeps);

  // Python
  await mergePythonDeps(rootPath, allDeps);

  // PHP
  await mergePhpDeps(rootPath, allDeps);

  // Rust
  await mergeRustDeps(rootPath, allDeps);

  pkg.allDependencies = allDeps;
  pkg.allDevDependencies = allDevDeps;

  // Merge all for categorization
  const allPackageNames = Object.keys({ ...allDeps, ...allDevDeps });

  // Categorize
  categorizePackages(allPackageNames, allDeps, allDevDeps, pkg);

  return pkg;
}

function createEmptyUsage(): PackageUsage {
  return {
    httpFramework: null, httpFrameworkVersion: null,
    orm: null, ormVersion: null,
    authLibrary: null, authLibraryVersion: null,
    validationLibrary: null, validationLibraryVersion: null,
    loggingLibrary: null, loggingLibraryVersion: null,
    dbDriver: null, dbDriverVersion: null,
    cacheDriver: null, cacheDriverVersion: null,
    uiLibrary: null, uiLibraryVersion: null,
    stateManagement: null, stateManagementVersion: null,
    formLibrary: null, formLibraryVersion: null,
    routerLibrary: null, routerLibraryVersion: null,
    renderingLibrary: null, renderingLibraryVersion: null,
    testFramework: null, testFrameworkVersion: null,
    e2eFramework: null, e2eFrameworkVersion: null,
    mockingLibrary: null, mockingLibraryVersion: null,
    allDependencies: {},
    allDevDependencies: {},
  };
}

// ---- Lock file parsers ----

async function mergeNpmDeps(rootPath: string, deps: Record<string, string>, devDeps: Record<string, string>): Promise<void> {
  // Try root + monorepo subdirs
  const pkgPaths = [rootPath];
  for (const sub of ["apps", "packages", "client", "web", "frontend", "server", "api"]) {
    const subPath = path.join(rootPath, sub);
    try {
      if (await fs.pathExists(subPath)) {
        const stat = await fs.stat(subPath);
        if (stat.isDirectory()) {
          // If it contains package.json directly, add it
          if (await fs.pathExists(path.join(subPath, "package.json"))) {
            pkgPaths.push(subPath);
          }
          // Also recurse into subdirectories (e.g. apps/client, apps/server)
          const entries = await fs.readdir(subPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const nested = path.join(subPath, entry.name);
              if (await fs.pathExists(path.join(nested, "package.json"))) {
                pkgPaths.push(nested);
              }
            }
          }
        }
      }
    } catch {}
  }

  for (const pkgPath of pkgPaths) {
    const pkgJson = await readJson(pkgPath, "package.json");
    if (!pkgJson) continue;

    // Direct dependencies from package.json
    const prodDeps = (pkgJson.dependencies ?? {}) as Record<string, string>;
    const devDeps2 = (pkgJson.devDependencies ?? {}) as Record<string, string>;

    for (const [name, version] of Object.entries(prodDeps)) {
      if (!deps[name]) deps[name] = typeof version === "string" ? version.replace(/^[\^~]/, "") : "*";
    }
    for (const [name, version] of Object.entries(devDeps2)) {
      if (!devDeps[name]) devDeps[name] = typeof version === "string" ? version.replace(/^[\^~]/, "") : "*";
    }
  }

  // Also parse lockfile for resolved versions
  const lockContent = await readFileSafe(rootPath, "pnpm-lock.yaml");
  if (lockContent) {
    parsePnpmLock(lockContent, deps, devDeps);
  }
}

function parsePnpmLock(content: string, deps: Record<string, string>, devDeps: Record<string, string>): void {
  // Basic pnpm-lock parser — extract version from lockfile
  const lines = content.split("\n");
  let currentPkg = "";
  for (const line of lines) {
    const pkgMatch = line.match(/^  \/(\S+?)\/([^\s/]+):$/);
    if (pkgMatch) {
      currentPkg = pkgMatch[2];
      continue;
    }
    if (currentPkg && line.includes("version:")) {
      const version = line.match(/version:\s*(\S+)/)?.[1];
      if (version && deps[currentPkg]) {
        deps[currentPkg] = version;
      }
      currentPkg = "";
    }
  }
}

async function mergeGoDeps(rootPath: string, deps: Record<string, string>): Promise<void> {
  // Read go.mod from root + subdirs
  for (const sub of ["", "apps", "packages"]) {
    const baseDir = sub ? path.join(rootPath, sub) : rootPath;
    try {
      const entries = sub ? await fs.readdir(baseDir).catch(() => [] as string[]) : [];
      const dirs = sub ? entries.filter((e: string) => !e.startsWith(".")).map((e: string) => path.join(baseDir, e)) : [rootPath];
      for (const dir of dirs) {
        const goMod = await readFileSafe(dir, "go.mod");
        if (!goMod) continue;
        // Parse require blocks
        const requireBlock = goMod.match(/require\s*\(([\s\S]*?)\)/);
        const lines = requireBlock ? requireBlock[1].split("\n") : goMod.split("\n").filter((l: string) => l.startsWith("require "));
        for (const line of lines) {
          const m = line.trim().match(/^\s*(\S+)\s+(\S+)/);
          if (m && !m[1].startsWith("//")) {
            deps[m[1]] = m[2];
          }
        }
      }
    } catch {}
  }
}

async function mergePythonDeps(rootPath: string, deps: Record<string, string>): Promise<void> {
  const reqTxt = await readFileSafe(rootPath, "requirements.txt");
  if (reqTxt) {
    for (const line of reqTxt.split("\n")) {
      const m = line.trim().match(/^([^\s=<>!][^=<>!]*?)\s*[>=<~!]=\s*(\S+)/);
      if (m) deps[m[1]] = m[2];
    }
  }

  const pyproject = await readFileSafe(rootPath, "pyproject.toml");
  if (pyproject) {
    const depSection = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depSection) {
      for (const line of depSection[1].split("\n")) {
        const m = line.trim().match(/["']([^\s=<>!'"]+)\s*[>=<~!]=\s*([^\s'"]+)["']/);
        if (m) deps[m[1]] = m[2];
      }
    }
  }
}

async function mergePhpDeps(rootPath: string, deps: Record<string, string>): Promise<void> {
  const composer = await readJson(rootPath, "composer.json") as Record<string, unknown> | null;
  if (composer?.require) {
    for (const [name, version] of Object.entries(composer.require as Record<string, string>)) {
      deps[name] = typeof version === "string" ? version.replace(/^[\^~]/, "") : "*";
    }
  }
}

async function mergeRustDeps(rootPath: string, deps: Record<string, string>): Promise<void> {
  const cargo = await readFileSafe(rootPath, "Cargo.toml");
  if (cargo) {
    const idx = cargo.indexOf("[dependencies]");
    if (idx >= 0) {
      const rest = cargo.substring(idx + "[dependencies]".length);
      const endIdx = rest.indexOf("\n[");
      const section = endIdx >= 0 ? rest.substring(0, endIdx) : rest;
      for (const line of section.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^(\S+)\s*=\s*["'](\S+)["']/);
        if (m) { deps[m[1]] = m[2]; continue; }
        const im = trimmed.match(/^(\S+)\s*=\s*\{[^}]*version\s*=\s*["'](\S+)["']/);
        if (im) deps[im[1]] = im[2];
      }
    }
  }
}

// ---- Categorization ----

function categorizePackages(
  names: string[],
  deps: Record<string, string>,
  devDeps: Record<string, string>,
  pkg: PackageUsage,
): void {
  const all = { ...deps, ...devDeps };

  // Backend categories
  for (const cat of BACKEND_CATEGORIES) {
    for (const name of names) {
      if (cat.patterns.some((p) => name.includes(p))) {
        applyCategory(pkg, cat.category, cat.canonical, all[name] ?? deps[name] ?? devDeps[name] ?? "*");
        break;
      }
    }
  }

  // Frontend categories
  for (const cat of FRONTEND_CATEGORIES) {
    for (const name of names) {
      if (cat.patterns.some((p) => name.includes(p))) {
        applyFrontendCategory(pkg, cat.category, cat.canonical, all[name] ?? deps[name] ?? devDeps[name] ?? "*");
        break;
      }
    }
  }

  // Test categories
  for (const cat of TEST_CATEGORIES) {
    for (const name of names) {
      if (cat.patterns.some((p) => name.includes(p))) {
        applyTestCategory(pkg, cat.category, cat.canonical, all[name] ?? deps[name] ?? devDeps[name] ?? "*");
        break;
      }
    }
  }
}

function applyCategory(pkg: PackageUsage, category: string, name: string, version: string): void {
  switch (category) {
    case "orm": if (!pkg.orm) { pkg.orm = name; pkg.ormVersion = version; } break;
    case "auth": if (!pkg.authLibrary) { pkg.authLibrary = name; pkg.authLibraryVersion = version; } break;
    case "validation": if (!pkg.validationLibrary) { pkg.validationLibrary = name; pkg.validationLibraryVersion = version; } break;
    case "logging": if (!pkg.loggingLibrary) { pkg.loggingLibrary = name; pkg.loggingLibraryVersion = version; } break;
    case "db-driver": if (!pkg.dbDriver) { pkg.dbDriver = name; pkg.dbDriverVersion = version; } break;
    case "cache": if (!pkg.cacheDriver) { pkg.cacheDriver = name; pkg.cacheDriverVersion = version; } break;
  }
}

function applyFrontendCategory(pkg: PackageUsage, category: string, name: string, version: string): void {
  switch (category) {
    case "ui": if (!pkg.uiLibrary) { pkg.uiLibrary = name; pkg.uiLibraryVersion = version; } break;
    case "state": if (!pkg.stateManagement) { pkg.stateManagement = name; pkg.stateManagementVersion = version; } break;
    case "form": if (!pkg.formLibrary) { pkg.formLibrary = name; pkg.formLibraryVersion = version; } break;
    case "router": if (!pkg.routerLibrary) { pkg.routerLibrary = name; pkg.routerLibraryVersion = version; } break;
    case "rendering": if (!pkg.renderingLibrary) { pkg.renderingLibrary = name; pkg.renderingLibraryVersion = version; } break;
  }
}

function applyTestCategory(pkg: PackageUsage, category: string, name: string, version: string): void {
  switch (category) {
    case "test": if (!pkg.testFramework) { pkg.testFramework = name; pkg.testFrameworkVersion = version; } break;
    case "e2e": if (!pkg.e2eFramework) { pkg.e2eFramework = name; pkg.e2eFrameworkVersion = version; } break;
    case "mock": if (!pkg.mockingLibrary) { pkg.mockingLibrary = name; pkg.mockingLibraryVersion = version; } break;
  }
}

// ---- Helpers ----
// readFileSafe / readJson are shared via ./fs-helpers (B10 consolidation).
