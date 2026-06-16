// Unit tests for the deterministic synthesizer path + LLM-merge logic. These exercise the
// per-ecosystem detectors and version parsers (no `claude` needed) and the field-level merge
// that overlays an LLM descriptor onto the deterministic base.
import { describe, it, expect, vi } from "vitest";

// Mock the headless-claude runner so the LLM path runs deterministically (no real `claude`).
vi.mock("../../analyze/claude-runner.js", () => ({
  isClaudeAvailable: () => true,
  runClaude: () =>
    '{"language":"java","framework":"spring-boot","frameworkDetail":"Spring Boot 3",' +
    '"orm":"JPA/Hibernate","dbEngine":"postgresql","commands":{"test":"mvn verify"},"confidence":0.95}',
}));

import {
  deterministicProfile,
  synthesizeStackProfile,
  mergeProfile,
  mergeCommands,
} from "../../analyze/stack-synthesizer.js";
import type { StackEvidence, EvidenceFile, StackProfile } from "../../analyze/stack-types.js";

function ev(manifests: EvidenceFile[]): StackEvidence {
  return { rootPath: "/x", manifests, ciFiles: [], gitnexus: null };
}

describe("deterministicProfile — ecosystems", () => {
  it("Maven/Spring: parses java.version, JPA, Postgres, Flyway, spotless", () => {
    const p = deterministicProfile(ev([{ path: "pom.xml", content: "<java.version>21</java.version> spring-boot spring-boot-starter-data-jpa postgresql flyway-core spotless spring-boot-starter-security" }]));
    expect(p.language).toBe("java");
    expect(p.languageVersion).toBe("21");
    expect(p.orm).toBe("JPA/Hibernate");
    expect(p.dbEngine).toBe("postgresql");
    expect(p.authMethod).toBe("Spring Security");
    expect(p.commands.migrate).toBe("mvn flyway:migrate");
    expect(p.commands.format).toBe("mvn spotless:apply");
  });

  it("Gradle Kotlin: ktlint + JavaLanguageVersion + liquibase", () => {
    const p = deterministicProfile(ev([{ path: "app/build.gradle.kts", content: 'kotlin("jvm") JavaLanguageVersion.of(17) spring-boot mybatis ktlint liquibase mssql-jdbc' }]));
    expect(p.language).toBe("kotlin");
    expect(p.languageVersion).toBe("17");
    expect(p.framework).toBe("spring-boot-kotlin");
    expect(p.orm).toBe("MyBatis");
    expect(p.dbEngine).toBe("mssql");
    expect(p.commands.lint).toBe("./gradlew ktlintCheck");
    expect(p.commands.migrate).toBe("./gradlew update");
  });

  it("Go: gin + GORM + sqlite + real go version", () => {
    const p = deterministicProfile(ev([{ path: "go.mod", content: "module x\ngo 1.21\ngin-gonic/gin gorm.io/gorm mattn/go-sqlite3 rs/zerolog golang-jwt" }]));
    expect(p.language).toBe("go");
    expect(p.languageVersion).toBe("1.21");
    expect(p.framework).toBe("gin");
    expect(p.orm).toBe("GORM");
    expect(p.dbEngine).toBe("sqlite");
    expect(p.loggingPattern).toBe("structured");
    expect(p.authMethod).toBe("JWT");
  });

  it("Rust: axum + diesel + postgres", () => {
    const p = deterministicProfile(ev([{ path: "Cargo.toml", content: 'edition = "2021"\naxum = "0.7"\ndiesel = "2"\npostgres = "0"\ntokio = "1"' }]));
    expect(p.language).toBe("rust");
    expect(p.framework).toBe("axum");
    expect(p.orm).toBe("Diesel");
    expect(p.dbEngine).toBe("postgresql");
    expect(p.commands.lint).toBe("cargo clippy -- -D warnings");
    expect(p.commands.migrate).toBe("diesel migration run");
  });

  it("Python Flask + SQLAlchemy + alembic (not Django)", () => {
    const p = deterministicProfile(ev([{ path: "pyproject.toml", content: "flask\nsqlalchemy\nalembic\nruff\nmypy\npytest\npsycopg" }]));
    expect(p.framework).toBe("flask");
    expect(p.orm).toBe("SQLAlchemy");
    expect(p.commands.migrate).toBe("alembic upgrade head");
    expect(p.commands.lint).toBe("ruff check .");
    expect(p.commands.typecheck).toBe("mypy .");
  });

  it("Node Express: reads declared scripts, detects Sequelize", () => {
    const pkg = JSON.stringify({ dependencies: { express: "4", sequelize: "6", mysql2: "3" }, scripts: { test: "mocha", lint: "eslint ." } });
    const p = deterministicProfile(ev([{ path: "package.json", content: pkg }]));
    expect(p.framework).toBe("express");
    expect(p.orm).toBe("Sequelize");
    expect(p.dbEngine).toBe("mysql");
    expect(p.commands.test).toBe("npm run test");
  });

  it("unknown stack → all null / honest none", () => {
    const p = deterministicProfile(ev([{ path: "README.md", content: "hi" }]));
    expect(p.language).toBeNull();
    expect(p.framework).toBeNull();
    expect(p.commands.test).toBeNull();
    expect(p.source).toBe("manifest-fallback");
  });

  it("a non-backend package.json is not misdetected as a backend", () => {
    const pkg = JSON.stringify({ dependencies: { react: "18" } });
    const p = deterministicProfile(ev([{ path: "package.json", content: pkg }]));
    expect(p.language).toBeNull();
  });

  it("synthesizeStackProfile without llm returns the deterministic profile", () => {
    const p = synthesizeStackProfile(ev([{ path: "go.mod", content: "go 1.22\nlabstack/echo" }]), { useLlm: false });
    expect(p.framework).toBe("echo");
    expect(p.source).toBe("manifest-fallback");
  });

  it("with llm: builds the prompt, parses the response, and merges it over the base", () => {
    const p = synthesizeStackProfile(ev([{ path: "pom.xml", content: "<java.version>17</java.version> spring-boot spring-boot-starter-data-jpa postgresql" }]), { useLlm: true });
    expect(p.source).toBe("llm");
    expect(p.commands.test).toBe("mvn verify");   // LLM override
    expect(p.dbEngine).toBe("postgresql");
    expect(p.confidence).toBe(0.95);
  });
});

