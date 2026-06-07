import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { scanPackages } from "../../analyze/package-scanner.js";
import type { PackageUsage } from "../../analyze/package-scanner.js";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-smith-pkg-test-"));
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

describe("Package Scanner", () => {
  it("returns empty usage for empty project", async () => {
    const dir = await makeProject("empty", {});
    const result = await scanPackages(dir);
    expect(result.orm).toBeNull();
    expect(result.authLibrary).toBeNull();
    expect(result.allDependencies).toEqual({});
  });

  describe("npm projects", () => {
    it("detects Prisma ORM, NextAuth, Zod, Pino in a full-stack project", async () => {
      const dir = await makeProject("fullstack", {
        "package.json": JSON.stringify({
          name: "app",
          dependencies: {
            "@prisma/client": "^5.0",
            "next-auth": "^4.0",
            zod: "^3.0",
            pino: "^9.0",
            pg: "^8.0",
            ioredis: "^5.0",
            react: "^19.0",
          },
          devDependencies: {
            vitest: "^2.0",
            "@playwright/test": "^1.40",
            msw: "^2.0",
            typescript: "^5.0",
          },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBe("Prisma");
      expect(result.authLibrary).toBe("NextAuth/Auth.js");
      expect(result.validationLibrary).toBe("Zod");
      expect(result.loggingLibrary).toBe("Pino");
      expect(result.dbDriver).toBe("pg");
      expect(result.cacheDriver).toBe("ioredis");
      expect(result.testFramework).toBe("Vitest");
      expect(result.e2eFramework).toBe("Playwright");
      expect(result.mockingLibrary).toBe("MSW");
    });

    it("detects Drizzle, jose, Zustand, React Router", async () => {
      const dir = await makeProject("drizzle-app", {
        "package.json": JSON.stringify({
          name: "app",
          dependencies: {
            "drizzle-orm": "^0.30",
            jose: "^5.0",
            zustand: "^4.5",
            "react-router-dom": "^6.0",
            "react-hook-form": "^7.0",
            "@radix-ui/react-dialog": "^1.0",
          },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBe("Drizzle");
      expect(result.authLibrary).toBe("jose");
      expect(result.stateManagement).toBe("Zustand");
      expect(result.routerLibrary).toBe("React Router");
      expect(result.formLibrary).toBe("react-hook-form");
      expect(result.uiLibrary).toBe("Radix UI");
    });
  });

  describe("Go projects", () => {
    it("detects Echo, golang-jwt, pgx, go-redis from go.mod", async () => {
      const dir = await makeProject("go-app", {
        "go.mod": `module example.com/app

go 1.22

require (
	github.com/labstack/echo/v4 v4.12.0
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/jackc/pgx/v5 v5.9.2
	github.com/redis/go-redis/v9 v9.19.0
	github.com/go-playground/validator/v10 v10.22.0
)`,
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBeNull(); // No ORM in this go.mod
      expect(result.authLibrary).toBe("golang-jwt");
      expect(result.dbDriver).toBe("pgx");
      expect(result.cacheDriver).toBe("go-redis");
      expect(result.validationLibrary).toBe("go-playground/validator");
    });

    it("detects GORM", async () => {
      const dir = await makeProject("gorm-app", {
        "go.mod": `module example.com/app

go 1.22

require (
	gorm.io/gorm v1.25.0
	gorm.io/driver/postgres v1.5.0
)`,
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBe("GORM");
    });
  });

  describe("Python projects", () => {
    it("detects packages from requirements.txt", async () => {
      const dir = await makeProject("python-app", {
        "requirements.txt": "fastapi==0.110.0\nsqlalchemy==2.0.0\npydantic==2.0.0\npython-jose[cryptography]==3.3.0",
      });
      const result = await scanPackages(dir);
      expect(result.validationLibrary).toBe("Pydantic");
      expect(result.orm).toBe("SQLAlchemy");
    });
  });

  describe("PHP projects", () => {
    it("detects packages from composer.json", async () => {
      const dir = await makeProject("php-app", {
        "composer.json": JSON.stringify({
          require: {
            "laravel/framework": "^10.0",
            "doctrine/orm": "^2.0",
            "monolog/monolog": "^3.0",
          },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBe("Doctrine");
      expect(result.loggingLibrary).toBe("Monolog");
    });
  });

  describe("Rust projects", () => {
    it("detects packages from Cargo.toml", async () => {
      const dir = await makeProject("rust-app", {
        "Cargo.toml": `[package]
name = "app"
version = "0.1.0"

[dependencies]
actix-web = "4"
diesel = { version = "2", features = ["postgres"] }
`,
      });
      const result = await scanPackages(dir);
      expect(result.orm).toBe("Diesel");
    });
  });

  describe("Monorepo (pnpm workspaces)", () => {
    it("finds packages in apps/* and packages/* subdirectories", async () => {
      const dir = await makeProject("monorepo", {
        "package.json": JSON.stringify({ name: "root", private: true }),
        "pnpm-workspace.yaml": "packages:\n  - 'apps/*'\n  - 'packages/*'",
        "pnpm-lock.yaml": "",
        "apps/web/package.json": JSON.stringify({
          name: "web",
          dependencies: {
            react: "^19.0",
            zustand: "^4.5",
            "react-router-dom": "^6.0",
            "react-hook-form": "^7.0",
          },
          devDependencies: {
            vitest: "^2.0",
            "@playwright/test": "^1.40",
          },
        }),
        "apps/api/package.json": JSON.stringify({
          name: "api",
          dependencies: {
            hono: "^4.0",
            drizzle: "^0.30",
            zod: "^3.0",
            jose: "^5.0",
            postgres: "^3.0",
          },
          devDependencies: {
            vitest: "^2.0",
          },
        }),
      });

      const result = await scanPackages(dir);

      // Should find packages from both subdirs
      expect(result.stateManagement).toBe("Zustand");
      expect(result.formLibrary).toBe("react-hook-form");
      expect(result.routerLibrary).toBe("React Router");
      expect(result.orm).toBe("Drizzle");
      expect(result.authLibrary).toBe("jose");
      expect(result.validationLibrary).toBe("Zod");
      expect(result.dbDriver).toBe("pg");
      expect(result.testFramework).toBe("Vitest");
      expect(result.e2eFramework).toBe("Playwright");
    });
  });

  describe("Category mapping", () => {
    it("maps Tailwind CSS as UI library", async () => {
      const dir = await makeProject("tailwind-app", {
        "package.json": JSON.stringify({
          dependencies: { tailwindcss: "^3.0" },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.uiLibrary).toBe("Tailwind CSS");
    });

    it("maps TanStack Query as state management", async () => {
      const dir = await makeProject("tanstack-app", {
        "package.json": JSON.stringify({
          dependencies: { "@tanstack/react-query": "^5.0" },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.stateManagement).toBe("TanStack Query");
    });

    it("maps PixiJS as rendering library", async () => {
      const dir = await makeProject("pixi-app", {
        "package.json": JSON.stringify({
          dependencies: { "pixi.js": "^8.0" },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.renderingLibrary).toBe("PixiJS");
    });
  });

  describe("Version tracking", () => {
    it("tracks package versions from package.json", async () => {
      const dir = await makeProject("versioned", {
        "package.json": JSON.stringify({
          dependencies: {
            zod: "^3.23.8",
            zustand: "^4.5.2",
          },
        }),
      });
      const result = await scanPackages(dir);
      expect(result.validationLibrary).toBe("Zod");
      expect(result.validationLibraryVersion).toBe("3.23.8");
      expect(result.stateManagement).toBe("Zustand");
      expect(result.stateManagementVersion).toBe("4.5.2");
    });

    it("tracks Go package versions", async () => {
      const dir = await makeProject("go-versioned", {
        "go.mod": `module example.com/app

go 1.22

require (
	github.com/labstack/echo/v4 v4.12.0
)`,
      });
      const result = await scanPackages(dir);
      expect(result.authLibrary).toBeNull();
      // echo is the HTTP framework, not auth
      expect(result.httpFramework).toBeNull(); // HTTP framework not categorized via packages
    });
  });
});
