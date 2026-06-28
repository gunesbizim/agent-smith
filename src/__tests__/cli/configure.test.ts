import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../install/dependency-checker.js", () => ({
  checkDependencies: vi.fn(),
}));
vi.mock("../../install/mcp-installer.js", () => ({
  installMCPs: vi.fn(async () => ({ installed: [], prewarmed: [], alreadyPresent: [], onDemand: [], manual: [], failed: [] })),
  configureMCPs: vi.fn(async () => ({})),
  ensureGitignore: vi.fn(() => []),
  selectServersToInstall: vi.fn(() => [{ name: "gitnexus" }]),
  PLAYWRIGHT_OUTPUT_DIR: ".playwright-mcp",
}));
// Consent is unit-tested in install-consent.test.ts; default to approved here so
// the install path runs. Individual tests override to test the skip path.
vi.mock("../../install/install-consent.js", () => ({
  resolveConsent: vi.fn(async () => ({ approved: true })),
}));
// The obsidian vault prompt + directory-creation logic lives in (and is unit-tested
// by) obsidian-vault.test.ts. Mock it here so configure tests focus on orchestration
// and never touch the real filesystem with a prompted path.
vi.mock("../../install/obsidian-vault.js", () => ({
  setupObsidianVault: vi.fn(async () => ({ vaultPath: null, created: false })),
}));
vi.mock("../../scaffold/configs.js", () => ({
  scaffoldConfigs: vi.fn(async () => {}),
}));

import { configureCommand } from "../../cli/configure.js";
import { checkDependencies } from "../../install/dependency-checker.js";
import {
  installMCPs,
  configureMCPs,
  ensureGitignore,
} from "../../install/mcp-installer.js";
import { setupObsidianVault } from "../../install/obsidian-vault.js";
import { resolveConsent } from "../../install/install-consent.js";

const mockedCheck = vi.mocked(checkDependencies);
const mockedConsent = vi.mocked(resolveConsent);

describe("configureCommand", () => {
  const origVault = process.env.OBSIDIAN_VAULT_PATH;
  const origTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OBSIDIAN_VAULT_PATH;
    (process.stdin as { isTTY?: boolean }).isTTY = false;
    mockedCheck.mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof checkDependencies>>);
    mockedConsent.mockResolvedValue({ approved: true });
  });

  afterEach(() => {
    if (origVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = origVault;
    (process.stdin as { isTTY?: boolean }).isTTY = origTTY;
  });

  it("returns early without configuring when dependencies are missing", async () => {
    mockedCheck.mockResolvedValue({ ok: false } as Awaited<ReturnType<typeof checkDependencies>>);
    await configureCommand({});
    expect(configureMCPs).not.toHaveBeenCalled();
  });

  it("installs, configures, and gitignores playwright output (no separate registerLocalMCPs step)", async () => {
    await configureCommand({});
    expect(installMCPs).toHaveBeenCalled();
    // configureMCPs now also receives dryRun + the detected project (for stack-aware MCP gating).
    expect(configureMCPs).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      "claude-code",
      false,
      expect.anything(),
    );
    expect(ensureGitignore).toHaveBeenCalledWith(expect.any(String), [".playwright-mcp/"]);
  });

  it("completes without error (no registerLocalMCPs call expected)", async () => {
    await expect(configureCommand({})).resolves.toBeUndefined();
  });

  it("skips install when consent is declined, but still writes config", async () => {
    mockedConsent.mockResolvedValue({ approved: false, reason: "skipped via --no-install" });
    await configureCommand({ install: false });
    expect(installMCPs).not.toHaveBeenCalled();
    expect(configureMCPs).toHaveBeenCalled(); // config files are still written
  });

  it("splits the --mcp option into a server list", async () => {
    await configureCommand({ mcp: "obsidian, playwright" });
    // installMCPs now also receives the detected project for stack-aware gating.
    expect(installMCPs).toHaveBeenCalledWith({
      servers: ["obsidian", "playwright"],
      project: expect.anything(),
    });
  });

  it("sets up the obsidian vault (prompt + directory creation) interactively", async () => {
    await configureCommand({});
    expect(setupObsidianVault).toHaveBeenCalledWith(expect.any(String), { interactive: true });
  });
});
