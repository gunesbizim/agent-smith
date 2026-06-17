// Declarative backend-detection registry (B10).
//
// Each row describes ONE framework: how to recognise it (the marker, matched against
// already-loaded manifest evidence) and the FACTS to attach (version, ORM, auth, role
// pattern, logging). The registry answers "what is this project?" — never "what command
// should we run?". Toolchain commands and best-practice defaults live in the stack
// synthesizer / best-practice mapper, deliberately kept out of here (the C2 separation).
//
// A single builder (buildBackendInfo) walks the matching row's extractors against the
// real evidence and returns a BackendInfo with only proven fields set (null/"unknown"
// otherwise — the B3 facts-only contract, including goORM/goAuth honesty).
import type { BackendInfo, BackendFramework } from "../shared/types.js";

type Language = BackendInfo["language"];
type RolePattern = BackendInfo["rolePattern"];
type LoggingPattern = BackendInfo["loggingPattern"];

// Evidence handed to a row's extractors. We carry every manifest a language family may
// need so extractors stay pure (no I/O): go.mod / Cargo.toml / Package.swift text, the
// merged build file for the JVM, the parsed Node deps map, and the PHP composer require.
export interface DetectionEvidence {
  /** Raw manifest text (go.mod, Cargo.toml, Package.swift, the joined JVM build file, Gemfile). */
  manifest: string;
  /** Node dependency map (deps + devDeps) when the family is Node. */
  deps: Record<string, unknown>;
  /** PHP composer "require" map when the family is PHP. */
  require: Record<string, string>;
}

// Per-row fact extractors. Anything omitted falls back to the row's static facts.
export interface Capabilities {
  /** Parse the real language version from evidence; defaults to the row's static version. */
  version?: (ev: DetectionEvidence) => string;
  /** Detect the ORM from evidence (facts-only — null when unproven). */
  orm?: (ev: DetectionEvidence) => string | null;
  /** Detect the auth method from evidence (facts-only). */
  auth?: (ev: DetectionEvidence) => string;
  /** Detect the logging pattern from evidence. */
  logging?: (ev: DetectionEvidence) => LoggingPattern;
  /** Override language (e.g. Spring Boot → kotlin when the build file uses kotlin). */
  language?: (ev: DetectionEvidence) => Language;
  /** Override framework id (e.g. spring-boot → spring-boot-kotlin, aspnet → blazor-api). */
  framework?: (ev: DetectionEvidence) => BackendFramework;
  /** Override hasServiceRepo (e.g. ASP.NET Core is service/repo layered, Blazor is not). */
  hasServiceRepo?: (ev: DetectionEvidence) => boolean;
}

export interface DetectorRow {
  /** Marker: a substring of the manifest, or a Node dependency key, that identifies the framework. */
  marker: (ev: DetectionEvidence) => boolean;
  framework: BackendFramework;
  language: Language;
  /** Static facts that are framework-characteristic (not file-derived). */
  facts: {
    languageVersion: string;
    hasHexagonalArch: boolean;
    hasServiceRepo: boolean;
    usesAPIView: boolean;
    usesFunctionViews: boolean;
    rolePattern: RolePattern;
    authMethod: string;
    loggingPattern: LoggingPattern;
    orm: string | null;
  };
  capabilities?: Capabilities;
}

// ============================================================
// Shared version parsers
// ============================================================

// Parse the real version from a go.mod's `go X.Y` directive (e.g. "go 1.22" → "1.22").
// Falls back to "" so we never report a fabricated version.
export function goModVersion(goMod: string): string {
  for (const line of goMod.split("\n")) {
    const t = line.trim();
    if (t.startsWith("go ")) return t.slice(3).trim();
  }
  return "";
}

// ============================================================
// Shared fact extractors (facts-only — B3)
// ============================================================

