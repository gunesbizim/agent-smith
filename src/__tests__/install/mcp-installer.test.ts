import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { configureMCPs } from "../../install/mcp-installer.js";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

const OUROBOROS_PERM = "mcp__ouroboros__ouroboros_pm_interview";

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
});
