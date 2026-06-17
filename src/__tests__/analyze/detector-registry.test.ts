// Registry-driven backend detection tests (B10).
//
// These assert the declarative registry yields the SAME facts the inline cascade did —
// per language family — and that the facts-only contract (B3: null/"unknown" when
// unproven) holds. They exercise detectBackendFromRegistry directly, the unit under the
// public detectProject() path, so a regression in a single row fails here precisely.
import { describe, it, expect } from "vitest";
import {
  detectBackendFromRegistry,
  manifestEvidence,
  nodeEvidence,
  phpEvidence,
  goModVersion,
  goORM,
  goAuth,
  GO_ROWS,
  RUST_ROWS,
  NODE_ROWS,
  RUBY_ROWS,
  PHP_ROWS,
  JVM_ROWS,
  DOTNET_ROWS,
  SWIFT_ROWS,
} from "../../analyze/detector-registry.js";

describe("detector-registry — Go family", () => {
  it("gin with real go directive → framework gin, parsed version, facts-only auth/orm", () => {
    const goMod = "module example.com/app\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9";
    const b = detectBackendFromRegistry(GO_ROWS, manifestEvidence(goMod))!;
    expect(b.framework).toBe("gin");
    expect(b.language).toBe("go");
    expect(b.languageVersion).toBe("1.22");  // parsed, not hardcoded
    expect(b.authMethod).toBe("unknown");     // no jwt evidence → honest sentinel
    expect(b.orm).toBeNull();                 // no orm evidence
    expect(b.rolePattern).toBe("middleware");
  });

  it("gin + jwt + gorm → JWT auth and GORM orm proven from evidence", () => {
    const goMod = "module x\ngo 1.21\nrequire (\n github.com/gin-gonic/gin v1.9\n github.com/golang-jwt/jwt/v5 v5\n gorm.io/gorm v1.25\n)";
    const b = detectBackendFromRegistry(GO_ROWS, manifestEvidence(goMod))!;
    expect(b.authMethod).toBe("JWT");
    expect(b.orm).toBe("GORM");
    expect(b.languageVersion).toBe("1.21");
  });

  it("echo / fiber / chi markers each resolve to their framework", () => {
    expect(detectBackendFromRegistry(GO_ROWS, manifestEvidence("require github.com/labstack/echo/v4 v4"))!.framework).toBe("echo");
    expect(detectBackendFromRegistry(GO_ROWS, manifestEvidence("require github.com/gofiber/fiber/v2 v2"))!.framework).toBe("fiber");
    expect(detectBackendFromRegistry(GO_ROWS, manifestEvidence("require github.com/go-chi/chi/v5 v5"))!.framework).toBe("chi");
  });

  it("unknown go.mod → generic-server with authMethod none (not unknown)", () => {
    const b = detectBackendFromRegistry(GO_ROWS, manifestEvidence("module x\ngo 1.20\n"))!;
    expect(b.framework).toBe("generic-server");
    expect(b.authMethod).toBe("none");
    expect(b.orm).toBeNull();
  });

  it("goModVersion parses the go directive and falls back to empty string", () => {
    expect(goModVersion("module x\ngo 1.22\n")).toBe("1.22");
    expect(goModVersion("module x\n")).toBe("");
  });

  it("goORM / goAuth are facts-only (drivers are not ORMs; no jwt → unknown)", () => {
    expect(goORM("github.com/jackc/pgx/v5")).toBeNull();   // driver, not an ORM
    expect(goORM("gorm.io/gorm")).toBe("GORM");
    expect(goAuth("github.com/gin-gonic/gin")).toBe("unknown");
    expect(goAuth("github.com/golang-jwt/jwt/v5")).toBe("JWT");
  });
});

describe("detector-registry — Rust family", () => {
  it("actix-web → structured logging, diesel orm proven", () => {
    const b = detectBackendFromRegistry(RUST_ROWS, manifestEvidence('[dependencies]\nactix-web = "4"\ndiesel = "2"'))!;
    expect(b.framework).toBe("actix-web");
    expect(b.loggingPattern).toBe("structured");
    expect(b.orm).toBe("Diesel");
  });
  it("axum prefers sqlx; rocket → session auth; generic → none", () => {
    expect(detectBackendFromRegistry(RUST_ROWS, manifestEvidence('axum = "0.7"\nsqlx = "0.7"'))!.orm).toBe("SQLx");
    expect(detectBackendFromRegistry(RUST_ROWS, manifestEvidence('rocket = "0.5"'))!.authMethod).toBe("session");
    const generic = detectBackendFromRegistry(RUST_ROWS, manifestEvidence("[package]\nname = 'x'"))!;
    expect(generic.framework).toBe("generic-server");
    expect(generic.authMethod).toBe("none");
  });
});

