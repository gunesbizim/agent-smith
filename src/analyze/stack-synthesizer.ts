// Stack synthesizer — turns raw StackEvidence into a StackProfile.
//
// Two paths, both best-effort, neither ever leaks a default stack:
//   1. LLM path (opt-in, requires `claude` on PATH): the evidence is fed INLINE and the
//      model classifies every language/framework GitNexus (and more) supports — no
//      per-language code. Output is merged OVER the deterministic base.
//   2. Deterministic fallback: reads the project's OWN declared manifests/scripts. Covers
//      the common ecosystems offline (so CI/tests are stable). Anything it can't determine
//      stays null → emitted as honest "none" downstream, NEVER Django.
import { isClaudeAvailable, runClaude } from "./claude-runner.js";
import { extractJsonObject } from "./llm-analyzer.js";
import { gatherStackEvidence } from "./stack-evidence.js";
import type { StackEvidence, StackProfile, StackCommands } from "./stack-types.js";

const SYNTH_TIMEOUT_MS = 90_000;
const MAX_EVIDENCE_CHARS = 18_000;

// ---- public API ---------------------------------------------------------

export interface SynthOptions {
  useLlm?: boolean;
}

/**
 * Convenience entry point: gather evidence from a project root and synthesize its StackProfile
 * in one call. This is the single analysis path shared by both `init` and `analyze`, so the
 * evidence→synthesis wiring lives in one place rather than being duplicated at each call site.
 */
export async function gatherAndSynthesizeStack(rootPath: string, opts: SynthOptions = {}): Promise<StackProfile> {
  const evidence = await gatherStackEvidence(rootPath);
  return synthesizeStackProfile(evidence, opts);
}

/**
 * Synthesize a StackProfile from gathered evidence. Always returns a usable profile.
 * The deterministic result is the base; when the LLM path runs and succeeds, its fields
 * override only where it is confident.
 */
export function synthesizeStackProfile(evidence: StackEvidence, opts: SynthOptions = {}): StackProfile {
  const base = deterministicProfile(evidence);
  if (!opts.useLlm || !isClaudeAvailable()) return base;

  const llm = runLlmSynthesis(evidence);
  if (!llm) return base;
  return mergeProfile(base, llm);
}

// ---- LLM path -----------------------------------------------------------

function buildEvidenceBlob(evidence: StackEvidence): string {
  const parts: string[] = [];
  let budget = MAX_EVIDENCE_CHARS;
  for (const f of [...evidence.manifests, ...evidence.ciFiles]) {
    if (budget <= 0) break;
    const slice = f.content.slice(0, Math.min(4_000, budget));
    budget -= slice.length;
    parts.push(`\n--- ${f.path} ---\n${slice}`);
  }
  if (evidence.gitnexus) {
    parts.push(`\n--- gitnexus signal ---\nimports: ${evidence.gitnexus.topImports.join(", ")}\nsupertypes: ${evidence.gitnexus.supertypes.join(", ")}`);
  }
  return parts.join("\n");
}

function buildSynthPrompt(evidence: StackEvidence): string {
  return [
    "Classify a software project's backend stack from the declared manifest/CI files below.",
    "Do NOT use tools — everything is in the EVIDENCE section. Derive commands from what the",
    "project ACTUALLY declares (build files, CI steps, scripts); do not assume a default stack.",
    "",
    "Respond with ONE line of minified JSON and NOTHING else (no prose, no fences). Schema:",
    '{"language":string|null,"languageVersion":string,"framework":string|null,"frameworkDetail":string,',
    '"orm":string|null,"dbEngine":string|null,"authMethod":string|null,"roleModel":string,"roleValues":string,',
    '"importStyle":"absolute|relative|mixed","loggingPattern":"structured|unstructured",',
    '"commands":{"test":string|null,"lint":string|null,"format":string|null,"typecheck":string|null,"migrate":string|null}}',
    "",
    "Rules: use null when something genuinely is not present. languageVersion must be the REAL",
    "version parsed from the manifest (e.g. java 17 from <java.version>17</java.version>), not a guess.",
    "roleValues: concrete role names ONLY if the evidence shows them; otherwise \"none\". Never emit",
    "Python/Django tooling (ruff, pytest, manage.py) unless the project is actually Python/Django.",
    "",
    "=== EVIDENCE ===",
    buildEvidenceBlob(evidence),
  ].join("\n");
}

