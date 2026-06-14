import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: (_q: string, cb: (answer: string) => void) => cb("/prompted/vault"),
      close: vi.fn(),
    })),
  },
}));
vi.mock("../../install/dependency-checker.js", () => ({
  checkDependencies: vi.fn(),
}));
vi.mock("../../install/mcp-installer.js", () => ({
  installMCPs: vi.fn(async () => {}),
  configureMCPs: vi.fn(async () => ({})),
  registerLocalMCPs: vi.fn(() => ({ registered: [], skipped: [] })),
  ensureGitignore: vi.fn(() => []),
  PLAYWRIGHT_OUTPUT_DIR: ".playwright-mcp",
}));
vi.mock("../../scaffold/configs.js", () => ({
  scaffoldConfigs: vi.fn(async () => {}),
}));

import { configureCommand } from "../../cli/configure.js";
import { checkDependencies } from "../../install/dependency-checker.js";
import {
  installMCPs,
  configureMCPs,
  registerLocalMCPs,
  ensureGitignore,
} from "../../install/mcp-installer.js";

const mockedCheck = vi.mocked(checkDependencies);
const mockedRegister = vi.mocked(registerLocalMCPs);

describe("configureCommand", () => {
  const origVault = process.env.OBSIDIAN_VAULT_PATH;
  const origTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OBSIDIAN_VAULT_PATH;
    (process.stdin as { isTTY?: boolean }).isTTY = false;
    mockedCheck.mockResolvedValue({ ok: true } as Awaited<ReturnType<typeof checkDependencies>>);
    mockedRegister.mockReturnValue({ registered: [], skipped: [] });
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

  it("installs, configures, gitignores playwright output, and registers local servers", async () => {
    mockedRegister.mockReturnValue({ registered: ["obsidian"], skipped: [] });
    await configureCommand({});
    expect(installMCPs).toHaveBeenCalled();
    expect(configureMCPs).toHaveBeenCalledWith(expect.any(String), expect.anything(), "claude-code");
    expect(ensureGitignore).toHaveBeenCalledWith(expect.any(String), [".playwright-mcp/"]);
    expect(registerLocalMCPs).toHaveBeenCalled();
  });

  it("reports skipped servers when none registered", async () => {
    mockedRegister.mockReturnValue({ registered: [], skipped: ["obsidian"] });
    await expect(configureCommand({})).resolves.toBeUndefined();
  });

  it("splits the --mcp option into a server list", async () => {
    await configureCommand({ mcp: "obsidian, playwright" });
    expect(installMCPs).toHaveBeenCalledWith({ servers: ["obsidian", "playwright"] });
  });

  it("prompts for the vault path on a TTY and exports it", async () => {
    (process.stdin as { isTTY?: boolean }).isTTY = true;
    await configureCommand({});
    expect(process.env.OBSIDIAN_VAULT_PATH).toBe("/prompted/vault");
  });

  it("does not prompt when OBSIDIAN_VAULT_PATH is already set", async () => {
    process.env.OBSIDIAN_VAULT_PATH = "/preset/vault";
    (process.stdin as { isTTY?: boolean }).isTTY = true;
    await configureCommand({});
    expect(process.env.OBSIDIAN_VAULT_PATH).toBe("/preset/vault");
  });
});