// Go ORM: returns a name ONLY when go.mod proves it. Drivers (pgx, lib/pq) are NOT ORMs.
export function goORM(goMod: string): string | null {
  if (goMod.includes("gorm")) return "GORM";
  if (goMod.includes("entgo.io/ent")) return "Ent";
  if (goMod.includes("sqlx")) return "sqlx";
  if (goMod.includes("sqlc")) return "sqlc";
  return null;
}

// Go auth: assert "JWT" only when a jwt dependency is present; else "unknown" (honest sentinel).
export function goAuth(goMod: string): string {
  if (goMod.includes("jwt")) return "JWT";
  if (goMod.includes("gorilla/sessions")) return "session";
  return "unknown";
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

// ============================================================
// The registry — ordered; first matching marker wins (preserving the original cascade order).
// ============================================================

export const GO_ROWS: DetectorRow[] = [
  goFrameworkRow("gin", "gin-gonic/gin"),
  goFrameworkRow("echo", "labstack/echo"),
  goFrameworkRow("fiber", "gofiber/fiber"),
  goFrameworkRow("chi", "go-chi/chi"),
  {
    marker: () => true, // generic Go fallback
    framework: "generic-server", language: "go",
    facts: baseFacts({ languageVersion: "", rolePattern: "middleware", authMethod: "none", usesFunctionViews: true }),
    capabilities: { version: (ev) => goModVersion(ev.manifest) },
  },
];

function goFrameworkRow(framework: BackendFramework, marker: string): DetectorRow {
  return {
    marker: (ev) => ev.manifest.includes(marker),
    framework, language: "go",
    facts: baseFacts({ languageVersion: "", rolePattern: "middleware", authMethod: "unknown", usesFunctionViews: true }),
    capabilities: {
      version: (ev) => goModVersion(ev.manifest),
      orm: (ev) => goORM(ev.manifest),
      auth: (ev) => goAuth(ev.manifest),
    },
  };
}

export const RUST_ROWS: DetectorRow[] = [
  {
    marker: (ev) => ev.manifest.includes("actix-web"),
    framework: "actix-web", language: "rust",
    facts: baseFacts({ languageVersion: "stable", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("diesel") ? "Diesel" : ev.manifest.includes("sqlx") ? "SQLx" : ev.manifest.includes("sea-orm") ? "SeaORM" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("axum"),
    framework: "axum", language: "rust",
    facts: baseFacts({ languageVersion: "stable", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("sqlx") ? "SQLx" : ev.manifest.includes("diesel") ? "Diesel" : ev.manifest.includes("sea-orm") ? "SeaORM" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("rocket"),
    framework: "rocket", language: "rust",
    facts: baseFacts({ languageVersion: "stable", rolePattern: "middleware", authMethod: "session", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("diesel") ? "Diesel" : null },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "rust",
    facts: baseFacts({ languageVersion: "stable", rolePattern: "none", authMethod: "none", usesFunctionViews: true }),
  },
];

export const NODE_ROWS: DetectorRow[] = [
  {
    marker: (ev) => !!ev.deps["@nestjs/core"],
    framework: "nestjs", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", hasServiceRepo: true, rolePattern: "decorators", authMethod: "JWT", loggingPattern: "structured" }),
    capabilities: { orm: (ev) => ev.deps["@prisma/client"] ? "Prisma" : ev.deps.typeorm ? "TypeORM" : ev.deps.mikroorm ? "MikroORM" : ev.deps.knex ? "Knex" : null },
  },
  {
    marker: (ev) => !!ev.deps.fastify,
    framework: "fastify", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "JWT", usesFunctionViews: true }),
    capabilities: { language: (ev) => ev.deps.typescript ? "typescript" : "javascript", orm: (ev) => nodeORM(ev.deps) },
  },
  {
    marker: (ev) => !!ev.deps.koa,
    framework: "koa", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "JWT", usesFunctionViews: true }),
    capabilities: { language: (ev) => ev.deps.typescript ? "typescript" : "javascript", orm: (ev) => nodeORM(ev.deps) },
  },
  {
    marker: (ev) => !!ev.deps.hono,
    framework: "hono", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "JWT", usesFunctionViews: true }),
    capabilities: { orm: (ev) => nodeORM(ev.deps) },
  },
  {
    marker: (ev) => !!ev.deps["@adonisjs/core"],
    framework: "adonisjs", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", hasServiceRepo: true, rolePattern: "middleware", authMethod: "session", loggingPattern: "structured", orm: "Lucid" }),
  },
  {
    marker: (ev) => !!ev.deps.express,
    framework: "express", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "JWT", usesFunctionViews: true }),
    capabilities: { language: (ev) => ev.deps.typescript ? "typescript" : "javascript", orm: (ev) => nodeORM(ev.deps) },
  },
  {
    marker: (ev) => !!ev.deps["@feathersjs/feathers"],
    framework: "feathersjs", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", hasServiceRepo: true, rolePattern: "middleware", authMethod: "JWT", usesFunctionViews: true }),
    capabilities: { orm: (ev) => nodeORM(ev.deps) },
  },
  {
    marker: (ev) => !!ev.deps.next,
    framework: "nextjs-api", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "NextAuth", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.deps.prisma ? "Prisma" : ev.deps.drizzle ? "Drizzle" : null },
  },
  {
    marker: (ev) => !!(ev.deps.nuxt || ev.deps["nuxt3"]),
    framework: "nuxt-api", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "session", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.deps.prisma ? "Prisma" : ev.deps.drizzle ? "Drizzle" : null },
  },
  {
    marker: (ev) => !!(ev.deps["@remix-run/node"] || ev.deps["@remix-run/react"]),
    framework: "remix", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "session", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.deps.prisma ? "Prisma" : null },
  },
  {
    marker: (ev) => !!ev.deps["@sveltejs/kit"],
    framework: "sveltekit-api", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "middleware", authMethod: "session", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.deps.prisma ? "Prisma" : ev.deps.drizzle ? "Drizzle" : null },
  },
  {
    marker: (ev) => !!(ev.deps["body-parser"] || ev.deps.cors || ev.deps.helmet),
    framework: "generic-server", language: "typescript",
    facts: baseFacts({ languageVersion: "5.x", rolePattern: "none", authMethod: "none", usesFunctionViews: true }),
    capabilities: { orm: (ev) => nodeORM(ev.deps) },
  },
];