function runLlmSynthesis(evidence: StackEvidence): Partial<StackProfile> | null {
  const out = runClaude(buildSynthPrompt(evidence), { timeoutMs: SYNTH_TIMEOUT_MS });
  if (out === null) return null;
  const parsed = extractJsonObject(out);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as Partial<StackProfile>;
}

// Field-level "prefer the LLM value when it is usable, else keep the base" helpers. Keeping
// the decision in these tiny functions keeps mergeProfile itself branch-free (low complexity).
function preferStr(v: unknown, base: string | null): string | null {
  return typeof v === "string" ? v : base;
}
function preferNonEmpty(v: unknown, base: string): string {
  return typeof v === "string" && v ? v : base;
}
function preferDefined<T>(v: T | undefined, base: T): T {
  return v !== undefined ? v : base;
}

// Merge an LLM descriptor over the deterministic base. The LLM overrides a field only when
// it provides a usable value, so we never lose a deterministic finding to an LLM omission.
// Exported for testing.
export function mergeProfile(base: StackProfile, llm: Partial<StackProfile>): StackProfile {
  return {
    ...base,
    source: "llm",
    language: preferStr(llm.language, base.language),
    languageVersion: preferNonEmpty(llm.languageVersion, base.languageVersion),
    framework: preferStr(llm.framework, base.framework),
    frameworkDetail: preferNonEmpty(llm.frameworkDetail, base.frameworkDetail),
    orm: preferDefined(llm.orm, base.orm),
    dbEngine: preferDefined(llm.dbEngine, base.dbEngine),
    authMethod: preferDefined(llm.authMethod, base.authMethod),
    roleModel: preferNonEmpty(llm.roleModel, base.roleModel),
    roleValues: preferNonEmpty(llm.roleValues, base.roleValues),
    importStyle: llm.importStyle ?? base.importStyle,
    loggingPattern: llm.loggingPattern ?? base.loggingPattern,
    commands: llm.commands ? mergeCommands(base.commands, llm.commands) : base.commands,
    confidence: typeof llm.confidence === "number" ? llm.confidence : base.confidence,
  };
}

// Exported for testing.
export function mergeCommands(base: StackCommands, llm: Partial<StackCommands>): StackCommands {
  return {
    test: llm.test ?? base.test,
    lint: llm.lint ?? base.lint,
    format: llm.format ?? base.format,
    typecheck: llm.typecheck ?? base.typecheck,
    migrate: llm.migrate ?? base.migrate,
  };
}

// ---- deterministic fallback ---------------------------------------------

function emptyProfile(): StackProfile {
  return {
    language: null, languageVersion: "", framework: null, frameworkDetail: "none",
    orm: null, dbEngine: null, authMethod: null, roleModel: "none", roleValues: "none",
    importStyle: "absolute", loggingPattern: "unstructured",
    commands: { test: null, lint: null, format: null, typecheck: null, migrate: null },
    confidence: 0, evidenceRefs: [], source: "manifest-fallback",
  };
}

// Find a manifest whose path ends with the given filename; returns its content or "".
function manifest(evidence: StackEvidence, filename: string): { path: string; content: string } | null {
  return evidence.manifests.find((m) => m.path === filename || m.path.endsWith(`/${filename}`)) ?? null;
}

// Each detector is small and focused (keeps cyclomatic complexity low for the quality gate).
type Detector = (e: StackEvidence) => StackProfile | null;

const DETECTORS: Detector[] = [javaMaven, javaGradle, nodeBackend, goBackend, rustBackend, pythonBackend];

export function deterministicProfile(evidence: StackEvidence): StackProfile {
  for (const detect of DETECTORS) {
    const found = detect(evidence);
    if (found) return found;
  }
  return emptyProfile();
}

// ---- Java / JVM ----------------------------------------------------------

function jvmStack(build: string): { framework: string; detail: string; orm: string | null; auth: string | null; logging: "structured" | "unstructured" } {
  if (build.includes("spring-boot") || build.includes("org.springframework.boot")) {
    return { framework: "spring-boot", detail: "Spring Boot", orm: jvmOrm(build), auth: build.includes("spring-security") || build.includes("spring-boot-starter-security") ? "Spring Security" : null, logging: "structured" };
  }
  if (build.includes("quarkus")) return { framework: "quarkus", detail: "Quarkus", orm: jvmOrm(build), auth: null, logging: "structured" };
  if (build.includes("micronaut")) return { framework: "micronaut", detail: "Micronaut", orm: jvmOrm(build), auth: null, logging: "structured" };
  return { framework: "generic-server", detail: "JVM service", orm: jvmOrm(build), auth: null, logging: "unstructured" };
}

