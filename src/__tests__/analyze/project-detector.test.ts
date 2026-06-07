import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { detectProject } from "../../analyze/project-detector.js";
import type { DetectedProject } from "../../shared/types.js";

// Create temporary project directories for detection testing
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smith-test-"));
});

afterAll(async () => {
  await fs.remove(tmpDir);
});

async function makeProject(name: string, files: Record<string, string>): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.emptyDir(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf-8");
  }
  return dir;
}

// Helper: assert the basic shape of a project result
function expectProjectShape(result: DetectedProject) {
  expect(typeof result.rootPath).toBe("string");
  expect(result).toHaveProperty("backend");
  expect(result).toHaveProperty("frontend");
  expect(result).toHaveProperty("testing");
  expect(result).toHaveProperty("linting");
}

describe("Project Detector — Backend", () => {
  it("detects Django project", async () => {
    const dir = await makeProject("django-app", {
      "manage.py": "#!/usr/bin/env python\nimport os\nimport sys",
      "requirements.txt": "django>=5\ndjangorestframework\npsycopg2-binary",
      "pyproject.toml": "[tool.pytest.ini_options]\naddopts = '-m not integration'",
    });
    const result = await detectProject(dir);
    expectProjectShape(result);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("django");
    expect(result.backend!.language).toBe("python");
  });

  it("detects FastAPI project", async () => {
    const dir = await makeProject("fastapi-app", {
      "main.py": "from fastapi import FastAPI\napp = FastAPI()\n@app.get('/')\ndef root():\n    return {}",
      "requirements.txt": "fastapi\nuvicorn",
      "pyproject.toml": "[project]\nname = 'fastapi-app'",
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("fastapi");
  });

  it("detects Flask project", async () => {
    const dir = await makeProject("flask-app", {
      "app.py": "from flask import Flask\napp = Flask(__name__)",
      "requirements.txt": "flask\nsqlalchemy",
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("flask");
  });

  it("detects Express project", async () => {
    const dir = await makeProject("express-app", {
      "package.json": JSON.stringify({ name: "api", dependencies: { express: "^4.18" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("express");
    expect(result.backend!.language).toBe("javascript");
  });

  it("detects NestJS project", async () => {
    const dir = await makeProject("nestjs-app", {
      "package.json": JSON.stringify({ name: "api", dependencies: { "@nestjs/core": "^10", "@prisma/client": "^5", typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("nestjs");
    expect(result.backend!.orm).toBe("Prisma");
  });

  it("detects Fastify project", async () => {
    const dir = await makeProject("fastify-app", {
      "package.json": JSON.stringify({ name: "api", dependencies: { fastify: "^4", typescript: "^5", drizzle: "^0.30" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("fastify");
    expect(result.backend!.orm).toBe("Drizzle");
  });

  it("detects Koa project", async () => {
    const dir = await makeProject("koa-app", {
      "package.json": JSON.stringify({ name: "api", dependencies: { koa: "^2" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("koa");
  });

  it("detects Hono project", async () => {
    const dir = await makeProject("hono-app", {
      "package.json": JSON.stringify({ name: "api", dependencies: { hono: "^4" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("hono");
  });

  it("detects Next.js API project", async () => {
    const dir = await makeProject("nextjs-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { next: "^14", react: "^18", prisma: "^5" } }),
      "next.config.js": "module.exports = {}",
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("nextjs-api");
    expect(result.backend!.orm).toBe("Prisma");
  });

  it("detects Rails project", async () => {
    const dir = await makeProject("rails-app", {
      "Gemfile": "source 'https://rubygems.org'\ngem 'rails', '~> 7.0'\ngem 'devise'",
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("rails");
    expect(result.backend!.language).toBe("ruby");
  });

  it("detects Laravel project", async () => {
    const dir = await makeProject("laravel-app", {
      "artisan": "#!/usr/bin/env php\n<?php",
      "composer.json": JSON.stringify({ require: { "laravel/framework": "^10" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("laravel");
    expect(result.backend!.language).toBe("php");
  });

  it("detects Symfony project", async () => {
    const dir = await makeProject("symfony-app", {
      "composer.json": JSON.stringify({ require: { "symfony/framework-bundle": "^6", "doctrine/orm": "^2" } }),
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("symfony");
  });

  it("detects Spring Boot (Java) project via pom.xml", async () => {
    const dir = await makeProject("spring-app", {
      "pom.xml": `<project><groupId>com.example</groupId><artifactId>demo</artifactId><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>`,
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("spring-boot");
    expect(result.backend!.language).toBe("java");
  });

  it("detects Spring Boot Kotlin via build.gradle.kts", async () => {
    const dir = await makeProject("spring-kotlin-app", {
      "build.gradle.kts": 'plugins { kotlin("jvm") version "1.9"; id("org.springframework.boot") version "3.2" }',
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("spring-boot-kotlin");
    expect(result.backend!.language).toBe("kotlin");
  });

  it("detects Ktor (Kotlin) project", async () => {
    const dir = await makeProject("ktor-app", {
      "build.gradle.kts": 'dependencies { implementation("io.ktor:ktor-server-core:2.3") }',
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("ktor");
  });

  it("detects Go Gin project", async () => {
    const dir = await makeProject("gin-app", {
      "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9\n)",
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("gin");
    expect(result.backend!.language).toBe("go");
  });

  it("detects Go Echo project", async () => {
    const dir = await makeProject("echo-app", {
      "go.mod": "module example.com/app\n\ngo 1.22\n\nrequire github.com/labstack/echo/v4 v4.11",
    });
    const result = await detectProject(dir);
    expect(result.backend!.framework).toBe("echo");
  });

  it("detects Go Fiber project", async () => {
    const dir = await makeProject("fiber-app", {
      "go.mod": "module example.com/app\nrequire github.com/gofiber/fiber/v2 v2.52",
    });
    const result = await detectProject(dir);
    expect(result.backend!.framework).toBe("fiber");
  });

  it("detects Go Chi project", async () => {
    const dir = await makeProject("chi-app", {
      "go.mod": "module example.com/app\nrequire github.com/go-chi/chi/v5 v5.0",
    });
    const result = await detectProject(dir);
    expect(result.backend!.framework).toBe("chi");
  });

  it("detects Rust Actix-web project", async () => {
    const dir = await makeProject("actix-app", {
      "Cargo.toml": '[package]\nname = "app"\n[dependencies]\nactix-web = "4"',
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("actix-web");
    expect(result.backend!.language).toBe("rust");
  });

  it("detects Rust Axum project", async () => {
    const dir = await makeProject("axum-app", {
      "Cargo.toml": '[package]\nname = "app"\n[dependencies]\naxum = "0.7"\ntokio = { version = "1", features = ["full"] }',
    });
    const result = await detectProject(dir);
    expect(result.backend!.framework).toBe("axum");
  });

  it("detects Rust Rocket project", async () => {
    const dir = await makeProject("rocket-app", {
      "Cargo.toml": '[package]\nname = "app"\n[dependencies]\nrocket = "0.5"',
    });
    const result = await detectProject(dir);
    expect(result.backend!.framework).toBe("rocket");
  });

  it("detects ASP.NET Core project", async () => {
    const dir = await makeProject("aspnet-app", {
      "WebApi.csproj": '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("aspnet-core");
    expect(result.backend!.language).toBe("csharp");
  });

  it("detects Swift Vapor project", async () => {
    const dir = await makeProject("vapor-app", {
      "Package.swift": '// swift-tools-version:5.10\nimport PackageDescription\nlet package = Package(name: "app", dependencies: [.package(url: "https://github.com/vapor/vapor.git", from: "4.0.0")])',
    });
    const result = await detectProject(dir);
    expect(result.backend).toBeDefined();
    expect(result.backend!.framework).toBe("vapor");
    expect(result.backend!.language).toBe("swift");
  });
});

describe("Project Detector — Frontend", () => {
  it("detects Vue 3 project with Vuetify", async () => {
    const dir = await makeProject("vue3-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { vue: "^3.4", vuetify: "^3.5", pinia: "^2", "vue-i18n": "^9", typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("vue3");
    expect(result.frontend!.uiLibrary).toBe("Vuetify 3");
    expect(result.frontend!.stateManagement).toBe("Pinia");
    expect(result.frontend!.usesTypeScript).toBe(true);
  });

  it("detects Nuxt 3 project", async () => {
    const dir = await makeProject("nuxt3-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { nuxt: "^3", vue: "^3.4" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("nuxt3");
  });

  it("detects React project with MUI", async () => {
    const dir = await makeProject("react-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { react: "^18", "@mui/material": "^5", "@reduxjs/toolkit": "^2", typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("react");
    expect(result.frontend!.uiLibrary).toBe("MUI");
    expect(result.frontend!.stateManagement).toBe("Redux Toolkit");
  });

  it("detects Next.js frontend", async () => {
    const dir = await makeProject("nextjs-web", {
      "package.json": JSON.stringify({ name: "web", dependencies: { next: "^14", react: "^18", typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("nextjs");
  });

  it("detects Gatsby frontend", async () => {
    const dir = await makeProject("gatsby-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { gatsby: "^5", react: "^18" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("gatsby");
  });

  it("detects Angular project", async () => {
    const dir = await makeProject("angular-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { "@angular/core": "^17", "@angular/material": "^17" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("angular");
    expect(result.frontend!.usesTypeScript).toBe(true);
  });

  it("detects SvelteKit project", async () => {
    const dir = await makeProject("sveltekit-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { "@sveltejs/kit": "^2", svelte: "^4" }, devDependencies: { typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("sveltekit");
  });

  it("detects SolidJS project", async () => {
    const dir = await makeProject("solid-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { "solid-js": "^1.8" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("solidjs");
  });

  it("detects Qwik project", async () => {
    const dir = await makeProject("qwik-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { "@builder.io/qwik": "^1" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("qwik");
  });

  it("detects Astro project", async () => {
    const dir = await makeProject("astro-app", {
      "package.json": JSON.stringify({ name: "web", dependencies: { astro: "^4" } }),
    });
    const result = await detectProject(dir);
    expect(result.frontend!.framework).toBe("astro");
  });

  it("detects Blazor WASM project", async () => {
    const dir = await makeProject("blazor-app", {
      "BlazorApp.csproj": '<Project Sdk="Microsoft.NET.Sdk.BlazorWebAssembly"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>',
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("blazor-wasm");
  });

  it("detects Flutter project", async () => {
    const dir = await makeProject("flutter-app", {
      "pubspec.yaml": "name: flutter_app\ndependencies:\n  flutter:\n    sdk: flutter\n  provider: ^6.0",
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("flutter");
    expect(result.frontend!.stateManagement).toBe("Provider");
  });

  it("detects HTMX in HTML files", async () => {
    const dir = await makeProject("htmx-app", {
      "index.html": '<html><body><button hx-get="/api/data" hx-target="#result">Load</button><div id="result"></div></body></html>',
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("htmx");
  });

  it("detects Alpine.js in HTML", async () => {
    const dir = await makeProject("alpine-app", {
      "index.html": '<html><body><div x-data="{ open: false }"><button @click="open = !open">Toggle</button></div><script src="https://unpkg.com/alpinejs"></script></body></html>',
    });
    const result = await detectProject(dir);
    expect(result.frontend).toBeDefined();
    expect(result.frontend!.framework).toBe("alpine");
  });

  it("returns null for empty project", async () => {
    const dir = await makeProject("empty", {});
    const result = await detectProject(dir);
    expect(result.backend).toBeNull();
    expect(result.frontend).toBeNull();
  });
});

describe("Project Detector — Testing & Linting", () => {
  it("detects pytest", async () => {
    const dir = await makeProject("pytest-app", {
      "pyproject.toml": "[tool.pytest.ini_options]\naddopts = '-m not integration'",
      "requirements.txt": "pytest\npytest-django",
    });
    const result = await detectProject(dir);
    expect(result.testing.backend).toBeDefined();
    expect(result.testing.backend!.framework).toBe("pytest");
    expect(result.testing.backend!.command).toContain("not integration");
  });

  it("detects vitest", async () => {
    const dir = await makeProject("vitest-app", {
      "package.json": JSON.stringify({ name: "web", devDependencies: { vitest: "^1", typescript: "^5" } }),
    });
    const result = await detectProject(dir);
    expect(result.testing.frontend).toBeDefined();
    expect(result.testing.frontend!.framework).toBe("vitest");
  });

  it("detects jest", async () => {
    const dir = await makeProject("jest-app", {
      "package.json": JSON.stringify({ name: "web", devDependencies: { jest: "^29" } }),
    });
    const result = await detectProject(dir);
    expect(result.testing.frontend!.framework).toBe("jest");
  });

  it("detects Playwright test", async () => {
    const dir = await makeProject("playwright-app", {
      "package.json": JSON.stringify({ name: "web", devDependencies: { "@playwright/test": "^1.40" } }),
    });
    const result = await detectProject(dir);
    expect(result.testing.frontend!.framework).toBe("playwright");
  });

  it("detects ruff linter", async () => {
    const dir = await makeProject("ruff-app", {
      "pyproject.toml": "[tool.ruff]\nline-length = 100",
    });
    const result = await detectProject(dir);
    expect(result.linting.backend).toBeDefined();
    expect(result.linting.backend!.tool).toBe("ruff");
  });

  it("detects eslint", async () => {
    const dir = await makeProject("eslint-app", {
      "package.json": JSON.stringify({ name: "web", devDependencies: { eslint: "^8" } }),
    });
    const result = await detectProject(dir);
    expect(result.linting.frontend).toBeDefined();
    expect(result.linting.frontend!.tool).toBe("eslint");
  });

  it("detects biome", async () => {
    const dir = await makeProject("biome-app", {
      "package.json": JSON.stringify({ name: "web", devDependencies: { biome: "^1" } }),
    });
    const result = await detectProject(dir);
    expect(result.linting.frontend!.tool).toBe("biome");
  });
});
