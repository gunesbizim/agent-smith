import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { resolveAll, extractPlaceholders } from "../../adapt/template-engine.js";
import { customizeSkills, substituteToFixpoint } from "../../adapt/skill-customizer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

// skill-customizer.ts requires filesystem access — test its logic via template functions
describe("Skill Customizer (logic tests)", () => {
  describe("Framework-specific customization logic", () => {
    it("resolves Django-specific variables into skill content", () => {
      const template = `
        You are a senior {{BACKEND_FRAMEWORK}} engineer.
        Run lint: \`{{BACKEND_LINT_CMD}}\`
        Run tests: \`{{BACKEND_TEST_CMD}}\`
      `;
      const result = resolveAll(template, {
        BACKEND_FRAMEWORK: "Django",
        BACKEND_LINT_CMD: "ruff check .",
        BACKEND_TEST_CMD: "pytest -m 'not integration'",
      });

      expect(result).toContain("Django");
      expect(result).toContain("ruff check .");
      expect(result).toContain("pytest -m 'not integration'");
    });

    it("resolves Vue-specific variables", () => {
      const template = `Stack: {{FRONTEND_FRAMEWORK}} + {{FRONTEND_UI_LIBRARY}}`;
      const result = resolveAll(template, {
        FRONTEND_FRAMEWORK: "Vue 3",
        FRONTEND_UI_LIBRARY: "Vuetify 3",
      });
      expect(result).toBe("Stack: Vue 3 + Vuetify 3");
    });

    it("resolves Express/Node variables", () => {
      const template = `Backend: {{BACKEND_FRAMEWORK}} on Node, DB: {{DB_ENGINE}} via {{ORM}}`;
      const result = resolveAll(template, {
        BACKEND_FRAMEWORK: "Express",
        DB_ENGINE: "PostgreSQL",
        ORM: "Prisma",
      });
      expect(result).toBe("Backend: Express on Node, DB: PostgreSQL via Prisma");
    });

    it("leaves unresolved placeholders for unknown frameworks", () => {
      const template = `Framework: {{BACKEND_FRAMEWORK}} Tool: {{NONEXISTENT_TOOL}}`;
      const result = resolveAll(template, { BACKEND_FRAMEWORK: "Custom" });
      expect(result).toContain("Custom");
      expect(result).toContain("{{NONEXISTENT_TOOL}}");
    });
  });

  describe("Role system substitution", () => {
    it("resolves decorator-based role system", () => {
      const template = `Auth: {{ROLE_SYSTEM}}. Valid roles: {{ROLE_VALID_VALUES}}`;
      const result = resolveAll(template, {
        ROLE_SYSTEM: "role decorators on APIView subclasses",
        ROLE_VALID_VALUES: "admin, supervisor, lawyer",
      });
      expect(result).toContain("role decorators");
      expect(result).toContain("admin, supervisor, lawyer");
    });

    it("resolves middleware-based role system", () => {
      const template = `Auth: {{ROLE_SYSTEM}}`;
      const result = resolveAll(template, {
        ROLE_SYSTEM: "middleware-based role enforcement",
      });
      expect(result).toContain("middleware");
    });

    it("resolves none role system", () => {
      const template = `Auth: {{ROLE_SYSTEM}}`;
      const result = resolveAll(template, {
        ROLE_SYSTEM: "none (manual permission checks)",
      });
      expect(result).toContain("none");
    });
  });

  describe("Pre-push gate substitution", () => {
    it("substitutes multi-tool pre-push gates", () => {
      const template = "Gates: `{{PRE_PUSH_GATES}}`";
      const result = resolveAll(template, {
        PRE_PUSH_GATES: "ruff + mypy + pytest + lint_role_decorators",
      });
      expect(result).toContain("ruff");
      expect(result).toContain("mypy");
      expect(result).toContain("pytest");
    });
  });

  describe("extractPlaceholders from real skill content", () => {
    const skillContent = `
      You are a senior {{BACKEND_FRAMEWORK}} engineer.
      Run lint: \`{{BACKEND_LINT_CMD}}\`
      Run tests: \`{{BACKEND_TEST_CMD}}\`
      Auth: {{AUTH_METHOD}}
      Imports: {{IMPORT_STYLE}}
      Database: {{DB_ENGINE}} via {{ORM}}
    `;

    it("extracts all expected keys from skill template", () => {
      const keys = extractPlaceholders(skillContent);
      expect(keys).toContain("BACKEND_FRAMEWORK");
      expect(keys).toContain("BACKEND_LINT_CMD");
      expect(keys).toContain("BACKEND_TEST_CMD");
      expect(keys).toContain("AUTH_METHOD");
      expect(keys).toContain("IMPORT_STYLE");
      expect(keys).toContain("DB_ENGINE");
      expect(keys).toContain("ORM");
    });

    it("returns unique keys only", () => {
      const dupContent = "{{A}} {{A}} {{A}}";
      const keys = extractPlaceholders(dupContent);
      expect(keys).toEqual(["A"]);
    });

    it("extracts from Go skill template", () => {
      const goSkillContent = `
        Run lint: \`{{BACKEND_LINT_CMD}}\`
        Run tests: \`{{BACKEND_TEST_CMD}}\`
        ORM: {{ORM}}
      `;
      const keys = extractPlaceholders(goSkillContent);
      expect(keys).toContain("BACKEND_LINT_CMD");
      expect(keys).toContain("BACKEND_TEST_CMD");
      expect(keys).toContain("ORM");
    });

    it("extracts from Rust skill template", () => {
      const rustSkillContent = `
        Test: \`{{BACKEND_TEST_CMD}}\`
        Lint: \`{{BACKEND_LINT_CMD}}\`
        Framework: {{BACKEND_FRAMEWORK}}
        DB: {{DB_ENGINE}} via {{ORM}}
      `;
      const keys = extractPlaceholders(rustSkillContent);
      expect(keys).toContain("BACKEND_FRAMEWORK");
      expect(keys).toContain("DB_ENGINE");
      expect(keys).toContain("ORM");
    });

    it("extracts from Java/Spring skill template", () => {
      const javaSkillContent = `
        Framework: {{BACKEND_FRAMEWORK}}
        Auth: {{AUTH_METHOD}}
        ORM: {{ORM}}
        Test: \`{{BACKEND_TEST_CMD}}\`
      `;
      const keys = extractPlaceholders(javaSkillContent);
      expect(keys).toContain("AUTH_METHOD");
      expect(keys).toContain("BACKEND_FRAMEWORK");
    });
  });

  describe("substitution ordering + fixpoint guard (B8)", () => {
    let tmp: string;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-smith-b8-"));
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      warnSpy.mockRestore();
      fs.removeSync(tmp);
    });

    it("a customization that re-injects {{BACKEND_MIGRATE_CMD}} resolves to the real command — no residual {{", async () => {
      // For a non-Django project, applyFrameworkCustomizations rewrites `python manage.py`
      // to `# {{BACKEND_MIGRATE_CMD}}`. Substitution must run AFTER that and resolve it.
      const rel = ".claude/skills/test-backend/SKILL.md";
      const file = path.join(tmp, rel);
      await fs.ensureDir(path.dirname(file));
      await fs.writeFile(file, "Migrate with: `python manage.py migrate`\nFramework: {{BACKEND_FRAMEWORK}}\n");

      const vars = {
        ...DEFAULT_TEMPLATE_VARS,
        BACKEND_FRAMEWORK: "fastapi",
        BACKEND_MIGRATE_CMD: "alembic upgrade head",
      };
      await customizeSkills(tmp, vars);

      const out = await fs.readFile(file, "utf-8");
      expect(out).not.toMatch(/\{\{/);                 // the ordering hazard cannot ship
      expect(out).toContain("alembic upgrade head");   // re-injected placeholder resolved
      expect(out).toContain("fastapi");
      expect(out).not.toContain("python manage.py");
    });

    it("fixpoint guard FLAGS a genuinely unresolved variable rather than passing silently", () => {
      const out = substituteToFixpoint("Tool: {{NOT_A_REAL_VAR}}", DEFAULT_TEMPLATE_VARS, "fake.md");
      expect(out).toContain("{{NOT_A_REAL_VAR}}");     // left intact (not silently dropped)
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("{{NOT_A_REAL_VAR}}"),
      );
    });

    it("does not warn when every placeholder resolves", () => {
      const out = substituteToFixpoint("F: {{BACKEND_FRAMEWORK}}", { BACKEND_FRAMEWORK: "gin" }, "ok.md");
      expect(out).toBe("F: gin");
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe("framework-agnostic templates", () => {
    it("generic-server produces usable output with minimal vars", () => {
      const template = `Backend: {{BACKEND_FRAMEWORK}} — {{BACKEND_LANG}} — Tests: \`{{BACKEND_TEST_CMD}}\``;
      const result = resolveAll(template, {
        BACKEND_FRAMEWORK: "Generic-Server",
        BACKEND_LANG: "Go 1.22",
        BACKEND_TEST_CMD: "go test ./...",
      });
      expect(result).toBe("Backend: Generic-Server — Go 1.22 — Tests: `go test ./...`");
    });

    it("non-JS frontends still resolve UI library vars", () => {
      const template = `UI: {{FRONTEND_UI_LIBRARY}} — Framework: {{FRONTEND_FRAMEWORK}}`;
      const result = resolveAll(template, {
        FRONTEND_FRAMEWORK: "Flutter",
        FRONTEND_UI_LIBRARY: "Material Design (Flutter)",
      });
      expect(result).toBe("UI: Material Design (Flutter) — Framework: Flutter");
    });
  });
});
