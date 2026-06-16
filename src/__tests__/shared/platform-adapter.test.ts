import { describe, it, expect } from "vitest";
import {
  PLATFORM_ADAPTERS,
  getPlatformAdapter,
  ClaudeCodeAdapter,
  CursorAdapter,
  ContinueAdapter,
} from "../../shared/platform-adapter.js";

describe("Platform Adapters", () => {
  describe("Adapter Registry", () => {
    it("has all expected adapters", () => {
      expect(PLATFORM_ADAPTERS["claude-code"]).toBeInstanceOf(ClaudeCodeAdapter);
      expect(PLATFORM_ADAPTERS["claude-cli"]).toBeInstanceOf(ClaudeCodeAdapter);
      expect(PLATFORM_ADAPTERS.cursor).toBeInstanceOf(CursorAdapter);
      expect(PLATFORM_ADAPTERS.continue).toBeInstanceOf(ContinueAdapter);
    });

    it("getPlatformAdapter returns correct adapter", () => {
      const adapter = getPlatformAdapter("claude-code");
      expect(adapter).toBeDefined();
      expect(adapter!.name).toBe("claude-code");
      expect(adapter!.displayName).toBe("Claude Code");
    });

    it("returns undefined for unknown platform", () => {
      expect(getPlatformAdapter("nonexistent")).toBeUndefined();
    });
  });

  describe("ClaudeCodeAdapter", () => {
    const adapter = new ClaudeCodeAdapter();

    it("has correct paths", () => {
      expect(adapter.mcpConfigPath).toBe(".claude/settings.json");
      expect(adapter.skillsBasePath).toBe(".claude/skills");
      expect(adapter.commandsBasePath).toBe(".claude/commands");
      expect(adapter.architectureBasePath).toBe("docs/architecture");
    });

    it("has correct config format", () => {
      expect(adapter.mcpConfigFormat).toBe("claude-settings");
    });

    it("installMCPs does not throw", async () => {
      // Should not throw even with empty config
      await expect(
        adapter.installMCPs({ projectSettings: {}, projectMcp: {}, userMcp: {} }),
      ).resolves.not.toThrow();
    });
  });

  describe("CursorAdapter", () => {
    const adapter = new CursorAdapter();

    it("has cursor-specific paths", () => {
      expect(adapter.mcpConfigPath).toBe(".cursor/mcp.json");
      expect(adapter.skillsBasePath).toBe(".cursor/rules");
      expect(adapter.mcpConfigFormat).toBe("cursor-mcp");
    });

    it("installMCPs handles gracefully", async () => {
      const result = adapter.installMCPs({ projectSettings: {}, projectMcp: {}, userMcp: {} });
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe("ContinueAdapter", () => {
    const adapter = new ContinueAdapter();

    it("has continue.dev-specific paths", () => {
      expect(adapter.mcpConfigPath).toContain(".continue");
      expect(adapter.mcpConfigFormat).toBe("continue-config");
    });

    it("installMCPs handles gracefully", async () => {
      const result = adapter.installMCPs({ projectSettings: {}, projectMcp: {}, userMcp: {} });
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe("Adapter Interface Compliance", () => {
    const adapters = [new ClaudeCodeAdapter(), new CursorAdapter(), new ContinueAdapter()];

    for (const adapter of adapters) {
      it(`${adapter.name} implements required interface`, () => {
        expect(typeof adapter.name).toBe("string");
        expect(typeof adapter.displayName).toBe("string");
        expect(typeof adapter.mcpConfigPath).toBe("string");
        expect(typeof adapter.mcpConfigFormat).toBe("string");
        expect(typeof adapter.installMCPs).toBe("function");
        expect(typeof adapter.scaffoldSkills).toBe("function");
      });
    }
  });
});