describe("detector-registry — Node family", () => {
  it("nestjs → service/repo, decorators, structured logging, prisma via @prisma/client", () => {
    const b = detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ "@nestjs/core": "10", "@prisma/client": "5", typescript: "5" }))!;
    expect(b.framework).toBe("nestjs");
    expect(b.hasServiceRepo).toBe(true);
    expect(b.rolePattern).toBe("decorators");
    expect(b.loggingPattern).toBe("structured");
    expect(b.orm).toBe("Prisma");
  });
  it("express without typescript → javascript; with typescript → typescript", () => {
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ express: "4" }))!.language).toBe("javascript");
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ express: "4", typescript: "5" }))!.language).toBe("typescript");
  });
  it("fastify orm via full nodeORM resolution (drizzle)", () => {
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ fastify: "4", drizzle: "0.3" }))!.orm).toBe("Drizzle");
  });
  it("next → nextjs-api with NextAuth; nuxt → session", () => {
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ next: "14" }))!.framework).toBe("nextjs-api");
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ next: "14" }))!.authMethod).toBe("NextAuth");
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ nuxt: "3" }))!.authMethod).toBe("session");
  });
  it("no known node marker → null (no generic fallback unless cors/helmet/body-parser)", () => {
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ lodash: "4" }))).toBeNull();
    expect(detectBackendFromRegistry(NODE_ROWS, nodeEvidence({ cors: "2" }))!.framework).toBe("generic-server");
  });
});

describe("detector-registry — Ruby / PHP families", () => {
  it("rails → ActiveRecord + Devise; sinatra orm only when proven", () => {
    const rails = detectBackendFromRegistry(RUBY_ROWS, manifestEvidence("gem 'rails'"))!;
    expect(rails.framework).toBe("rails");
    expect(rails.orm).toBe("ActiveRecord");
    expect(rails.authMethod).toBe("Devise");
    expect(detectBackendFromRegistry(RUBY_ROWS, manifestEvidence("gem 'sinatra'"))!.orm).toBeNull();
    expect(detectBackendFromRegistry(RUBY_ROWS, manifestEvidence("gem 'sinatra'\ngem 'sequel'"))!.orm).toBe("Sequel");
  });
  it("laravel → Eloquent/Sanctum; symfony doctrine only when required", () => {
    expect(detectBackendFromRegistry(PHP_ROWS, phpEvidence({ "laravel/framework": "10" }))!.orm).toBe("Eloquent");
    expect(detectBackendFromRegistry(PHP_ROWS, phpEvidence({ "symfony/framework-bundle": "6" }))!.orm).toBeNull();
    expect(detectBackendFromRegistry(PHP_ROWS, phpEvidence({ "symfony/framework-bundle": "6", "doctrine/orm": "2" }))!.orm).toBe("Doctrine");
  });
});

describe("detector-registry — JVM family", () => {
  it("spring-boot java vs kotlin override and JPA marker matching", () => {
    const java = detectBackendFromRegistry(JVM_ROWS, manifestEvidence("org.springframework.boot spring-boot-starter-data-jpa"))!;
    expect(java.framework).toBe("spring-boot");
    expect(java.language).toBe("java");
    expect(java.languageVersion).toBe("21");
    expect(java.orm).toBe("JPA/Hibernate");
    const kotlin = detectBackendFromRegistry(JVM_ROWS, manifestEvidence('kotlin("jvm") org.springframework.boot'))!;
    expect(kotlin.framework).toBe("spring-boot-kotlin");
    expect(kotlin.language).toBe("kotlin");
    expect(kotlin.languageVersion).toBe("2.x");
  });
  it("ktor → middleware/function views; generic JVM → none", () => {
    const ktor = detectBackendFromRegistry(JVM_ROWS, manifestEvidence('implementation("io.ktor:ktor-server-core")'))!;
    expect(ktor.framework).toBe("ktor");
    expect(ktor.usesFunctionViews).toBe(true);
    expect(detectBackendFromRegistry(JVM_ROWS, manifestEvidence("plain gradle"))!.framework).toBe("generic-server");
  });
});

describe("detector-registry — .NET / Swift families", () => {
  it("aspnet-core vs blazor-api hasServiceRepo distinction preserved", () => {
    const aspnet = detectBackendFromRegistry(DOTNET_ROWS, manifestEvidence('Sdk="Microsoft.NET.Sdk.Web"'))!;
    expect(aspnet.framework).toBe("aspnet-core");
    expect(aspnet.hasServiceRepo).toBe(true);
    const blazor = detectBackendFromRegistry(DOTNET_ROWS, manifestEvidence("Microsoft.AspNetCore Blazor"))!;
    expect(blazor.framework).toBe("blazor-api");
    expect(blazor.hasServiceRepo).toBe(false);  // Blazor is not service/repo layered
  });
  it("vapor → Fluent orm only when present; generic swift → none", () => {
    expect(detectBackendFromRegistry(SWIFT_ROWS, manifestEvidence("vapor fluent"))!.orm).toBe("Fluent");
    expect(detectBackendFromRegistry(SWIFT_ROWS, manifestEvidence("vapor"))!.orm).toBeNull();
    expect(detectBackendFromRegistry(SWIFT_ROWS, manifestEvidence("// swift"))!.framework).toBe("generic-server");
  });
});