// Match the real JPA artifacts: "spring-boot-starter-data-jpa" does NOT contain the substring
// "spring-data-jpa", so check the broader "data-jpa" plus direct Hibernate/JPA markers.
function jvmOrm(build: string): string | null {
  if (build.includes("data-jpa") || build.includes("hibernate") || build.includes("jakarta.persistence") || build.includes("javax.persistence")) return "JPA/Hibernate";
  if (build.includes("mybatis")) return "MyBatis";
  if (build.includes("jooq")) return "jOOQ";
  if (build.includes("exposed")) return "Exposed";
  return null;
}

function jvmDb(build: string): string | null {
  if (build.includes("postgresql") || build.includes("postgres")) return "postgresql";
  if (build.includes("mssql-jdbc") || build.includes("sqlserver")) return "mssql";
  if (build.includes("mysql") || build.includes("mariadb")) return "mysql";
  if (build.includes("h2database") || build.includes("com.h2database")) return "sqlite";
  if (build.includes("mongodb") || build.includes("mongo")) return "mongodb";
  return null;
}

function javaMaven(e: StackEvidence): StackProfile | null {
  const pom = manifest(e, "pom.xml");
  if (!pom) return null;
  const c = pom.content;
  const s = jvmStack(c);
  const cmd = (goal: string) => `mvn ${goal}`;
  return {
    ...emptyProfile(),
    language: "java", languageVersion: parseTag(c, "java.version") || parseTag(c, "maven.compiler.release") || "",
    framework: s.framework, frameworkDetail: s.detail, orm: s.orm, dbEngine: jvmDb(c),
    authMethod: s.auth, roleModel: s.auth === "Spring Security" ? "@PreAuthorize / hasRole(...) on controllers" : "none",
    roleValues: "none", loggingPattern: s.logging,
    commands: {
      test: cmd("test"),
      lint: c.includes("checkstyle") ? cmd("checkstyle:check") : c.includes("spotless") ? cmd("spotless:check") : null,
      format: c.includes("spotless") ? cmd("spotless:apply") : null,
      typecheck: null,
      migrate: c.includes("flyway") ? cmd("flyway:migrate") : c.includes("liquibase") ? cmd("liquibase:update") : null,
    },
    confidence: 0.7, evidenceRefs: [pom.path],
  };
}

function javaGradle(e: StackEvidence): StackProfile | null {
  const g = manifest(e, "build.gradle") ?? manifest(e, "build.gradle.kts");
  if (!g) return null;
  const c = g.content;
  const isKotlin = g.path.endsWith(".kts") || c.includes("kotlin(");
  const s = jvmStack(c);
  return {
    ...emptyProfile(),
    language: isKotlin ? "kotlin" : "java", languageVersion: parseGradleJavaVersion(c),
    framework: isKotlin && s.framework === "spring-boot" ? "spring-boot-kotlin" : s.framework,
    frameworkDetail: s.detail, orm: s.orm, dbEngine: jvmDb(c),
    authMethod: s.auth, roleModel: s.auth === "Spring Security" ? "@PreAuthorize / hasRole(...) on controllers" : "none",
    roleValues: "none", loggingPattern: s.logging,
    commands: {
      test: "./gradlew test",
      lint: c.includes("checkstyle") ? "./gradlew checkstyleMain" : c.includes("ktlint") ? "./gradlew ktlintCheck" : c.includes("spotless") ? "./gradlew spotlessCheck" : null,
      format: c.includes("ktlint") ? "./gradlew ktlintFormat" : c.includes("spotless") ? "./gradlew spotlessApply" : null,
      typecheck: null,
      migrate: c.includes("flyway") ? "./gradlew flywayMigrate" : c.includes("liquibase") ? "./gradlew update" : null,
    },
    confidence: 0.7, evidenceRefs: [g.path],
  };
}

// ---- Node / TS -----------------------------------------------------------

