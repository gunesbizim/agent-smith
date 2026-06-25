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
    expect(names).toContain("jira");
    expect(names).toContain("sentrux");
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
    const validScopes = ["project", "user", "both", "local"];
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

  it("has exactly 12 servers", () => {
    expect(MCP_REGISTRY.length).toBe(12);
  });

  it("includes laravel-boost", () => {
    expect(MCP_REGISTRY.map((s) => s.name)).toContain("laravel-boost");
  });

  it("prewarm servers never launch the server (install command ends with --version)", () => {
    const prewarm = MCP_REGISTRY.filter((s) => s.installType === "prewarm");
    expect(prewarm.map((s) => s.name).sort()).toEqual(["chrome-devtools", "playwright"]);
    for (const s of prewarm) {
      const cmd = typeof s.installCommand === "string" ? s.installCommand : "";
      expect(cmd).toContain("--version");
    }
  });

  it("declares requiresPackageManager for every server", () => {
    for (const server of MCP_REGISTRY) {
      expect(Array.isArray(server.requiresPackageManager)).toBe(true);
      expect(server.requiresPackageManager!.length).toBeGreaterThan(0);
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

describe("sentrux registry entry", () => {
  it("has category quality", () => {
    const s = getMCPServer("sentrux");
    expect(s).toBeDefined();
    expect(s!.category).toBe("quality");
  });

  it("has scope project", () => {
    const s = getMCPServer("sentrux");
    expect(s!.scope).toBe("project");
  });

  it("has installType shell", () => {
    const s = getMCPServer("sentrux");
    expect(s!.installType).toBe("shell");
  });

  it("configTemplate.command is sentrux", () => {
    const s = getMCPServer("sentrux");
    expect(s!.configTemplate.command).toBe("sentrux");
  });

  it("configTemplate.args includes mcp subcommand", () => {
    const s = getMCPServer("sentrux");
    expect(s!.configTemplate.args).toContain("mcp");
  });

  it("installCommand is platform-keyed with darwin, linux, win32 keys", () => {
    const s = getMCPServer("sentrux");
    expect(typeof s!.installCommand).toBe("object");
    const cmd = s!.installCommand as Record<string, string>;
    expect(cmd).toHaveProperty("darwin");
    expect(cmd).toHaveProperty("linux");
    expect(cmd).toHaveProperty("win32");
    expect(typeof cmd.darwin).toBe("string");
    expect(typeof cmd.linux).toBe("string");
    expect(typeof cmd.win32).toBe("string");
  });

  it("win32 install avoids fragile nested cmd→PowerShell quoting (C3 fix)", () => {
    const cmd = (getMCPServer("sentrux")!.installCommand as Record<string, string>).win32;
    // The old form embedded escaped \"...\" quotes that cmd.exe mis-parses; the path has no spaces,
    // so there must be no backslash-escaped quotes, and it should run non-interactively.
    expect(cmd).not.toContain('\\"');
    expect(cmd).toContain("-NoProfile");
    expect(cmd).toContain("$env:LOCALAPPDATA");
  });

  it("is returned by getMCPByCategory quality", () => {
    const quality = getMCPByCategory("quality");
    const names = quality.map((s) => s.name);
    expect(names).toContain("sentrux");
  });

  it("is returned by getMCPByScope project", () => {
    const project = getMCPByScope("project");
    const names = project.map((s) => s.name);
    expect(names).toContain("sentrux");
  });
});
