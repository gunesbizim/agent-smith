import { describe, it, expect } from "vitest";
import {
  writeObsidianNote,
  buildTechnicalNote,
  buildUserGuideNote,
} from "../../docs/obsidian-writer.js";
import type { ObsidianNote } from "../../docs/obsidian-writer.js";

describe("Obsidian Writer", () => {
  describe("writeObsidianNote", () => {
    it("returns true (stub)", async () => {
      const note: ObsidianNote = {
        path: "test/docs/test-note.md",
        content: "# Test",
        tags: ["test"],
        frontmatter: {},
      };
      const result = await writeObsidianNote(note);
      expect(result).toBe(true);
    });
  });

  describe("buildTechnicalNote", () => {
    it("includes endpoints in content", () => {
      const note = buildTechnicalNote(
        "myproject",
        "feat/PROJ-42-new-endpoint",
        ["GET /api/users", "POST /api/users"],
        ["UserSerializer"],
        ["0002_add_user_table"],
      );

      expect(note.path).toBe("myproject/docs/backend/feat/PROJ-42-new-endpoint.md");
      expect(note.tags).toContain("backend");
      expect(note.tags).toContain("technical");
      expect(note.content).toContain("GET /api/users");
      expect(note.content).toContain("POST /api/users");
      expect(note.content).toContain("UserSerializer");
      expect(note.content).toContain("0002_add_user_table");
      expect(note.frontmatter.type).toBe("technical-notes");
    });

    it("handles no migrations", () => {
      const note = buildTechnicalNote("p", "b", ["GET /api/health"], [], []);
      expect(note.content).toContain("None");
    });

    it("includes generated-by footer", () => {
      const note = buildTechnicalNote("p", "b", [], [], []);
      expect(note.content).toContain("agent-smith");
    });
  });

  describe("buildUserGuideNote", () => {
    it("builds structured user guide", () => {
      const note = buildUserGuideNote(
        "myapp",
        "Scanning Documents",
        ["admin", "supervisor", "lawyer"],
        ["Open the scanning page", "Select a file", "Click upload"],
        ["scanning-admin-step1.png", "scanning-admin-step2.png", ""],
        "| Action | Admin | Supervisor | Lawyer |\n|---|---|---|---|\n| Upload | ✓ | ✓ | ✗ |",
      );

      expect(note.path).toBe("myapp/docs/user-guide/scanning-documents.md");
      expect(note.tags).toContain("user-guide");
      expect(note.tags).toContain("scanning documents");
      expect(note.content).toContain("Scanning Documents");
      expect(note.content).toContain("admin · supervisor · lawyer");
      expect(note.content).toContain("Open the scanning page");
      expect(note.content).toContain("![](scanning-admin-step1.png)");
      expect(note.content).toContain("Differences by role");
      expect(note.frontmatter.roles).toBe("admin, supervisor, lawyer");
    });

    it("handles single role", () => {
      const note = buildUserGuideNote("app", "Settings", ["admin"], ["Open settings"], [""], "");
      expect(note.content).toContain("admin");
    });

    it("includes generated-by footer", () => {
      const note = buildUserGuideNote("app", "Flow", ["admin"], ["Step 1"], ["img.png"], "");
      expect(note.content).toContain("agent-smith");
    });
  });
});