function nodeBackend(e: StackEvidence): StackProfile | null {
  const pkg = manifest(e, "package.json");
  if (!pkg) return null;
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(pkg.content) as Record<string, unknown>; } catch { return null; }
  const deps = { ...(json.dependencies as object), ...(json.devDependencies as object) } as Record<string, string>;
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
  const isBackend = has("express") || has("@nestjs/core") || has("fastify") || has("koa") || has("hono");
  if (!isBackend) return null;
  const scripts = (json.scripts ?? {}) as Record<string, string>;
  const scriptCmd = (name: string) => (scripts[name] ? `npm run ${name}` : null);
  const framework = has("@nestjs/core") ? "nestjs" : has("fastify") ? "fastify" : has("koa") ? "koa" : has("hono") ? "hono" : "express";
  return {
    ...emptyProfile(),
    language: deps.typescript || has("typescript") ? "typescript" : "javascript", languageVersion: "",
    framework, frameworkDetail: framework === "nestjs" ? "NestJS + TypeScript" : `${framework} + TypeScript`,
    orm: nodeOrm(has), dbEngine: nodeDb(has),
    authMethod: has("passport") ? "Passport" : has("@nestjs/jwt") || has("jsonwebtoken") ? "JWT" : null,
    roleModel: "none", roleValues: "none", loggingPattern: has("pino") || has("winston") ? "structured" : "unstructured",
    commands: {
      test: scriptCmd("test") ?? (has("vitest") ? "npx vitest run" : has("jest") ? "npx jest" : null),
      lint: scriptCmd("lint") ?? (has("eslint") ? "npx eslint ." : null),
      format: scriptCmd("format") ?? (has("prettier") ? "npx prettier --check ." : null),
      typecheck: scriptCmd("typecheck") ?? (has("typescript") ? "npx tsc --noEmit" : null),
      migrate: has("prisma") ? "npx prisma migrate deploy" : has("typeorm") ? "npx typeorm migration:run" : has("drizzle-orm") ? "npx drizzle-kit migrate" : null,
    },
    confidence: 0.65, evidenceRefs: [pkg.path],
  };
}

function nodeOrm(has: (n: string) => boolean): string | null {
  if (has("prisma") || has("@prisma/client")) return "Prisma";
  if (has("typeorm")) return "TypeORM";
  if (has("drizzle-orm")) return "Drizzle";
  if (has("sequelize")) return "Sequelize";
  if (has("mongoose")) return "Mongoose";
  return null;
}

function nodeDb(has: (n: string) => boolean): string | null {
  if (has("pg") || has("postgres")) return "postgresql";
  if (has("mysql2") || has("mysql")) return "mysql";
  if (has("better-sqlite3") || has("sqlite3")) return "sqlite";
  if (has("mongoose") || has("mongodb")) return "mongodb";
  return null;
}

// ---- Go ------------------------------------------------------------------

function goBackend(e: StackEvidence): StackProfile | null {
  const mod = manifest(e, "go.mod");
  if (!mod) return null;
  const c = mod.content;
  const framework = c.includes("gin-gonic/gin") ? "gin" : c.includes("labstack/echo") ? "echo" : c.includes("gofiber/fiber") ? "fiber" : c.includes("go-chi/chi") ? "chi" : "generic-server";
  return {
    ...emptyProfile(),
    language: "go", languageVersion: parseGoVersion(c),
    framework, frameworkDetail: framework === "generic-server" ? "Go service" : `${framework} (Go)`,
    orm: c.includes("gorm.io/gorm") ? "GORM" : c.includes("jmoiron/sqlx") ? "sqlx" : c.includes("entgo.io/ent") ? "Ent" : null,
    dbEngine: c.includes("jackc/pgx") || c.includes("lib/pq") ? "postgresql" : c.includes("go-sql-driver/mysql") ? "mysql" : c.includes("mattn/go-sqlite3") ? "sqlite" : null,
    authMethod: c.includes("golang-jwt") || c.includes("jwt") ? "JWT" : null,
    roleModel: "none", roleValues: "none",
    loggingPattern: c.includes("uber-go/zap") || c.includes("rs/zerolog") || c.includes("sirupsen/logrus") ? "structured" : "unstructured",
    commands: { test: "go test ./...", lint: "golangci-lint run", format: "gofmt -l .", typecheck: "go vet ./...", migrate: null },
    confidence: 0.7, evidenceRefs: [mod.path],
  };
}

// ---- Rust ----------------------------------------------------------------

