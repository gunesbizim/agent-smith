import { describe, it, expect } from "vitest";
import { generateBackendDocs, generateFrontendUserGuide } from "../../docs/doc-generator.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

describe("Documentation Generator", () => {
  describe("generateBackendDocs", () => {
    it("returns expected shape", async () => {
      const result = await generateBackendDocs("/test/project", DEFAULT_TEMPLATE_VARS);
      expect(typeof result.endpoints).toBe("number");
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it("includes project name in notes", async () => {
      const vars = { ...DEFAULT_TEMPLATE_VARS, PROJECT_NAME: "my-api" };
      const result = await generateBackendDocs("/test/project", vars);
      expect(result.notes[0]).toContain("my-api");
    });
  });

  describe("generateFrontendUserGuide", () => {
    it("returns expected shape", async () => {
      const result = await generateFrontendUserGuide(
        "/test/project",
        ["login", "dashboard"],
        ["admin", "lawyer"],
      );
      expect(result.flows).toEqual(["login", "dashboard"]);
      expect(Array.isArray(result.screenshots)).toBe(true);
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it("handles empty inputs", async () => {
      const result = await generateFrontendUserGuide("/test/project", [], []);
      expect(result.flows).toEqual([]);
    });
  });
});