export const RUBY_ROWS: DetectorRow[] = [
  {
    marker: (ev) => ev.manifest.includes("rails"),
    framework: "rails", language: "ruby",
    facts: baseFacts({ languageVersion: "3.x", rolePattern: "middleware", authMethod: "Devise", loggingPattern: "structured", usesFunctionViews: true, orm: "ActiveRecord" }),
  },
  {
    marker: (ev) => ev.manifest.includes("sinatra"),
    framework: "sinatra", language: "ruby",
    facts: baseFacts({ languageVersion: "3.x", rolePattern: "manual", authMethod: "none", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("activerecord") ? "ActiveRecord" : ev.manifest.includes("sequel") ? "Sequel" : null },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "ruby",
    facts: baseFacts({ languageVersion: "3.x", rolePattern: "none", authMethod: "none", usesFunctionViews: true }),
  },
];

export const PHP_ROWS: DetectorRow[] = [
  {
    marker: (ev) => !!ev.require["laravel/framework"],
    framework: "laravel", language: "php",
    facts: baseFacts({ languageVersion: "8.x", rolePattern: "middleware", authMethod: "Sanctum", orm: "Eloquent" }),
  },
  {
    marker: (ev) => !!(ev.require["symfony/framework-bundle"] || ev.require["symfony/http-kernel"]),
    framework: "symfony", language: "php",
    facts: baseFacts({ languageVersion: "8.x", hasServiceRepo: true, rolePattern: "middleware", authMethod: "Symfony Security", loggingPattern: "structured" }),
    capabilities: { orm: (ev) => ev.require["doctrine/orm"] ? "Doctrine" : null },
  },
  {
    marker: (ev) => !!ev.require["slim/slim"],
    framework: "slim", language: "php",
    facts: baseFacts({ languageVersion: "8.x", rolePattern: "middleware", authMethod: "none", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.require["illuminate/database"] ? "Eloquent" : ev.require["doctrine/orm"] ? "Doctrine" : null },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "php",
    facts: baseFacts({ languageVersion: "8.x", rolePattern: "none", authMethod: "none", usesFunctionViews: true }),
  },
];

export const JVM_ROWS: DetectorRow[] = [
  {
    marker: (ev) => ev.manifest.includes("spring-boot") || ev.manifest.includes("org.springframework.boot"),
    framework: "spring-boot", language: "java",
    facts: baseFacts({ languageVersion: "21", hasServiceRepo: true, rolePattern: "decorators", authMethod: "Spring Security", loggingPattern: "structured" }),
    capabilities: {
      language: (ev) => ev.manifest.includes("kotlin") ? "kotlin" : "java",
      framework: (ev) => ev.manifest.includes("kotlin") ? "spring-boot-kotlin" : "spring-boot",
      version: (ev) => ev.manifest.includes("kotlin") ? "2.x" : "21",
      // Match real JPA artifacts: "spring-boot-starter-data-jpa" does NOT contain "spring-data-jpa";
      // check the broader "data-jpa" plus direct Hibernate/JPA markers.
      orm: (ev) => ev.manifest.includes("data-jpa") || ev.manifest.includes("hibernate") || ev.manifest.includes("jakarta.persistence") || ev.manifest.includes("javax.persistence") ? "JPA/Hibernate" : ev.manifest.includes("mybatis") ? "MyBatis" : null,
    },
  },
  {
    marker: (ev) => ev.manifest.includes("quarkus"),
    framework: "quarkus", language: "java",
    facts: baseFacts({ languageVersion: "21", hasServiceRepo: true, rolePattern: "decorators", authMethod: "Quarkus Security", loggingPattern: "structured" }),
    capabilities: { orm: (ev) => ev.manifest.includes("hibernate") ? "Hibernate/Panache" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("micronaut"),
    framework: "micronaut", language: "java",
    facts: baseFacts({ languageVersion: "21", hasServiceRepo: true, rolePattern: "decorators", authMethod: "Micronaut Security", loggingPattern: "structured" }),
    capabilities: { orm: (ev) => ev.manifest.includes("jpa") ? "JPA/Hibernate" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("jakarta") || ev.manifest.includes("javax.ws.rs"),
    framework: "jakarta-ee", language: "java",
    facts: baseFacts({ languageVersion: "21", rolePattern: "decorators", authMethod: "Jakarta Security" }),
    capabilities: { orm: (ev) => ev.manifest.includes("jpa") ? "JPA" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("ktor"),
    framework: "ktor", language: "kotlin",
    facts: baseFacts({ languageVersion: "2.x", rolePattern: "middleware", authMethod: "Ktor Auth", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("exposed") ? "Exposed" : ev.manifest.includes("hibernate") ? "Hibernate" : null },
  },
  {
    marker: (ev) => ev.manifest.includes("play"),
    framework: "play-framework", language: "scala",
    facts: baseFacts({ languageVersion: "3.x", rolePattern: "middleware", authMethod: "Play Auth" }),
    capabilities: { orm: (ev) => ev.manifest.includes("slick") ? "Slick" : ev.manifest.includes("anorm") ? "Anorm" : null },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "java",
    facts: baseFacts({ languageVersion: "21", rolePattern: "none", authMethod: "none" }),
  },
];

export const DOTNET_ROWS: DetectorRow[] = [
  {
    marker: (ev) => ev.manifest.includes("Microsoft.NET.Sdk.Web") || ev.manifest.includes("Microsoft.AspNetCore"),
    framework: "aspnet-core", language: "csharp",
    facts: baseFacts({ languageVersion: ".NET 8", hasServiceRepo: true, rolePattern: "middleware", authMethod: "ASP.NET Identity", loggingPattern: "structured" }),
    capabilities: {
      framework: (ev) => ev.manifest.includes("Blazor") ? "blazor-api" : "aspnet-core",
      // Blazor app is not service/repo layered in the original literal; ASP.NET Core is.
      hasServiceRepo: (ev) => !ev.manifest.includes("Blazor"),
      orm: (ev) => ev.manifest.includes("EntityFrameworkCore") ? "Entity Framework Core" : ev.manifest.includes("Dapper") ? "Dapper" : null,
    },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "csharp",
    facts: baseFacts({ languageVersion: ".NET 8", rolePattern: "none", authMethod: "none" }),
  },
];

export const SWIFT_ROWS: DetectorRow[] = [
  {
    marker: (ev) => ev.manifest.includes("vapor"),
    framework: "vapor", language: "swift",
    facts: baseFacts({ languageVersion: "5.10", rolePattern: "middleware", authMethod: "JWT", loggingPattern: "structured", usesFunctionViews: true }),
    capabilities: { orm: (ev) => ev.manifest.includes("fluent") ? "Fluent" : null },
  },
  {
    marker: () => true,
    framework: "generic-server", language: "swift",
    facts: baseFacts({ languageVersion: "5.10", rolePattern: "none", authMethod: "none", usesFunctionViews: true }),
  },
];

// ============================================================
// Builder
// ============================================================

// Default static facts; callers override only what differs (keeps rows compact).
function baseFacts(over: Partial<DetectorRow["facts"]>): DetectorRow["facts"] {
  return {
    languageVersion: "",
    hasHexagonalArch: false,
    hasServiceRepo: false,
    usesAPIView: false,
    usesFunctionViews: false,
    rolePattern: "none",
    authMethod: "none",
    loggingPattern: "unstructured",
    orm: null,
    ...over,
  };
}

// Walk a row set, return the BackendInfo of the first matching row (facts + extractors),
// or null when no row matches (used by language families that have no generic fallback,
// e.g. monorepo Node sub-detection where "no marker" means "not a backend here").
export function detectBackendFromRegistry(rows: DetectorRow[], ev: DetectionEvidence): BackendInfo | null {
  for (const row of rows) {
    if (!row.marker(ev)) continue;
    const cap = row.capabilities;
    return {
      framework: cap?.framework ? cap.framework(ev) : row.framework,
      language: cap?.language ? cap.language(ev) : row.language,
      languageVersion: cap?.version ? cap.version(ev) : row.facts.languageVersion,
      hasHexagonalArch: row.facts.hasHexagonalArch,
      hasServiceRepo: cap?.hasServiceRepo ? cap.hasServiceRepo(ev) : row.facts.hasServiceRepo,
      usesAPIView: row.facts.usesAPIView,
      usesFunctionViews: row.facts.usesFunctionViews,
      importStyle: "absolute",
      rolePattern: row.facts.rolePattern,
      authMethod: cap?.auth ? cap.auth(ev) : row.facts.authMethod,
      loggingPattern: cap?.logging ? cap.logging(ev) : row.facts.loggingPattern,
      orm: cap?.orm ? cap.orm(ev) : row.facts.orm,
    };
  }
  return null;
}

// Convenience evidence constructors for each family.
export function manifestEvidence(manifest: string): DetectionEvidence {
  return { manifest, deps: {}, require: {} };
}
export function nodeEvidence(deps: Record<string, unknown>): DetectionEvidence {
  return { manifest: "", deps, require: {} };
}
export function phpEvidence(require: Record<string, string>): DetectionEvidence {
  return { manifest: "", deps: {}, require };
}
