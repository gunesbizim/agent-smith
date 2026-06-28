import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { configureMCPs, hasRequiredEnv, ensureGitignore, installMCPs, runCommandAsync, commandSucceeds, presenceProbe } from "../../install/mcp-installer.js";
import { needsShellForCli } from "../../shared/platform-utils.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";
import type { DetectedProject, FrontendInfo } from "../../shared/types.js";
import { stripSettingsMcpServers } from "../../install/mcp-installer.js";

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

describe("presenceProbe — cross-platform PATH check (C1 Windows fix)", () => {
  it("uses `command -v` for a bare token on POSIX", () => {
    expect(presenceProbe("gitnexus", "linux")).toBe("command -v gitnexus");
    expect(presenceProbe("serena", "darwin")).toBe("command -v serena");
  });

  it("uses `where` for a bare token on Windows (cmd.exe has no `command -v`)", () => {
    expect(presenceProbe("gitnexus", "win32")).toBe("where gitnexus");
    expect(presenceProbe("sentrux", "win32")).toBe("where sentrux");
  });

  it("runs a command that already has args verbatim on every platform", () => {
    expect(presenceProbe("sentrux --version", "win32")).toBe("sentrux --version");
    expect(presenceProbe("npx @vuetify/mcp --version", "linux")).toBe("npx @vuetify/mcp --version");
  });
});

describe("needsShellForCli — launch .cmd/.bat shims via shell on Windows (M2/M3 fix)", () => {
  it("is true only on win32", () => {
    expect(needsShellForCli("win32")).toBe(true);
    expect(needsShellForCli("linux")).toBe(false);
    expect(needsShellForCli("darwin")).toBe(false);
  });
});

describe("configureMCPs — dryRun: false — correct file targets", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-installer-"));
    fs.ensureDirSync(path.join(tmpDir, ".claude"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates .mcp.json with project-scope servers (gitnexus, sentrux, serena, git-memory)", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const mcp = fs.readJsonSync(path.join(tmpDir, ".mcp.json"));
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.gitnexus).toBeDefined();
    expect(mcp.mcpServers.sentrux).toBeDefined();
    expect(mcp.mcpServers.serena).toBeDefined();
    expect(mcp.mcpServers["git-memory"]).toBeDefined();
  });

  it("creates .mcp.json with browser servers (playwright, chrome-devtools) when no project given", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const mcp = fs.readJsonSync(path.join(tmpDir, ".mcp.json"));
    expect(mcp.mcpServers.playwright).toBeDefined();
    expect(mcp.mcpServers["chrome-devtools"]).toBeDefined();
  });

  it("writes user-scope servers (mempalace, vuetify) into .mcp.json — NOT a separate user file", async () => {
    const projectWithVuetify = makeProject({ projectType: "web-app", frontend: FRONTEND });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, projectWithVuetify);
    const mcp = fs.readJsonSync(path.join(tmpDir, ".mcp.json"));
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers.mempalace).toBeDefined();
    expect(mcp.mcpServers.vuetify).toBeDefined();
  });

  it("writes local-scope servers (obsidian) into .mcp.json when OBSIDIAN_VAULT_PATH is set", async () => {
    const savedVault = process.env.OBSIDIAN_VAULT_PATH;
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/test-vault";
    try {
      await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
      const mcp = fs.readJsonSync(path.join(tmpDir, ".mcp.json"));
      expect(mcp.mcpServers.obsidian).toBeDefined();
      expect(mcp.mcpServers.obsidian.command).toBe("npx");
    } finally {
      if (savedVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
      else process.env.OBSIDIAN_VAULT_PATH = savedVault;
    }
  });

  it("does NOT write mcpServers into .claude/settings.json", async () => {
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = fs.readJsonSync(settingsPath);
      expect(settings.mcpServers).toBeUndefined();
    }
    // If the file wasn't written at all, that's also fine
  });

  it("preserves existing permission allow entries in settings.json without adding mcpServers", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      permissions: { allow: ["mcp__some__other_tool"] },
    });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const settings = fs.readJsonSync(settingsPath);
    expect(settings.permissions.allow).toContain("mcp__some__other_tool");
    expect(settings.mcpServers).toBeUndefined();
  });

  it("merges into existing .mcp.json without overwriting other entries", async () => {
    const mcpPath = path.join(tmpDir, ".mcp.json");
    fs.writeJsonSync(mcpPath, { mcpServers: { "my-custom-server": { type: "stdio", command: "foo", args: [] } } });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const mcp = fs.readJsonSync(mcpPath);
    expect(mcp.mcpServers["my-custom-server"]).toBeDefined();
    expect(mcp.mcpServers.playwright).toBeDefined();
  });

  it("never writes to the real ~/.claude/.mcp.json", async () => {
    const realUserMcp = path.join(os.homedir(), ".claude", ".mcp.json");
    const beforeExists = fs.existsSync(realUserMcp);
    const beforeContent = beforeExists ? fs.readJsonSync(realUserMcp) : null;
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    if (beforeExists) {
      const afterContent = fs.readJsonSync(realUserMcp);
      expect(afterContent).toEqual(beforeContent);
    } else {
      expect(fs.existsSync(realUserMcp)).toBe(false);
    }
  });
});