describe("mergeProfile / mergeCommands", () => {
  const base: StackProfile = {
    language: "go", languageVersion: "1.22", framework: "echo", frameworkDetail: "echo (Go)",
    orm: "GORM", dbEngine: "postgresql", authMethod: "JWT", roleModel: "none", roleValues: "none",
    importStyle: "absolute", loggingPattern: "structured",
    commands: { test: "go test ./...", lint: "golangci-lint run", format: "gofmt -l .", typecheck: "go vet ./...", migrate: null },
    confidence: 0.7, evidenceRefs: ["go.mod"], source: "manifest-fallback",
  };

  it("LLM values override only when usable; omissions keep the base", () => {
    const merged = mergeProfile(base, { framework: "fiber", languageVersion: "", orm: null, confidence: 0.9 });
    expect(merged.framework).toBe("fiber");      // overridden
    expect(merged.languageVersion).toBe("1.22"); // empty string ignored → base kept
    expect(merged.orm).toBeNull();               // explicit null override honored
    expect(merged.dbEngine).toBe("postgresql");  // omitted → base kept
    expect(merged.source).toBe("llm");
    expect(merged.confidence).toBe(0.9);
  });

  it("mergeCommands fills per field, preferring the llm value", () => {
    const c = mergeCommands(base.commands, { migrate: "goose up", test: null });
    expect(c.migrate).toBe("goose up");   // llm fills the gap
    expect(c.test).toBe("go test ./...");  // llm null → base kept
    expect(c.lint).toBe("golangci-lint run");
  });
});
