import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { configureMCPs, hasRequiredEnv, registerLocalMCPs, ensureGitignore } from "../../install/mcp-installer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject, FrontendInfo } from "../../shared/types.js";

const OUROBOROS_PERM = "mcp__ouroboros__ouroboros_pm_interview";

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

  it("adds ouroboros permission when settings.json has no permissions", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(path.join(tmpDir, ".claude", "settings.json"));
    expect(settings.permissions.allow).toContain(OUROBOROS_PERM);
  });

  it("does not duplicate ouroboros permission on second run", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(path.join(tmpDir, ".claude", "settings.json"));
    const count = settings.permissions.allow.filter((p: string) => p === OUROBOROS_PERM).length;
    expect(count).toBe(1);
  });

  it("preserves existing allow entries when adding ouroboros permission", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      permissions: { allow: ["mcp__some__other_tool"] },
    });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(settingsPath);
    expect(settings.permissions.allow).toContain("mcp__some__other_tool");
    expect(settings.permissions.allow).toContain(OUROBOROS_PERM);
  });

  it("does not add ouroboros permission if already present", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      permissions: { allow: [OUROBOROS_PERM, "mcp__some__other_tool"] },
    });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false);
    const settings = fs.readJsonSync(settingsPath);
    const count = settings.permissions.allow.filter((p: string) => p === OUROBOROS_PERM).length;
    expect(count).toBe(1);
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
