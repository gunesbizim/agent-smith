import { describe, it, expect } from "vitest";
import {
  MCP_REGISTRY,
  getMCPServer,
  getMCPByCategory,
  getMCPByScope,
} from "../../install/registry.js";

describe("MCP Registry", () => {
  it("has all expected servers", () => {
    const names = MCP_REGISTRY.map((s) => s.name);
    expect(names).toContain("gitnexus");
    expect(names).toContain("git-memory");
    expect(names).toContain("serena");
    expect(names).toContain("playwright");
    expect(names).toContain("chrome-devtools");
    expect(names).toContain("sonarqube");
    expect(names).toContain("vuetify");
    expect(names).toContain("obsidian");
    expect(names).toContain("mempalace");
    expect(names).toContain("ouroboros");
    expect(names).toContain("jira");
  });

  it("has no duplicate names", () => {
    const names = MCP_REGISTRY.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every server has required fields", () => {
    for (const server of MCP_REGISTRY) {
      expect(server.name).toBeTruthy();
      expect(server.description).toBeTruthy();
      expect(server.category).toBeTruthy();
      expect(server.scope).toBeTruthy();
      expect(server.configTemplate.command).toBeTruthy();
      expect(Array.isArray(server.configTemplate.args)).toBe(true);
      expect(typeof server.configTemplate.env).toBe("object");
    }
  });

  it("every server has valid category", () => {
    const validCategories = ["code-intelligence", "browser", "documentation", "quality", "memory", "pm", "design"];
    for (const server of MCP_REGISTRY) {
      expect(validCategories).toContain(server.category);
    }
  });

  it("every server has valid scope", () => {
    const validScopes = ["project", "user", "both"];
    for (const server of MCP_REGISTRY) {
      expect(validScopes).toContain(server.scope);
    }
  });

  it("npx servers have 'npx' as command", () => {
    const npxServers = MCP_REGISTRY.filter((s) => s.installType === "npx");
    for (const s of npxServers) {
      expect(s.configTemplate.command).toBe("npx");
    }
  });
});

describe("getMCPServer", () => {
  it("returns the correct server by name", () => {
    const s = getMCPServer("gitnexus");
    expect(s).toBeDefined();
    expect(s!.name).toBe("gitnexus");
  });

  it("returns undefined for unknown server", () => {
    expect(getMCPServer("nonexistent")).toBeUndefined();
  });
});

describe("getMCPByCategory", () => {
  it("returns code-intelligence servers", () => {
    const ci = getMCPByCategory("code-intelligence");
    const names = ci.map((s) => s.name);
    expect(names).toContain("gitnexus");
    expect(names).toContain("git-memory");
    expect(names).toContain("serena");
  });

  it("returns browser servers", () => {
    const browser = getMCPByCategory("browser");
    const names = browser.map((s) => s.name);
    expect(names).toContain("playwright");
    expect(names).toContain("chrome-devtools");
  });

  it("returns empty for unknown category", () => {
    expect(getMCPByCategory("unknown" as any)).toEqual([]);
  });
});

describe("getMCPByScope", () => {
  it("returns project-scoped servers", () => {
    const project = getMCPByScope("project");
    const names = project.map((s) => s.name);
    expect(names).toContain("gitnexus");
    expect(names).toContain("playwright");
  });

  it("returns user-scoped servers", () => {
    const user = getMCPByScope("user");
    const names = user.map((s) => s.name);
    expect(names).toContain("sonarqube");
    expect(names).toContain("mempalace");
  });
});
