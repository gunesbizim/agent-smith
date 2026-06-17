import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { configureMCPs, hasRequiredEnv, registerLocalMCPs, ensureGitignore, installMCPs } from "../../install/mcp-installer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject, FrontendInfo } from "../../shared/types.js";

const FRONTEND: FrontendInfo = {
  framework: "vue3", componentPattern: "script-setup", uiLibrary: "Vuetify 3",
  stateManagement: "Pinia", usesI18n: false, i18nLibrary: null,
  usesTypeScript: true, roleAwareUI: false,
};

function makeProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    rootPath: "/test/project",
    projectType: "unknown",
    backend: null,
    frontend: null,
    testing: { backend: null, frontend: null },
    linting: { backend: null, frontend: null },
    cicd: null,
    monorepo: null,
    database: null,
    ...overrides,
  };
}

describe("configureMCPs — dryRun: false — settings.json writes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-installer-"));
    fs.ensureDirSync(path.join(tmpDir, ".claude"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates settings.json with mcpServers when no prior file exists", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(path.join(tmpDir, ".claude", "settings.json"));
    expect(settings.mcpServers).toBeDefined();
    expect(typeof settings.mcpServers).toBe("object");
  });

  it("preserves existing permission allow entries when writing settings", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      permissions: { allow: ["mcp__some__other_tool"] },
    });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(settingsPath);
    expect(settings.permissions.allow).toContain("mcp__some__other_tool");
    expect(settings.mcpServers).toBeDefined();
  });

  it("creates .mcp.json with playwright and chrome-devtools entries", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const mcp = fs.readJsonSync(path.join(tmpDir, ".mcp.json"));
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.playwright).toBeDefined();
    expect(mcp.mcpServers["chrome-devtools"]).toBeDefined();
  });

  it("merges into existing .mcp.json without overwriting other entries", async () => {
    const mcpPath = path.join(tmpDir, ".mcp.json");
    fs.writeJsonSync(mcpPath, { mcpServers: { "my-custom-server": { type: "stdio", command: "foo", args: [] } } });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const mcp = fs.readJsonSync(mcpPath);
    expect(mcp.mcpServers["my-custom-server"]).toBeDefined();
    expect(mcp.mcpServers.playwright).toBeDefined();
  });
});

describe("configureMCPs — stack-aware MCP selection", () => {
  it("excludes browser MCPs for a no-frontend project (e.g. CLI tool)", async () => {
    const project = makeProject({ projectType: "cli-tool" });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectSettings.playwright).toBeUndefined();
    expect(bundle.projectSettings["chrome-devtools"]).toBeUndefined();
    expect(bundle.projectMcp.playwright).toBeUndefined();
    expect(bundle.projectMcp["chrome-devtools"]).toBeUndefined();
    // Non-browser servers are still configured.
    expect(bundle.projectSettings.gitnexus).toBeDefined();
    expect(bundle.projectSettings.sentrux).toBeDefined();
  });

  it("includes browser MCPs when a frontend is detected", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectSettings.playwright).toBeDefined();
    expect(bundle.projectMcp.playwright).toBeDefined();
    expect(bundle.projectMcp["chrome-devtools"]).toBeDefined();
  });

  it("includes browser MCPs when project is null (backward-compatible default)", async () => {
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectSettings.playwright).toBeDefined();
    expect(bundle.projectMcp.playwright).toBeDefined();
  });

  it("excludes the vuetify MCP for a non-Vuetify frontend", async () => {
    const reactish: FrontendInfo = { ...FRONTEND, framework: "react", uiLibrary: "MUI" };
    const project = makeProject({ projectType: "web-app", frontend: reactish });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.userMcp.vuetify).toBeUndefined();
  });

  it("includes the vuetify MCP when the frontend uses Vuetify", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.userMcp.vuetify).toBeDefined();
  });

  it("excludes laravel-boost for a non-Laravel project", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectSettings["laravel-boost"]).toBeUndefined();
  });

  it("includes laravel-boost when a Laravel backend is detected", async () => {
    const project = makeProject({
      projectType: "web-app",
      backend: { framework: "laravel", language: "php", languageVersion: "8.x" } as DetectedProject["backend"],
    });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectSettings["laravel-boost"]).toBeDefined();
    expect(bundle.projectSettings["laravel-boost"].command).toBe("php");
  });
});

describe("configureMCPs — dryRun: true — no files written", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-installer-dry-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns bundle without writing settings.json", async () => {
    const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectSettings).toBeDefined();
    expect(fs.existsSync(path.join(tmpDir, ".claude", "settings.json"))).toBe(false);
  });

  it("returns bundle without writing .mcp.json", async () => {
    const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectMcp).toBeDefined();
    expect(fs.existsSync(path.join(tmpDir, ".mcp.json"))).toBe(false);
  });

  it("bundle contains sentrux in projectSettings", async () => {
    const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectSettings.sentrux).toBeDefined();
    expect(bundle.projectSettings.sentrux.command).toBe("sentrux");
  });

  it("never writes obsidian (local scope) into project files", async () => {
    const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectSettings.obsidian).toBeUndefined();
    expect(bundle.projectMcp.obsidian).toBeUndefined();
    expect(bundle.userMcp.obsidian).toBeUndefined();
  });
});

