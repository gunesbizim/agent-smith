import { describe, it, expect } from "vitest";
import { resolveTemplate, TEMPLATE_VAR_PATTERN, DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import { resolveAll, extractPlaceholders, validateTemplates } from "../../adapt/template-engine.js";

describe("Template Engine", () => {
  describe("TEMPLATE_VAR_PATTERN", () => {
    it("matches single placeholder", () => {
      const match = "Hello {{NAME}}".match(TEMPLATE_VAR_PATTERN);
      expect(match).not.toBeNull();
      expect(match![0]).toBe("{{NAME}}");
    });

    it("matches multiple placeholders", () => {
      const matches = [..."{{A}} and {{B}} and {{C}}".matchAll(TEMPLATE_VAR_PATTERN)];
      expect(matches).toHaveLength(3);
      expect(matches.map((m) => m[1])).toEqual(["A", "B", "C"]);
    });

    it("does not match unclosed braces", () => {
      const matches = "Hello {{NAME".match(TEMPLATE_VAR_PATTERN);
      expect(matches).toBeNull();
    });

    it("matches snake_case and CAPS keys", () => {
      const matches = [
        ..."{{BACKEND_FRAMEWORK}} {{FRONTEND_DIR}} {{some_var}}".matchAll(TEMPLATE_VAR_PATTERN),
      ];
      expect(matches).toHaveLength(3);
    });
  });

  describe("resolveTemplate", () => {
    it("replaces known placeholders with provided values", () => {
      const result = resolveTemplate("Backend: {{BACKEND_FRAMEWORK}}", {
        BACKEND_FRAMEWORK: "FastAPI",
      });
      expect(result).toBe("Backend: FastAPI");
    });

    it("falls back to DEFAULT_TEMPLATE_VARS for unresolved", () => {
      const result = resolveTemplate("Framework: {{BACKEND_FRAMEWORK}}", {});
      expect(result).toContain("Django"); // default
    });

    it("leaves truly unknown placeholders intact", () => {
      const result = resolveTemplate("Unknown: {{TOTALLY_UNKNOWN_KEY}}", {});
      expect(result).toBe("Unknown: {{TOTALLY_UNKNOWN_KEY}}");
    });

    it("handles multiple replacements in one string", () => {
      const result = resolveTemplate(
        "{{BACKEND_DIR}}/{{FRONTEND_DIR}} — {{PROJECT_NAME}}",
        { BACKEND_DIR: "api", FRONTEND_DIR: "web", PROJECT_NAME: "testapp" },
      );
      expect(result).toBe("api/web — testapp");
    });

    it("handles empty input", () => {
      expect(resolveTemplate("", {})).toBe("");
    });

    it("handles no placeholders in input", () => {
      expect(resolveTemplate("plain text with no vars", {})).toBe("plain text with no vars");
    });
  });

  describe("resolveAll", () => {
    it("is an alias for resolveTemplate", () => {
      expect(resolveAll("{{BACKEND_LANG}}", { BACKEND_LANG: "Python 3.11" })).toBe(
        "Python 3.11",
      );
    });
  });

  describe("extractPlaceholders", () => {
    it("extracts unique placeholder keys", () => {
      const keys = extractPlaceholders("{{A}} {{B}} {{A}}");
      expect(keys).toEqual(["A", "B"]);
    });

    it("returns empty for content with no placeholders", () => {
      expect(extractPlaceholders("no vars here")).toEqual([]);
    });
  });

  describe("validateTemplates", () => {
    it("reports valid templates", () => {
      const result = validateTemplates({
        "test.md": "Known: {{BACKEND_FRAMEWORK}}",
      });
      expect(result.valid).toBe(true);
    });

    it("reports invalid templates with unknown placeholders", () => {
      const result = validateTemplates({
        "bad.md": "Unknown: {{MADE_UP_VAR_XYZ}}",
      });
      expect(result.valid).toBe(false);
      expect(result.unresolved["bad.md"]).toContain("MADE_UP_VAR_XYZ");
    });
  });

  describe("DEFAULT_TEMPLATE_VARS", () => {
    it("has all required keys", () => {
      const keys = Object.keys(DEFAULT_TEMPLATE_VARS);
      expect(keys).toContain("BACKEND_FRAMEWORK");
      expect(keys).toContain("FRONTEND_FRAMEWORK");
      expect(keys).toContain("BACKEND_TEST_CMD");
      expect(keys).toContain("FRONTEND_TEST_CMD");
      expect(keys).toContain("PRE_PUSH_GATES");
      expect(keys).toContain("ROLE_SYSTEM");
      expect(keys).toContain("DB_ENGINE");
      expect(keys).toContain("AUTH_METHOD");
    });
  });
});
