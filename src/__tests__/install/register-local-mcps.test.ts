import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

import { registerLocalMCPs } from "../../install/mcp-installer.js";
import { execFileSync } from "node:child_process";
import { DEFAULT_TEMPLATE_VARS } from "../../shared/templates.js";

const mockedExec = vi.mocked(execFileSync);

describe("registerLocalMCPs — registration path", () => {
  const orig = process.env.OBSIDIAN_VAULT_PATH;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
  });

  afterEach(() => {
    if (orig === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = orig;
  });

  it("registers obsidian via `claude mcp add --scope local` with array args", () => {
    const { registered, skipped } = registerLocalMCPs(DEFAULT_TEMPLATE_VARS, "claude-code");
    expect(registered).toContain("obsidian");
    expect(skipped).not.toContain("obsidian");
    expect(mockedExec).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining([
        "mcp", "add", "--scope", "local", "--transport", "stdio", "obsidian",
        "--", "npx", "-y", "mcp-obsidian", "/tmp/vault",
      ]),
      expect.anything(),
    );
  });

  it("marks the server skipped when the claude invocation throws", () => {
    mockedExec.mockImplementationOnce(() => {
      throw new Error("claude: command not found");
    });
    const { registered, skipped } = registerLocalMCPs(DEFAULT_TEMPLATE_VARS, "claude-code");
    expect(registered).not.toContain("obsidian");
    expect(skipped).toContain("obsidian");
  });
});