function rustBackend(e: StackEvidence): StackProfile | null {
  const cargo = manifest(e, "Cargo.toml");
  if (!cargo) return null;
  const c = cargo.content;
  const framework = c.includes("actix-web") ? "actix-web" : c.includes("axum") ? "axum" : c.includes("rocket") ? "rocket" : "generic-server";
  if (framework === "generic-server" && !c.includes("tokio")) return null;
  return {
    ...emptyProfile(),
    language: "rust", languageVersion: parseTomlValue(c, "edition"),
    framework, frameworkDetail: framework === "generic-server" ? "Rust service" : `${framework} (Rust)`,
    orm: c.includes("diesel") ? "Diesel" : c.includes("sqlx") ? "sqlx" : c.includes("sea-orm") ? "SeaORM" : null,
    dbEngine: c.includes("postgres") ? "postgresql" : c.includes("mysql") ? "mysql" : c.includes("sqlite") ? "sqlite" : null,
    authMethod: c.includes("jsonwebtoken") ? "JWT" : null, roleModel: "none", roleValues: "none", loggingPattern: "structured",
    commands: { test: "cargo test", lint: "cargo clippy -- -D warnings", format: "cargo fmt --check", typecheck: "cargo check", migrate: c.includes("diesel") ? "diesel migration run" : c.includes("sqlx") ? "sqlx migrate run" : null },
    confidence: 0.7, evidenceRefs: [cargo.path],
  };
}

// ---- Python --------------------------------------------------------------

function pythonBackend(e: StackEvidence): StackProfile | null {
  const py = manifest(e, "pyproject.toml") ?? manifest(e, "requirements.txt");
  if (!py) return null;
  const c = py.content.toLowerCase();
  const framework = c.includes("django") ? "django" : c.includes("fastapi") ? "fastapi" : c.includes("flask") ? "flask" : null;
  if (!framework) return null;
  const isDjango = framework === "django";
  return {
    ...emptyProfile(),
    language: "python", languageVersion: "",
    framework, frameworkDetail: isDjango ? "Django + Django REST Framework" : framework === "fastapi" ? "FastAPI + Pydantic" : "Flask",
    orm: isDjango ? "Django ORM" : c.includes("sqlalchemy") ? "SQLAlchemy" : null,
    dbEngine: c.includes("psycopg") ? "postgresql" : c.includes("mysqlclient") ? "mysql" : "postgresql",
    authMethod: c.includes("djangorestframework-simplejwt") || c.includes("jwt") ? "JWT" : "session",
    roleModel: isDjango ? "DRF permission classes / role checks" : "none", roleValues: "none",
    loggingPattern: "unstructured",
    commands: {
      test: c.includes("pytest") ? "pytest" : "python -m unittest",
      lint: c.includes("ruff") ? "ruff check ." : c.includes("flake8") ? "flake8 ." : null,
      format: c.includes("ruff") ? "ruff format --check ." : c.includes("black") ? "black --check ." : null,
      typecheck: c.includes("mypy") ? "mypy ." : null,
      migrate: isDjango ? "python manage.py makemigrations && python manage.py migrate" : c.includes("alembic") ? "alembic upgrade head" : null,
    },
    confidence: 0.7, evidenceRefs: [py.path],
  };
}

// ---- small parsers (no regex-heavy logic; keep CC low) -------------------

// Pull <tag>value</tag> from an XML-ish manifest (first occurrence).
function parseTag(xml: string, tag: string): string {
  const open = `<${tag}>`;
  const i = xml.indexOf(open);
  if (i === -1) return "";
  const j = xml.indexOf("</", i + open.length);
  return j === -1 ? "" : xml.slice(i + open.length, j).trim();
}

// `go 1.22` directive → "1.22".
function parseGoVersion(goMod: string): string {
  for (const line of goMod.split("\n")) {
    const t = line.trim();
    if (t.startsWith("go ")) return t.slice(3).trim();
  }
  return "";
}

// Gradle: `sourceCompatibility = '17'` or `JavaLanguageVersion.of(17)`.
function parseGradleJavaVersion(gradle: string): string {
  const ofIdx = gradle.indexOf("JavaLanguageVersion.of(");
  if (ofIdx !== -1) {
    const start = ofIdx + "JavaLanguageVersion.of(".length;
    const end = gradle.indexOf(")", start);
    if (end !== -1) return gradle.slice(start, end).trim();
  }
  const sc = "sourceCompatibility";
  const i = gradle.indexOf(sc);
  if (i !== -1) {
    const line = gradle.slice(i, gradle.indexOf("\n", i) === -1 ? undefined : gradle.indexOf("\n", i));
    const digits = line.replace(/[^0-9]/g, "");
    if (digits) return digits;
  }
  return "";
}

// TOML `key = "value"` (first occurrence).
function parseTomlValue(toml: string, key: string): string {
  for (const line of toml.split("\n")) {
    const t = line.trim();
    if (t.startsWith(`${key} `) || t.startsWith(`${key}=`)) {
      const eq = t.indexOf("=");
      if (eq !== -1) return t.slice(eq + 1).trim().replace(/['"]/g, "");
    }
  }
  return "";
}