describe("configureMCPs — stack-aware MCP selection", () => {
  it("excludes browser MCPs for a no-frontend project (e.g. CLI tool)", async () => {
    const project = makeProject({ projectType: "cli-tool" });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp.playwright).toBeUndefined();
    expect(bundle.projectMcp["chrome-devtools"]).toBeUndefined();
    // projectSettings should NOT contain MCP servers (they go to projectMcp now)
    expect(bundle.projectSettings.playwright).toBeUndefined();
    expect(bundle.projectSettings["chrome-devtools"]).toBeUndefined();
    // Non-browser project-scope servers go to projectMcp.
    expect(bundle.projectMcp.gitnexus).toBeDefined();
    expect(bundle.projectMcp.sentrux).toBeDefined();
  });

  it("includes browser MCPs in projectMcp when a frontend is detected", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp.playwright).toBeDefined();
    expect(bundle.projectMcp["chrome-devtools"]).toBeDefined();
  });

  it("includes browser MCPs in projectMcp when project is null (backward-compatible default)", async () => {
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectMcp.playwright).toBeDefined();
    expect(bundle.projectMcp["chrome-devtools"]).toBeDefined();
  });

  it("excludes the vuetify MCP for a non-Vuetify frontend", async () => {
    const reactish: FrontendInfo = { ...FRONTEND, framework: "react", uiLibrary: "MUI" };
    const project = makeProject({ projectType: "web-app", frontend: reactish });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp.vuetify).toBeUndefined();
  });

  it("includes the vuetify MCP in projectMcp when the frontend uses Vuetify", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp.vuetify).toBeDefined();
  });

  it("includes mempalace (user-scope) in projectMcp — all scopes consolidated", async () => {
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, null);
    expect(bundle.projectMcp.mempalace).toBeDefined();
  });

  it("excludes laravel-boost for a non-Laravel project", async () => {
    const project = makeProject({ projectType: "web-app", frontend: FRONTEND });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp["laravel-boost"]).toBeUndefined();
  });

  it("includes laravel-boost in projectMcp when a Laravel backend is detected", async () => {
    const project = makeProject({
      projectType: "web-app",
      backend: { framework: "laravel", language: "php", languageVersion: "8.x" } as DetectedProject["backend"],
    });
    const bundle = await configureMCPs("/tmp/x", DEFAULT_TEMPLATE_VARS, "claude-code", true, project);
    expect(bundle.projectMcp["laravel-boost"]).toBeDefined();
    expect(bundle.projectMcp["laravel-boost"].command).toBe("php");
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

  it("bundle contains sentrux in projectMcp (project-scope servers go to projectMcp)", async () => {
    const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
    expect(bundle.projectMcp.sentrux).toBeDefined();
    expect(bundle.projectMcp.sentrux.command).toBe("sentrux");
    // projectSettings should NOT contain MCP server entries
    expect(bundle.projectSettings.sentrux).toBeUndefined();
  });

  it("skips obsidian (local scope) when OBSIDIAN_VAULT_PATH is unset (requiredEnv not met)", async () => {
    const savedVault = process.env.OBSIDIAN_VAULT_PATH;
    delete process.env.OBSIDIAN_VAULT_PATH;
    try {
      const bundle = await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", true);
      expect(bundle.projectSettings.obsidian).toBeUndefined();
      expect(bundle.projectMcp.obsidian).toBeUndefined();
    } finally {
      if (savedVault !== undefined) process.env.OBSIDIAN_VAULT_PATH = savedVault;
    }
  });
});