describe("installMCPs — progress loop", () => {
  // Filtering to an unknown server name yields an empty install set, so the
  // loop spawns no child processes and must resolve to an empty summary.
  it("resolves to an empty summary when no servers match", async () => {
    const summary = await installMCPs({ servers: ["__definitely_not_a_real_server__"] }, { showProgress: false });
    expect(summary.installed).toEqual([]);
    expect(summary.failed).toEqual([]);
  });

  it("pre-warms playwright/chrome-devtools with a --version command (never launches the server)", async () => {
    const ran: string[] = [];
    const summary = await installMCPs(
      { servers: ["playwright", "chrome-devtools"] },
      {
        showProgress: false,
        check: async () => false, // force the install path
        run: async (cmd) => {
          ran.push(cmd);
          // A bare server-launch command would hang in reality; assert we never issue one.
          expect(cmd).toContain("--version");
        },
      },
    );
    expect(summary.prewarmed.sort()).toEqual(["chrome-devtools", "playwright"]);
    expect(ran.every((c) => c.includes("--version"))).toBe(true);
  });

  it("treats npx-on-demand servers (no install command) as a no-op", async () => {
    const ran: string[] = [];
    const summary = await installMCPs(
      { servers: ["vuetify"] },
      { showProgress: false, check: async () => false, run: async (cmd) => { ran.push(cmd); } },
    );
    expect(summary.onDemand).toContain("vuetify");
    expect(ran).toEqual([]); // nothing spawned
  });

  it("marks manual servers (laravel-boost) as manual without running anything", async () => {
    const ran: string[] = [];
    const summary = await installMCPs(
      { servers: ["laravel-boost"] },
      { showProgress: false, check: async () => false, run: async (cmd) => { ran.push(cmd); } },
    );
    expect(summary.manual).toContain("laravel-boost");
    expect(ran).toEqual([]);
  });
});

describe("hasRequiredEnv", () => {
  const VAR = "AGENT_SMITH_TEST_VAULT_PATH";

  afterEach(() => {
    delete process.env[VAR];
  });

  it("returns true when there are no required vars", () => {
    expect(hasRequiredEnv([])).toBe(true);
  });

  it("returns false when a required var is unset", () => {
    delete process.env[VAR];
    expect(hasRequiredEnv([VAR])).toBe(false);
  });

  it("returns false when a required var is empty/whitespace", () => {
    process.env[VAR] = "   ";
    expect(hasRequiredEnv([VAR])).toBe(false);
  });

  it("returns true when a required var is set", () => {
    process.env[VAR] = "/some/path";
    expect(hasRequiredEnv([VAR])).toBe(true);
  });
});

describe("registerLocalMCPs", () => {
  afterEach(() => {
    delete process.env.OBSIDIAN_VAULT_PATH;
  });

  it("reports local servers as skipped on non-claude-code platforms", () => {
    const { registered, skipped } = registerLocalMCPs(DEFAULT_TEMPLATE_VARS, "cursor");
    expect(registered).toEqual([]);
    expect(skipped).toContain("obsidian");
  });

  it("skips obsidian when OBSIDIAN_VAULT_PATH is unset", () => {
    delete process.env.OBSIDIAN_VAULT_PATH;
    const { registered, skipped } = registerLocalMCPs(DEFAULT_TEMPLATE_VARS, "claude-code");
    expect(registered).not.toContain("obsidian");
    expect(skipped).toContain("obsidian");
  });
});

describe("ensureGitignore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gitignore-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .gitignore and adds the entry when none exists", () => {
    const added = ensureGitignore(tmpDir, [".playwright-mcp/"]);
    expect(added).toEqual([".playwright-mcp/"]);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toContain(".playwright-mcp/");
  });

  it("is idempotent — does not re-add an existing entry", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n.playwright-mcp/\n");
    const added = ensureGitignore(tmpDir, [".playwright-mcp/"]);
    expect(added).toEqual([]);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content.match(/\.playwright-mcp/g)?.length).toBe(1);
  });

  it("treats trailing-slash variants as the same entry", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".playwright-mcp\n");
    const added = ensureGitignore(tmpDir, [".playwright-mcp/"]);
    expect(added).toEqual([]);
  });

  it("preserves existing entries when appending", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n");
    ensureGitignore(tmpDir, [".playwright-mcp/"]);
    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".playwright-mcp/");
  });
});