describe("stripSettingsMcpServers — migration cleanup", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-strip-"));
    fs.ensureDirSync(path.join(tmpDir, ".claude"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes only mcpServers from settings.json, leaving permissions and hooks intact", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      mcpServers: { gitnexus: { type: "stdio", command: "gitnexus", args: ["mcp"], env: {} } },
      permissions: { allow: ["Bash(git:*)"], deny: [] },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] },
    });
    stripSettingsMcpServers(tmpDir);
    const settings = fs.readJsonSync(settingsPath);
    expect(settings.mcpServers).toBeUndefined();
    expect(settings.permissions.allow).toContain("Bash(git:*)");
    expect(settings.hooks).toBeDefined();
  });

  it("is a no-op when settings.json has no mcpServers key", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, { permissions: { allow: ["Bash(git:*)"] } });
    const before = fs.readFileSync(settingsPath, "utf-8");
    stripSettingsMcpServers(tmpDir);
    const after = fs.readFileSync(settingsPath, "utf-8");
    expect(after).toBe(before);
  });

  it("is a no-op when settings.json does not exist", async () => {
    expect(() => stripSettingsMcpServers(tmpDir)).not.toThrow();
  });

  it("configureMCPs calls stripSettingsMcpServers: mcpServers key gone after run", async () => {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeJsonSync(settingsPath, {
      mcpServers: { old: { type: "stdio", command: "old", args: [], env: {} } },
      permissions: { allow: ["Bash(npm:*)"] },
    });
    await configureMCPs(tmpDir, DEFAULT_TEMPLATE_VARS, "claude-code", false, null);
    const settings = fs.readJsonSync(settingsPath);
    expect(settings.mcpServers).toBeUndefined();
    expect(settings.permissions.allow).toContain("Bash(npm:*)");
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

  it("records already-present servers", async () => {
    const summary = await installMCPs(
      { servers: ["gitnexus"] },
      { showProgress: false, check: async () => true, run: async () => {} },
    );
    expect(summary.alreadyPresent).toContain("gitnexus");
  });

  it("records a failed install without throwing", async () => {
    const summary = await installMCPs(
      { servers: ["gitnexus"] },
      { showProgress: false, check: async () => false, run: async () => { throw new Error("boom"); } },
    );
    expect(summary.failed[0]).toMatchObject({ name: "gitnexus", error: "boom" });
  });

  it("renders the progress bar + summary footer (showProgress) and buckets outcomes", async () => {
    const summary = await installMCPs(
      { servers: ["gitnexus", "vuetify", "laravel-boost"] },
      { showProgress: true, check: async () => false, run: async () => {} },
    );
    expect(summary.installed).toContain("gitnexus");
    expect(summary.onDemand).toContain("vuetify");
    expect(summary.manual).toContain("laravel-boost");
  });
});

describe("runCommandAsync / commandSucceeds (real spawn)", () => {
  it("runCommandAsync resolves on exit 0", async () => {
    await expect(runCommandAsync("node --version")).resolves.toBeUndefined();
  });
  it("runCommandAsync rejects on non-zero exit", async () => {
    await expect(runCommandAsync('node -e "process.exit(3)"')).rejects.toThrow();
  });
  it("commandSucceeds reflects the exit status", async () => {
    expect(await commandSucceeds("node --version")).toBe(true);
    expect(await commandSucceeds('node -e "process.exit(1)"')).toBe(false);
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
